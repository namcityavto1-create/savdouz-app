// SavdoUz cloud-images.js — mahsulot rasmlarini Cloudinary'ga ko'chiradi (baza yengillashadi).
// server.js ning ENG BIRINCHI qatoriga qo'ying:  require('./cloud-images.js');   (courier.js dan ham oldin)
// Render Environment: CLOUDINARY_URL = cloudinary://API_KEY:API_SECRET@CLOUD_NAME
// CLOUDINARY_URL bo'lmasa — hammasi eskicha ishlaydi (hech narsa buzilmaydi).
//
// Nima qiladi:
//  1) Sotuvchi rasm yuklasa (asosiy + qo'shimcha 3 tagacha) — Cloudinary'ga yuboriladi, bazada faqat havola qoladi
//  2) Mahsulot ro'yxatlarida rasm havolasi to'g'ridan-to'g'ri Cloudinary CDN'ga almashtiriladi (f_auto,q_auto — kichik hajm)
//  3) /api/img/:id va /api/img/:id/:i eski manzillari Cloudinary'ga yo'naltiradi (push ikonkalari, eski keshlar uchun)
//  4) Mahsulot o'chirilsa yoki rasm almashsa, eski rasm Cloudinary'dan ham o'chiriladi
//  5) Server ishga tushgach eski (bazadagi) rasmlar avtomatik ko'chiriladi. Oldin zaxira: "pimg_backup" kolleksiyasi
//  6) Owner uchun: GET /api/admin/img-status?t=TOKEN (holat), POST /api/admin/img-migrate (qayta ko'chirish)
const http = require('http'), crypto = require('crypto'), url = require('url');
const { Readable } = require('stream');
const mongo = require('mongodb');

const ADMIN_PHONE = '+998774071234';
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; // server.js "rasm bor" deb hisoblashi uchun
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_IMG = 8e6;
const m0 = /^cloudinary:\/\/([^:@\/]+):([^@]+)@([^\/\s]+)/.exec(String(process.env.CLOUDINARY_URL || '').trim());
const CLOUD = m0 ? { key: m0[1], secret: m0[2], name: m0[3] } : null;
const G = { db: null, col: null, started: false, migrating: false };
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('sv:' + String(process.env.MONGODB_URI)).digest('hex');

// ---- server.js dagi asosiy "db" obyektini ushlab olamiz ----
const P = mongo.Collection.prototype, origReplace = P.replaceOne;
P.replaceOne = function (f, doc) {
  if (f && f._id === 'main' && doc && Array.isArray(doc.users)) { G.db = doc; G.col = this; }
  return origReplace.apply(this, arguments);
};
const save = () => G.col.replaceOne({ _id: 'main' }, G.db, { upsert: true });
let mc = null;
async function col(n) {
  if (!mc) { mc = new mongo.MongoClient(process.env.MONGODB_URI); await mc.connect(); }
  return mc.db('savdouz').collection(n);
}

// ---- Cloudinary ----
const sign = (params, secret) => crypto.createHash('sha1').update(Object.keys(params).sort().map(k => k + '=' + params[k]).join('&') + secret).digest('hex');
const newId = tag => 'savdouz/p' + tag + '_' + crypto.randomBytes(5).toString('hex');
async function cldUpload(dataUrl, publicId) {
  const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), transformation: 'c_limit,w_1600,h_1600' };
  const fd = new FormData();
  fd.append('file', dataUrl); fd.append('api_key', CLOUD.key); fd.append('signature', sign(params, CLOUD.secret));
  for (const k in params) fd.append(k, String(params[k]));
  const r = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD.name + '/image/upload', { method: 'POST', body: fd, signal: AbortSignal.timeout(40000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.secure_url) throw new Error((j.error && j.error.message) || 'Cloudinary xatosi ' + r.status);
  return { url: j.secure_url, id: j.public_id };
}
async function cldDestroy(id) {
  try {
    const params = { public_id: id, timestamp: Math.floor(Date.now() / 1000) };
    const body = new URLSearchParams(Object.assign({}, params, { api_key: CLOUD.key, signature: sign(params, CLOUD.secret) }));
    await fetch('https://api.cloudinary.com/v1_1/' + CLOUD.name + '/image/destroy', { method: 'POST', body, signal: AbortSignal.timeout(20000) });
  } catch (e) { console.error("Cloudinary'dan o'chirib bo'lmadi:", id, e.message); }
}
const destroyMany = ids => { if (CLOUD) ids.filter(Boolean).forEach(cldDestroy); };
// Ro'yxatlarda kichikroq va zamonaviy formatdagi nusxa beriladi (trafik tejaladi)
const opt = u => typeof u === 'string' && u.includes('res.cloudinary.com') && u.includes('/image/upload/') && !/\/image\/upload\/[a-z]_/.test(u) ? u.replace('/image/upload/', '/image/upload/f_auto,q_auto,w_800,c_limit/') : u;
const isImg = x => typeof x === 'string' && x.length < MAX_IMG && IMG_RE.test(x);

