// SavdoUz features.js — server.js ning eng yuqorisiga:  require('./features.js');  qo'shing (courier.js dan keyin).
// Qo'shadi: 1) mahsulotga bir nechta rasm  2) xaridorga buyurtma bildirishnomasi  3) Telegram bot orqali parolni tiklash
//           4) do'konni kuzatish (obuna)   5) savatni eslatish
// Render Environment: TELEGRAM_BOT_TOKEN (parol tiklash uchun), ixtiyoriy RESET_BOT (bot username, @ siz)
const http = require('http'), url = require('url'), crypto = require('crypto');
const { Readable } = require('stream');
const mongo = require('mongodb');

const G = { db: null, col: null, loaded: false, vap: false };
const N = new Map();            // productId -> qo'shimcha rasmlar soni
const cartMap = new Map();      // userId -> { ids, at, reminded }
const resets = new Map();       // oxirgi 9 raqam -> { code, exp, tries, at }
const TG = process.env.TELEGRAM_BOT_TOKEN, RESET_BOT = process.env.RESET_BOT || 'Savol_24bot';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('sv:' + String(process.env.MONGODB_URI)).digest('hex');
const last9 = s => String(s || '').replace(/\D/g, '').slice(-9);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- server.js dagi asosiy "db" obyektini ushlab olamiz (saveDB har safar shu obyektni yozadi) ----
const P = mongo.Collection.prototype, origReplace = P.replaceOne;
P.replaceOne = function (f, doc, o) {
  if (f && f._id === 'main' && doc && Array.isArray(doc.users)) { G.db = doc; G.col = this; }
  return origReplace.apply(this, arguments);
};
const save = () => G.col.replaceOne({ _id: 'main' }, G.db, { upsert: true });

let mc = null;
async function col(n) {
  if (!mc) { mc = new mongo.MongoClient(process.env.MONGODB_URI); await mc.connect(); }
  return mc.db('savdouz').collection(n);
}
async function ensureCounts() {
  if (G.loaded) return; G.loaded = true;
  try { (await (await col('pimages')).find({}, { projection: { n: 1 } }).toArray()).forEach(x => N.set(x._id, x.n || 0)); }
  catch (e) { G.loaded = false; console.error('pimages yuklanmadi:', e.message); }
}
async function setExtras(id, arr) {
  const list = (Array.isArray(arr) ? arr : []).filter(x => typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length < 1600000).slice(0, 3);
  const c = await col('pimages');
  if (list.length) { await c.replaceOne({ _id: id }, { _id: id, n: list.length, list }, { upsert: true }); N.set(id, list.length); }
  else { await c.deleteOne({ _id: id }); N.delete(id); }
  const p = G.db && G.db.products.find(x => x.id === id);
  if (p) { p.imgv = (p.imgv || 0) + 1; save().catch(() => {}); }
}
function aug(p) {
  if (!p || typeof p !== 'object' || p.id == null) return;
  const n = N.get(p.id) || 0;
  p.images = [p.image].concat(Array.from({ length: n }, (_, i) => '/api/img/' + p.id + '/' + i + '?v=' + (p.imgv || 0))).filter(Boolean);
}
function augBody(j) { if (Array.isArray(j.products)) j.products.forEach(aug); if (j.product) aug(j.product); }

