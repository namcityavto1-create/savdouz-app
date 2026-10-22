// SavdoUz plus.js — server.js ning yuqorisiga qo'shing:  require('./plus.js');   (features.js dan keyin)
// Qo'shadi:
//  1) Login urinishlarini cheklash (parolni terib topishdan himoya)
//  2) Admin harakatlari jurnali (kim, qachon, nima qilgan)            GET /api/admin/audit
//  3) Sotuvchi "Pulni yechish" so'rovi + admin tasdiqlashi             POST /api/withdrawals, GET /api/withdrawals/mine,
//                                                                      GET /api/admin/withdrawals, PATCH /api/admin/withdrawals/:id
//  4) Ombor kam qolsa (<=3 dona) sotuvchiga bildirishnoma
// Ma'lumotlar asosiy "state" hujjatida saqlanadi (db.withdrawals, db.auditLog) — qo'shimcha kolleksiya kerak emas.
const http = require('http'), crypto = require('crypto'), url = require('url');
const { Readable } = require('stream');
const mongo = require('mongodb');

const ADMIN_PHONE = '+998774071234';
const MIN_WITHDRAW = 10000, MAX_PENDING = 3, AUDIT_MAX = 1000;
const LOGIN_WINDOW = 15 * 60 * 1000, LOGIN_MAX = 5, LOGIN_MAX_IP = 30;
const G = { db: null, col: null, vap: false };
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('sv:' + String(process.env.MONGODB_URI)).digest('hex');
const last9 = s => String(s || '').replace(/\D/g, '').slice(-9);

// ---- server.js dagi asosiy "db" obyektini ushlab olamiz ----
const P = mongo.Collection.prototype, origReplace = P.replaceOne;
P.replaceOne = function (f, doc) {
  if (f && f._id === 'main' && doc && Array.isArray(doc.users)) { G.db = doc; G.col = this; }
  return origReplace.apply(this, arguments);
};
const save = () => G.col.replaceOne({ _id: 'main' }, G.db, { upsert: true });

// ---- Huquqlar (server.js dagi bilan bir xil mantiq) ----
const PERM_ALL = ['sellers', 'balance', 'products', 'buyers', 'orders', 'payments', 'ads', 'admins'];
const isOwner = u => !!u && u.phone === ADMIN_PHONE;
const permsOf = u => isOwner(u) ? PERM_ALL : (Array.isArray(u.perms) ? u.perms : PERM_ALL.filter(k => k !== 'admins'));
const can = (u, k) => !!u && u.role === 'admin' && permsOf(u).includes(k);

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
const parse = buf => { try { return JSON.parse(buf.toString('utf8')) || {}; } catch (e) { return {}; } };
function fake(req, buf) { const f = Readable.from(buf.length ? [buf] : []); f.headers = req.headers; f.method = req.method; f.url = req.url; f.socket = req.socket; return f; }
function capture(res, fn) {
  const wh = res.writeHead.bind(res), en = res.end.bind(res); let st = 200, hd = {};
  res.writeHead = function (s, h) { st = s; hd = h || {}; return res; };
  res.end = function (ch) {
    const body = ch == null ? '' : Buffer.isBuffer(ch) ? ch.toString('utf8') : String(ch);
    Promise.resolve().then(() => fn(st, body)).catch(e => { console.error('plus:', e.message); return body; }).then(out => {
      const h2 = Object.assign({}, hd); delete h2['Content-Length']; wh(st, h2); en(out == null ? body : out);
    });
    return res;
  };
}
const fmt = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";