// ---- Mahsulot obyektidagi rasm maydonlarini Cloudinary havolalariga almashtirish ----
const cl = pid => G.db && G.db.cloudImgs && G.db.cloudImgs[pid];
function fix(p) {
  if (!p || typeof p !== 'object' || p.id == null) return;
  const c = cl(p.id); if (!c) return;
  const first = c.main ? opt(c.main.url) : p.image;
  if (c.main) p.image = first;
  if (Array.isArray(c.extras)) p.images = [first].concat(c.extras.map(x => opt(x.url))).filter(Boolean);
  else if (c.main && Array.isArray(p.images) && p.images.length) p.images[0] = first;
}
function fixBody(j) { if (Array.isArray(j.products)) j.products.forEach(fix); if (j.product) fix(j.product); }

// ---- Yordamchilar ----
function authUser(req, q) {
  const a = req.headers['authorization'], t = a && a.startsWith('Bearer ') ? a.slice(7) : (q && q.t) || null;
  if (!t || !G.db) return null;
  const [id, exp, sig] = String(t).split('.'); if (!sig) return null;
  const good = crypto.createHmac('sha256', SECRET).update(id + '.' + exp).digest('hex');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)) || Date.now() > Number(exp)) return null;
  return G.db.users.find(u => u.id === Number(id)) || null;
}
const json = (res, st, d) => { res.writeHead(st, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(d)); };
function readAll(req) {
  return new Promise((ok, no) => {
    const c = []; let n = 0;
    req.on('data', d => { n += d.length; if (n > 13e6) { no(new Error('Hajm juda katta')); req.destroy(); } else c.push(d); });
    req.on('end', () => ok(Buffer.concat(c))); req.on('error', no);
  });
}
const parse = buf => { try { return JSON.parse(buf.toString('utf8')) || {}; } catch (e) { return {}; } };
function fake(req, buf) { const f = Readable.from(buf.length ? [buf] : []); f.headers = req.headers; f.method = req.method; f.url = req.url; f.socket = req.socket; return f; }
function capture(res, fn) {
  const wh = res.writeHead.bind(res), en = res.end.bind(res); let st = 200, hd = {};
  res.writeHead = function (s, h) { st = s; hd = h || {}; return res; };
  res.end = function (ch) {
    const body = ch == null ? '' : Buffer.isBuffer(ch) ? ch.toString('utf8') : String(ch);
    Promise.resolve().then(() => fn(st, body)).catch(e => { console.error('cloud-images:', e.message); return body; }).then(out => {
      const h2 = Object.assign({}, hd); delete h2['Content-Length']; wh(st, h2); en(out == null ? body : out);
    });
    return res;
  };
}

// ---- Eski rasmlarni ko'chirish (bir marta; qayta ishga tushsa qolganlarini davom ettiradi) ----
async function migrate() {
  if (!CLOUD || !G.db || G.migrating) return { started: false };
  G.migrating = true;
  const db = G.db; let done = 0, failed = 0, extrasDone = 0;
  try {
    db.cloudImgs = db.cloudImgs || {};
    const todo = db.products.filter(p => typeof p.image === 'string' && p.image.startsWith('data:'));
    if (todo.length) {
      const bk = await col('pimg_backup'); // avval zaxira
      for (const p of todo) await bk.replaceOne({ _id: p.id }, { _id: p.id, image: p.image, at: new Date().toISOString() }, { upsert: true });
      console.log('Rasm ko\'chirish: zaxira olindi (' + todo.length + ' ta), yuklanmoqda…');
      for (const p of todo) {
        try {
          const up = await cldUpload(p.image, newId(p.id));
          const c = db.cloudImgs[p.id] = db.cloudImgs[p.id] || {};
          c.main = { url: up.url, id: up.id }; p.image = up.url; p.imgv = (p.imgv || 0) + 1; done++;
          if (done % 10 === 0) await save();
        } catch (e) { failed++; console.error('Rasm #' + p.id + ' ko\'chmadi:', e.message); }
      }
    }
    // qo'shimcha rasmlar (features.js "pimages" kolleksiyasi)
    let docs = [];
    try { docs = await (await col('pimages')).find({}).toArray(); } catch (e) {}
    for (const d of docs) {
      const prod = db.products.find(p => p.id === d._id); if (!prod) continue;
      const c = db.cloudImgs[d._id] = db.cloudImgs[d._id] || {};
      if (Array.isArray(c.extras)) continue;
      const list = (d.list || []).filter(isImg).slice(0, 3);
      const got = [];
      try { for (const x of list) { const up = await cldUpload(x, newId(d._id)); got.push({ url: up.url, id: up.id }); } }
      catch (e) { destroyMany(got.map(x => x.id)); failed++; console.error('Qo\'shimcha rasm #' + d._id + ' ko\'chmadi:', e.message); continue; }
      c.extras = got; prod.imgv = (prod.imgv || 0) + 1; extrasDone++;
    }
    if (done || extrasDone) await save();
    if (done || extrasDone || failed) console.log('Rasm ko\'chirish tugadi: asosiy ' + done + ', qo\'shimcha ' + extrasDone + ', xato ' + failed);
  } catch (e) { console.error('Ko\'chirish xatosi:', e.message); }
  G.migrating = false;
  return { started: true, done, extrasDone, failed };
}