// ---- Bildirishnoma (FCM + web-push) ----
function notify(userIds, payload) {
  try {
    const db = G.db; if (!db || !userIds.length) return;
    const ids = new Set(userIds);
    let fa = null; try { fa = require('firebase-admin'); if (!fa.apps.length) fa = null; } catch (e) {}
    if (fa) (db.fcmTokens || []).filter(x => ids.has(x.userId)).forEach(x => {
      fa.messaging().send({
        token: x.token, notification: { title: payload.title, body: payload.body || '' },
        data: { url: '/', tag: payload.tag || 'savdouz' }, android: { priority: 'high', notification: { sound: 'default', tag: payload.tag || 'savdouz' } }
      }).catch(e => { if (e.code === 'messaging/registration-token-not-registered' || e.code === 'messaging/invalid-registration-token') db.fcmTokens = (db.fcmTokens || []).filter(y => y !== x); });
    });
    let wp = null; try { wp = require('web-push'); } catch (e) {}
    if (wp && db.vapid) {
      if (!G.vap) { wp.setVapidDetails('mailto:admin@savdouz.uz', db.vapid.publicKey, db.vapid.privateKey); G.vap = true; }
      (db.pushSubs || []).filter(x => ids.has(x.userId)).forEach(x => wp.sendNotification(x.sub, JSON.stringify(payload)).catch(e => {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) db.pushSubs = (db.pushSubs || []).filter(y => y !== x);
      }));
    }
  } catch (e) { console.error('notify xato:', e.message); }
}
function orderNotify(oid, isPay, status) {
  const o = G.db && G.db.orders.find(x => x.id === oid); if (!o) return;
  const T = isPay
    ? { 'tasdiqlandi': ["To'lovingiz tasdiqlandi 💳", 'Buyurtma №' + oid + ": to'lov qabul qilindi"], 'rad etildi': ['Chek rad etildi ❌', 'Buyurtma №' + oid + ': chekni qayta yuklang'] }
    : { 'tasdiqlandi': ['Buyurtmangiz tasdiqlandi ✅', 'Buyurtma №' + oid + ': sotuvchi tasdiqladi'], 'kuryerga topshirildi': ["Buyurtmangiz yo'lda 🚚", 'Buyurtma №' + oid + ": kuryerga topshirildi. Olgach «Oldim» tugmasini bosing"], 'bekor qilindi': ['Buyurtma bekor qilindi', 'Buyurtma №' + oid + ' bekor qilindi'] };
  const t = T[status]; if (t) notify([o.buyerId], { title: t[0], body: t[1], tag: 'ord' + oid });
}
function followNotify(prod) {
  const db = G.db; if (!db || !prod) return;
  const s = db.users.find(u => u.id === prod.sellerId); if (!s) return;
  const ids = db.users.filter(u => u.role === 'buyer' && (u.following || []).includes(prod.sellerId)).map(u => u.id);
  notify(ids, { title: s.name + " yangi mahsulot qo'shdi", body: prod.name, tag: 'follow' + prod.sellerId });
}