// ---- Bildirishnoma (FCM + web-push) ----
function notify(userIds, payload) {
  try {
    if (module.exports.onNotify) module.exports.onNotify(userIds, payload);
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
const notifyAdmins = (perm, payload) => notify(G.db.users.filter(u => can(u, perm)).map(u => u.id), payload);

// ============ 1) Login urinishlarini cheklash ============
const fails = new Map(); // kalit -> { n, first }
const ipOf = req => (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || (req.socket && req.socket.remoteAddress) || '?';
function waitMin(key, max) {
  const f = fails.get(key); if (!f) return 0;
  if (Date.now() - f.first > LOGIN_WINDOW) { fails.delete(key); return 0; }
  return f.n >= max ? Math.max(1, Math.ceil((LOGIN_WINDOW - (Date.now() - f.first)) / 60000)) : 0;
}
function addFail(key) {
  const f = fails.get(key);
  if (!f || Date.now() - f.first > LOGIN_WINDOW) fails.set(key, { n: 1, first: Date.now() }); else f.n++;
}
setInterval(() => { const now = Date.now(); for (const [k, f] of fails) if (now - f.first > LOGIN_WINDOW) fails.delete(k); }, 10 * 60 * 1000).unref();

// ============ 2) Admin harakatlari jurnali ============
function describe(M, p, b) {
  let m;
  if ((m = p.match(/^\/api\/admin\/sellers\/(\d+)\/(deposit|withdraw)$/))) {
    const raw = Math.round(Number(b.amount)) || 0, minus = m[2] === 'withdraw' || raw < 0;
    return 'Sotuvchi #' + m[1] + ' balansi: ' + (minus ? '−' : '+') + fmt(Math.abs(raw)) + (b.note ? ' (' + String(b.note).slice(0, 60) + ')' : '');
  }
  if ((m = p.match(/^\/api\/admin\/sellers\/(\d+)\/status$/))) return 'Sotuvchi #' + m[1] + ' holati: ' + b.status;
  if ((m = p.match(/^\/api\/admin\/sellers\/(\d+)$/)) && M === 'DELETE') return "Sotuvchi #" + m[1] + " o'chirildi";
  if ((m = p.match(/^\/api\/admin\/payments\/(\d+)$/))) return "To'lov #" + m[1] + ': ' + b.status + (b.adminNote ? ' (' + String(b.adminNote).slice(0, 60) + ')' : '');
  if ((m = p.match(/^\/api\/admin\/orders\/(\d+)$/))) return 'Buyurtma #' + m[1] + " uchun admin izohi o'zgardi";
  if (p === '/api/admin/ads' && M === 'POST') return "Yangi reklama qo'shildi" + (b.title ? ': ' + String(b.title).slice(0, 60) : '');
  if ((m = p.match(/^\/api\/admin\/ads\/([a-f0-9]+)$/))) return M === 'DELETE' ? "Reklama o'chirildi" : "Reklama o'zgartirildi" + (b.active !== undefined ? (b.active ? ' (yoqildi)' : " (o'chirildi)") : '');
  if (p === '/api/admin/admins' && M === 'POST') return "Yangi admin qo'shildi: " + String(b.name || '').slice(0, 40) + ' ' + String(b.phone || '');
  if ((m = p.match(/^\/api\/admin\/admins\/(\d+)$/))) return M === 'DELETE' ? 'Admin #' + m[1] + " o'chirildi" : 'Admin #' + m[1] + ' huquqlari: ' + (Array.isArray(b.perms) ? b.perms.join(', ') || "yo'q" : '');
  if ((m = p.match(/^\/api\/products\/(\d+)$/)) && M === 'DELETE') return 'Mahsulot #' + m[1] + " admin tomonidan o'chirildi";
  return M + ' ' + p;
}
function audit(admin, text) {
  const db = G.db; if (!db) return;
  db.auditLog = db.auditLog || [];
  db.auditLog.push({ id: Date.now() * 1000 + Math.floor(Math.random() * 1000), at: new Date().toISOString(), adminId: admin.id, adminName: admin.name, text });
  if (db.auditLog.length > AUDIT_MAX) db.auditLog.splice(0, db.auditLog.length - AUDIT_MAX);
  save().catch(e => console.error('audit saqlanmadi:', e.message));
}

// ============ 4) Ombor kam qolsa ogohlantirish ============
const lastLow = new Map();
function lowStock(items) {
  const db = G.db; if (!db) return;
  for (const it of items || []) {
    const p = db.products.find(x => x.id === it.productId); if (!p) continue;
    const st = Number(p.stock) || 0;
    if (st > 3) { lastLow.delete(p.id); continue; }
    if (lastLow.get(p.id) === st) continue;
    lastLow.set(p.id, st);
    notify([p.sellerId], st > 0
      ? { title: 'Omborda kam qoldi ⚡', body: '«' + p.name + '» — faqat ' + st + ' dona qoldi', tag: 'low' + p.id }
      : { title: 'Mahsulot tugadi ❗', body: '«' + p.name + "» tugadi. Omborni to'ldiring", tag: 'low' + p.id });
  }
}

// ============ Asosiy so'rov filtri ============
async function handle(req, res, h) {
  const u = url.parse(req.url, true), p = u.pathname, M = req.method;
  if (!p.startsWith('/api/') || M === 'OPTIONS') return h(req, res);
  let m;

  // --- 1) Login cheklovi ---
  if (p === '/api/login' && M === 'POST') {
    const buf = await readAll(req), b = parse(buf), ip = ipOf(req);
    const k1 = 'p:' + last9(b.phone) + ':' + ip, k2 = 'i:' + ip;
    const w = Math.max(waitMin(k1, LOGIN_MAX), waitMin(k2, LOGIN_MAX_IP));
    if (w) return json(res, 429, { error: "Juda ko'p xato urinish. " + w + " daqiqadan keyin qayta urinib ko'ring" });
    capture(res, (st, body) => { if (st === 401) { addFail(k1); addFail(k2); } else if (st === 200) fails.delete(k1); return body; });
    return h(fake(req, buf), res);
  }

  // --- 3) Pulni yechish so'rovlari ---
  if (p === '/api/withdrawals' && M === 'POST') {
    const s = authUser(req);
    if (!s || s.role !== 'seller') return json(res, 403, { error: "Ruxsat yo'q" });
    if ((s.sellerStatus || 'faol') !== 'faol') return json(res, 403, { error: 'Hisobingiz faol emas' });
    const b = parse(await readAll(req)), a = Math.floor(Number(b.amount)), db = G.db;
    if (!(a >= MIN_WITHDRAW)) return json(res, 400, { error: "Eng kam summa " + fmt(MIN_WITHDRAW) });
    if (!s.card) return json(res, 400, { error: 'Avval profilda karta raqamingizni kiriting' });
    db.withdrawals = db.withdrawals || [];
    const pend = db.withdrawals.filter(w => w.sellerId === s.id && w.status === 'kutilmoqda');
    if (pend.length >= MAX_PENDING) return json(res, 400, { error: "Kutilayotgan so'rovlar ko'p. Avval ular ko'rib chiqilishini kuting" });
    const free = (s.balance || 0) - pend.reduce((x, w) => x + w.amount, 0);
    if (a > free) return json(res, 400, { error: "Balansda yetarli mablag' yo'q (mavjud: " + fmt(Math.max(0, free)) + ')' });
    db.nextId = db.nextId || {}; db.nextId.withdrawal = db.nextId.withdrawal || 1;
    const w = { id: db.nextId.withdrawal++, sellerId: s.id, sellerName: s.name, amount: a, card: { number: s.card.number, holder: s.card.holder }, status: 'kutilmoqda', adminNote: '', createdAt: new Date().toISOString() };
    db.withdrawals.push(w); await save();
    notifyAdmins('balance', { title: "Pul yechish so'rovi 💸", body: s.name + ': ' + fmt(a), tag: 'wd' });
    return json(res, 200, { withdrawal: w });
  }
  if (p === '/api/withdrawals/mine' && M === 'GET') {
    const s = authUser(req);
    if (!s || s.role !== 'seller') return json(res, 403, { error: "Ruxsat yo'q" });
    return json(res, 200, { withdrawals: (G.db.withdrawals || []).filter(w => w.sellerId === s.id).sort((a, b) => b.id - a.id).slice(0, 30) });
  }
  if (p === '/api/admin/withdrawals' && M === 'GET') {
    const a = authUser(req);
    if (!a || a.role !== 'admin') return json(res, 403, { error: 'Faqat admin uchun' });
    if (!can(a, 'balance')) return json(res, 403, { error: "Bu bo'lim uchun huquqingiz yo'q" });
    const list = (G.db.withdrawals || []).slice().sort((x, y) => y.id - x.id).slice(0, 100).map(w => {
      const s = G.db.users.find(x => x.id === w.sellerId);
      return Object.assign({}, w, { sellerBalance: s ? s.balance || 0 : 0, sellerPhone: s ? s.phone : '' });
    });
    return json(res, 200, { withdrawals: list, pending: list.filter(w => w.status === 'kutilmoqda').length });
  }
  if ((m = p.match(/^\/api\/admin\/withdrawals\/(\d+)$/)) && M === 'PATCH') {
    const a = authUser(req);
    if (!a || a.role !== 'admin') return json(res, 403, { error: 'Faqat admin uchun' });
    if (!can(a, 'balance')) return json(res, 403, { error: "Bu bo'lim uchun huquqingiz yo'q" });
    const b = parse(await readAll(req)), db = G.db;
    const w = (db.withdrawals || []).find(x => x.id === Number(m[1]));
    if (!w) return json(res, 404, { error: "So'rov topilmadi" });
    if (w.status !== 'kutilmoqda') return json(res, 400, { error: "Bu so'rov allaqachon ko'rib chiqilgan" });
    if (!['tasdiqlandi', 'rad etildi'].includes(b.status)) return json(res, 400, { error: "Noto'g'ri holat" });
    const s = db.users.find(x => x.id === w.sellerId);
    if (b.status === 'tasdiqlandi') {
      if (!s) return json(res, 404, { error: 'Sotuvchi topilmadi' });
      if ((s.balance || 0) < w.amount) return json(res, 400, { error: "Sotuvchi balansida yetarli mablag' yo'q (bor: " + fmt(s.balance) + ')' });
      s.balance -= w.amount; s.txs = s.txs || [];
      s.txs.push({ id: Date.now(), amount: -w.amount, note: "Pul yechish #" + w.id + ' — kartaga o\'tkazildi', createdAt: new Date().toISOString() });
    }
    w.status = b.status; w.adminNote = String(b.note || '').slice(0, 200); w.doneAt = new Date().toISOString(); w.doneBy = a.id;
    await save();
    audit(a, "Pul yechish #" + w.id + ' (' + w.sellerName + ', ' + fmt(w.amount) + '): ' + b.status);
    notify([w.sellerId], b.status === 'tasdiqlandi'
      ? { title: "Pul kartangizga o'tkazildi ✅", body: fmt(w.amount), tag: 'wd' + w.id }
      : { title: "Pul yechish so'rovi rad etildi", body: w.adminNote || fmt(w.amount), tag: 'wd' + w.id });
    return json(res, 200, { ok: true, withdrawal: w });
  }

  // --- 2) Jurnalni ko'rish ---
  if (p === '/api/admin/audit' && M === 'GET') {
    const a = authUser(req);
    if (!a || a.role !== 'admin') return json(res, 403, { error: 'Faqat admin uchun' });
    if (!can(a, 'admins')) return json(res, 403, { error: "Bu bo'lim uchun huquqingiz yo'q" });
    return json(res, 200, { log: (G.db.auditLog || []).slice(-200).reverse() });
  }

  // --- 2) Admin o'zgartirishlarini jurnalga yozish ---
  if (M !== 'GET' && (p.startsWith('/api/admin/') || (M === 'DELETE' && /^\/api\/products\/\d+$/.test(p)))) {
    const me = authUser(req);
    if (me && me.role === 'admin') {
      const buf = await readAll(req), b = parse(buf);
      capture(res, (st, body) => { if (st === 200) audit(me, describe(M, p, b)); return body; });
      return h(fake(req, buf), res);
    }
  }

  // --- 4) Yangi buyurtmadan keyin ombor tekshiruvi ---
  if (M === 'POST' && p === '/api/orders') {
    capture(res, (st, body) => { if (st === 200) { try { lowStock(JSON.parse(body).order.items); } catch (e) {} } return body; });
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
      console.error('plus xato:', e.message);
      if (!called && !res.headersSent) { try { h(req, res); } catch (x) {} }
    });
  };
  return typeof a === 'function' ? origCreate.call(this, wrap) : origCreate.call(this, a, wrap);
};
console.log("plus.js ulandi ✅ (login cheklovi, admin jurnali, pul yechish, ombor ogohlantirishi)");