// ============ Asosiy so'rov filtri ============
async function handle(req, res, h) {
  const u = url.parse(req.url, true), p = u.pathname, M = req.method;
  if (!p.startsWith('/api/') || M === 'OPTIONS') return h(req, res);
  let m;

  // --- Eski rasm manzillari -> Cloudinary ---
  if (M === 'GET' && G.db && (m = p.match(/^\/api\/img\/(\d+)(?:\/(\d+))?$/))) {
    const pid = Number(m[1]), c = cl(pid), prod = G.db.products.find(x => x.id === pid);
    let target = null;
    if (m[2] === undefined) target = c && c.main ? c.main.url : (prod && typeof prod.image === 'string' && prod.image.startsWith('https://') ? prod.image : null);
    else { const x = c && c.extras && c.extras[Number(m[2])]; target = x && x.url; }
    if (target) { res.writeHead(302, { 'Location': opt(target), 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' }); return res.end(); }
    return h(req, res);
  }

  // --- Owner uchun holat va qayta ko'chirish ---
  if (p === '/api/admin/img-status' && M === 'GET') {
    const me = authUser(req, u.query);
    if (!me || me.role !== 'admin' || me.phone !== ADMIN_PHONE) return json(res, 403, { error: 'Faqat asosiy admin uchun' });
    const prods = G.db.products, ci = G.db.cloudImgs || {};
    return json(res, 200, {
      enabled: !!CLOUD, cloud: CLOUD ? CLOUD.name : null, products: prods.length,
      inCloud: prods.filter(x => ci[x.id] && ci[x.id].main).length,
      stillInDb: prods.filter(x => typeof x.image === 'string' && x.image.startsWith('data:')).length,
      extrasInCloud: Object.values(ci).reduce((s, c) => s + ((c.extras || []).length), 0),
      mainDocMB: Math.round(Buffer.byteLength(JSON.stringify(G.db)) / 1048576 * 100) / 100, limitMB: 16, migrating: G.migrating
    });
  }
  if (p === '/api/admin/img-migrate' && M === 'POST') {
    const me = authUser(req, u.query);
    if (!me || me.role !== 'admin' || me.phone !== ADMIN_PHONE) return json(res, 403, { error: 'Faqat asosiy admin uchun' });
    if (!CLOUD) return json(res, 400, { error: "CLOUDINARY_URL sozlanmagan" });
    migrate();
    return json(res, 200, { ok: true, note: "Ko'chirish fonda boshlandi. Holatni img-status orqali kuzating" });
  }

  // --- Mahsulot qo'shish / tahrirlash: rasmlar Cloudinary'ga ---
  if (CLOUD && G.db && ((M === 'POST' && p === '/api/products') || (M === 'PATCH' && (m = p.match(/^\/api\/products\/(\d+)$/))))) {
    const edit = M === 'PATCH', me = authUser(req);
    const prod = edit ? G.db.products.find(x => x.id === Number(m[1])) : null;
    const ok = me && me.role === 'seller' && (edit ? prod && prod.sellerId === me.id : (me.sellerStatus || 'faol') === 'faol');
    if (!ok) return h(req, res); // ruxsat yo'q — server.js o'zi xato qaytaradi, Cloudinary'ga hech narsa yuklanmaydi
    const buf = await readAll(req), b = parse(buf);
    const hasMain = isImg(b.image), clearMain = edit && b.image === null, hasExtras = Array.isArray(b.images);
    if (!hasMain && !clearMain && !hasExtras) return h(fake(req, buf), res);
    const extraImgs = hasExtras ? b.images.filter(isImg).slice(0, 3) : undefined;
    if (hasExtras) delete b.images; // features.js ularni eski kolleksiyaga yozmasin
    const tag = edit ? m[1] : 'new', uploaded = [];
    let main = null, extras;
    const jobs = [];
    if (hasMain) jobs.push(cldUpload(b.image, newId(tag)));
    if (extraImgs) extraImgs.forEach(d => jobs.push(cldUpload(d, newId(tag))));
    const rs = await Promise.allSettled(jobs);
    rs.forEach(r => { if (r.status === 'fulfilled') uploaded.push(r.value.id); });
    const bad = rs.find(r => r.status === 'rejected');
    if (bad) { destroyMany(uploaded); console.error('Rasm yuklanmadi:', bad.reason && bad.reason.message); return json(res, 502, { error: "Rasm yuklanmadi. Qayta urinib ko'ring" }); }
    let i = 0;
    if (hasMain) { main = rs[i++].value; b.image = PLACEHOLDER; }
    if (extraImgs) extras = rs.slice(i).map(r => ({ url: r.value.url, id: r.value.id }));
    capture(res, async (st, body) => {
      if (st !== 200) { destroyMany(uploaded); return body; }
      const j = JSON.parse(body), pr = j.product;
      if (!pr) { destroyMany(uploaded); return body; }
      const db = G.db, dbp = db.products.find(x => x.id === pr.id), old = [];
      db.cloudImgs = db.cloudImgs || {};
      const c = db.cloudImgs[pr.id] = db.cloudImgs[pr.id] || {};
      if (main) { if (c.main) old.push(c.main.id); c.main = { url: main.url, id: main.id }; if (dbp) dbp.image = main.url; }
      else if (clearMain) { if (c.main) old.push(c.main.id); c.main = null; }
      if (extras !== undefined) { (c.extras || []).forEach(x => old.push(x.id)); c.extras = extras; }
      await save(); destroyMany(old);
      fix(pr);
      return JSON.stringify(j);
    });
    return h(fake(req, Buffer.from(JSON.stringify(b))), res);
  }

  // --- Mahsulot o'chirilsa Cloudinary'dan ham o'chadi ---
  if (CLOUD && M === 'DELETE' && (m = p.match(/^\/api\/products\/(\d+)$/))) {
    const pid = Number(m[1]);
    capture(res, async (st, body) => {
      const c = st === 200 && cl(pid);
      if (c) {
        const ids = [c.main && c.main.id].concat((c.extras || []).map(x => x.id));
        delete G.db.cloudImgs[pid]; await save(); destroyMany(ids);
      }
      return body;
    });
    return h(req, res);
  }

  // --- Ro'yxatlarda rasm havolalarini almashtirish ---
  if (M === 'GET' && G.db && G.db.cloudImgs && Object.keys(G.db.cloudImgs).length &&
      (p === '/api/products' || p === '/api/my-products' || p === '/api/favorites' || p === '/api/admin/products' || /^\/api\/sellers\/\d+$/.test(p))) {
    capture(res, (st, body) => { if (st !== 200) return body; const j = JSON.parse(body); fixBody(j); return JSON.stringify(j); });
    return h(req, res);
  }
  return h(req, res);
}

const origCreate = http.createServer;
http.createServer = function (a, b) {
  const h = typeof a === 'function' ? a : b;
  const wrap = (req, res) => {
    let called = false; const once = (q, s) => { called = true; return h(q, s); };
    handle(req, res, once).catch(e => {
      console.error('cloud-images xato:', e.message);
      if (!called && !res.headersSent) { try { h(req, res); } catch (x) {} }
    });
  };
  return typeof a === 'function' ? origCreate.call(this, wrap) : origCreate.call(this, a, wrap);
};

// db yuklangach 20 soniyadan keyin eski rasmlarni ko'chirishni boshlaydi
if (CLOUD) {
  const warm = setInterval(() => {
    if (G.db && !G.started) { G.started = true; clearInterval(warm); setTimeout(migrate, 20000); return; }
    if (!G.db) http.get({ host: '127.0.0.1', port: process.env.PORT || 3000, path: '/api/regions' }, r => r.resume()).on('error', () => {});
  }, 5000);
  warm.unref && warm.unref();
  console.log('Cloudinary ulandi ✅ (' + CLOUD.name + ')');
} else console.log("CLOUDINARY_URL yo'q — rasmlar eski usulda (bazada) saqlanadi");

module.exports = { migrate, sign, opt, _G: G };