// ---- Yordamchilar ----
function authUser(req) {
  const a = req.headers['authorization'], t = a && a.startsWith('Bearer ') ? a.slice(7) : null;
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
function fake(req, buf) { const f = Readable.from(buf.length ? [buf] : []); f.headers = req.headers; f.method = req.method; f.url = req.url; f.socket = req.socket; return f; }
function capture(res, fn) {
  const wh = res.writeHead.bind(res), en = res.end.bind(res); let st = 200, hd = {};
  res.writeHead = function (s, h) { st = s; hd = h || {}; return res; };
  res.end = function (ch) {
    const body = ch == null ? '' : Buffer.isBuffer(ch) ? ch.toString('utf8') : String(ch);
    Promise.resolve().then(() => fn(st, body)).catch(e => { console.error('features:', e.message); return body; }).then(out => {
      const h2 = Object.assign({}, hd); delete h2['Content-Length']; wh(st, h2); en(out == null ? body : out);
    });
    return res;
  };
}

// ---- Telegram bot: parolni tiklash kodi ----
async function tg(method, body) {
  const r = await fetch('https://api.telegram.org/bot' + TG + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function onTg(m) {
  if (!m || !m.chat) return;
  const chat = m.chat.id, send = (text, extra) => tg('sendMessage', Object.assign({ chat_id: chat, text }, extra || {}));
  if (m.contact) {
    if (!m.from || m.contact.user_id !== m.from.id) return send("Faqat o'zingizning raqamingizni yuboring.");
    if (!G.db) return send("Server hali tayyor emas, 1 daqiqadan keyin urinib ko'ring.");
    const k = last9(m.contact.phone_number);
    const u = G.db.users.find(x => x.role !== 'admin' && last9(x.phone) === k);
    if (!u) return send("Bu raqam SavdoUz'da ro'yxatdan o'tmagan.", { reply_markup: { remove_keyboard: true } });
    const old = resets.get(k);
    if (old && Date.now() - old.at < 60000) return send('Kod allaqachon yuborilgan. 1 daqiqadan keyin qayta urinib ko\'ring.');
    const code = String(crypto.randomInt(100000, 1000000));
    resets.set(k, { code, exp: Date.now() + 10 * 60000, tries: 0, at: Date.now() });
    return send('SavdoUz parolni tiklash kodi: ' + code + '\nKod 10 daqiqa amal qiladi. Uni hech kimga bermang.', { reply_markup: { remove_keyboard: true } });
  }
  return send("Parolni tiklash uchun pastdagi tugmani bosib, telefon raqamingizni yuboring. Bot sizga 6 xonali kod beradi.",
    { reply_markup: { keyboard: [[{ text: '📱 Raqamimni yuborish', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
}
async function tgLoop() {
  if (!TG) { console.log("TELEGRAM_BOT_TOKEN yo'q — Telegram orqali parol tiklash o'chiq"); return; }
  let off = 0; console.log('Telegram parol tiklash boti ishga tushdi ✅');
  for (;;) {
    try {
      const r = await tg('getUpdates', { offset: off, timeout: 25, allowed_updates: ['message'] });
      if (!r.ok) { console.error('Telegram:', r.description); await sleep(r.error_code === 409 ? 30000 : 5000); continue; }
      for (const u of r.result) { off = u.update_id + 1; try { await onTg(u.message); } catch (e) { console.error('Telegram xabar xatosi:', e.message); } }
    } catch (e) { await sleep(5000); }
  }
}
tgLoop();

// ---- Asosiy so'rov filtri ----
async function handle(req, res, h) {
  const u = url.parse(req.url, true), p = u.pathname, M = req.method;
  if (!p.startsWith('/api/') || M === 'OPTIONS') return h(req, res);
  let m;

  // --- o'z yo'llarimiz ---
  if (M === 'GET' && (m = p.match(/^\/api\/img\/(\d+)\/(\d+)$/))) {
    const d = await (await col('pimages')).findOne({ _id: Number(m[1]) });
    const x = d && d.list && d.list[Number(m[2])], g = x && String(x).match(/^data:(.+?);base64,(.*)$/s);
    if (!g) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': g[1], 'Cache-Control': 'public, max-age=31536000' });
    return res.end(Buffer.from(g[2], 'base64'));
  }
  if (p === '/api/tg-reset/info' && M === 'GET') return json(res, 200, { enabled: !!TG, bot: RESET_BOT });
  if (p === '/api/tg-reset/confirm' && M === 'POST') {
    let b = {}; try { b = JSON.parse((await readAll(req)).toString('utf8')); } catch (e) {}
    if (!G.db) return json(res, 503, { error: 'Server tayyorlanmoqda, qayta urinib ko\'ring' });
    const k = last9(b.phone), e = resets.get(k), pw = String(b.password || '');
    if (!k || !e || Date.now() > e.exp) return json(res, 400, { error: "Kod topilmadi yoki muddati o'tgan. Botdan yangi kod oling" });
    if (e.tries >= 5) { resets.delete(k); return json(res, 400, { error: "Juda ko'p xato urinish. Botdan yangi kod oling" }); }
    if (String(b.code || '').trim() !== e.code) { e.tries++; return json(res, 400, { error: "Kod noto'g'ri" }); }
    if (pw.length < 6) return json(res, 400, { error: "Parol kamida 6 ta belgi bo'lsin" });
    const user = G.db.users.find(x => x.role !== 'admin' && last9(x.phone) === k);
    if (!user) return json(res, 404, { error: 'Foydalanuvchi topilmadi' });
    const salt = crypto.randomBytes(16).toString('hex');
    user.salt = salt; user.hash = crypto.scryptSync(pw, salt, 64).toString('hex');
    resets.delete(k); await save();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/follow/toggle' && M === 'POST') {
    const me = authUser(req); if (!me || me.role !== 'buyer') return json(res, 403, { error: "Faqat xaridorlar obuna bo'la oladi" });
    let b = {}; try { b = JSON.parse((await readAll(req)).toString('utf8')); } catch (e) {}
    const sid = Number(b.sellerId);
    if (!G.db.users.some(x => x.id === sid && x.role === 'seller')) return json(res, 404, { error: 'Sotuvchi topilmadi' });
    me.following = me.following || []; const i = me.following.indexOf(sid);
    if (i === -1) me.following.push(sid); else me.following.splice(i, 1);
    await save();
    return json(res, 200, { following: i === -1, followers: G.db.users.filter(x => (x.following || []).includes(sid)).length });
  }
  if (p === '/api/following' && M === 'GET') {
    const me = authUser(req); if (!me) return json(res, 401, { error: 'Tizimga kirilmagan' });
    const sid = Number(u.query.sid);
    return json(res, 200, { ids: me.following || [], followers: sid ? G.db.users.filter(x => (x.following || []).includes(sid)).length : 0 });
  }
  if (p === '/api/cart/sync' && M === 'POST') {
    const me = authUser(req); if (!me || me.role !== 'buyer') return json(res, 403, { error: "Ruxsat yo'q" });
    let b = {}; try { b = JSON.parse((await readAll(req)).toString('utf8')); } catch (e) {}
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 50);
    if (ids.length) cartMap.set(me.id, { ids, at: Date.now(), reminded: false }); else cartMap.delete(me.id);
    return json(res, 200, { ok: true });
  }

  // --- mavjud yo'llarga ulanish ---
  if (M === 'GET' && (p === '/api/products' || p === '/api/my-products' || p === '/api/favorites' || p === '/api/admin/products' || /^\/api\/sellers\/\d+$/.test(p))) {
    await ensureCounts();
    capture(res, (st, b) => { if (st !== 200) return b; const j = JSON.parse(b); augBody(j); return JSON.stringify(j); });
    return h(req, res);
  }
  if ((M === 'POST' && p === '/api/products') || (M === 'PATCH' && (m = p.match(/^\/api\/products\/(\d+)$/)))) {
    await ensureCounts();
    const buf = await readAll(req); let b = null; try { b = JSON.parse(buf.toString('utf8')); } catch (e) {}
    const imgs = b && Array.isArray(b.images) ? b.images : undefined; if (b) delete b.images;
    const edit = !!m;
    capture(res, async (st, body) => {
      if (st !== 200) return body;
      const j = JSON.parse(body), prod = j.product;
      if (prod) { if (imgs !== undefined) await setExtras(prod.id, imgs); aug(prod); if (!edit) followNotify(prod); }
      return JSON.stringify(j);
    });
    return h(fake(req, b ? Buffer.from(JSON.stringify(b)) : buf), res);
  }
  if (M === 'DELETE' && (m = p.match(/^\/api\/products\/(\d+)$/))) {
    const pid = Number(m[1]);
    capture(res, async (st, body) => { if (st === 200) { try { await (await col('pimages')).deleteOne({ _id: pid }); N.delete(pid); } catch (e) {} } return body; });
    return h(req, res);
  }
  if ((M === 'PATCH' && (m = p.match(/^\/api\/orders\/(\d+)\/status$/))) || (M === 'POST' && (m = p.match(/^\/api\/orders\/(\d+)\/payment$/)))) {
    const buf = await readAll(req); let b = {}; try { b = JSON.parse(buf.toString('utf8')); } catch (e) {}
    const oid = Number(m[1]), isPay = /payment$/.test(p);
    capture(res, (st, body) => { if (st === 200) orderNotify(oid, isPay, b.status); return body; });
    return h(fake(req, buf), res);
  }
  if (M === 'POST' && p === '/api/orders') {
    capture(res, (st, body) => { if (st === 200) { const me = authUser(req); if (me) cartMap.delete(me.id); } return body; });
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
      console.error('features xato:', e.message);
      if (!called && !res.headersSent) { try { h(req, res); } catch (x) {} }
    });
  };
  return typeof a === 'function' ? origCreate.call(this, wrap) : origCreate.call(this, a, wrap);
};

// db yuklanishi uchun bir marta ichki so'rov (xaridor birinchi bo'lib kirsa ham ishlashi uchun)
const warm = setInterval(() => {
  if (G.db) return clearInterval(warm);
  http.get({ host: '127.0.0.1', port: process.env.PORT || 3000, path: '/api/regions' }, r => r.resume()).on('error', () => {});
}, 5000);

// Savat eslatmasi: 3 soatdan keyin bir marta
setInterval(() => {
  const db = G.db; if (!db) return; const now = Date.now();
  for (const [uid, c] of cartMap) {
    if (now - c.at > 48 * 36e5) { cartMap.delete(uid); continue; }
    if (c.reminded || now - c.at < 3 * 36e5) continue;
    const names = c.ids.map(id => db.products.find(p => p.id === id && p.stock > 0)).filter(Boolean).map(p => p.name);
    if (!names.length) { cartMap.delete(uid); continue; }
    c.reminded = true;
    notify([uid], { title: 'Savatingizda mahsulot qoldi 🛒', body: names[0] + (names.length > 1 ? ' va yana ' + (names.length - 1) + ' ta' : '') + ' sizni kutmoqda', tag: 'cart' });
  }
}, 10 * 60 * 1000);
