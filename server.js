// SavdoUz backend v4 — MongoDB Atlas + hafta chegirmasi + ovozli/push bildirishnoma + sotuvchini admin tasdiqlashi
require('./courier.js');
require('./pwa-patch.js');
require('./extras.js');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), url = require('url');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) console.error("XATO: MONGODB_URI topilmadi. Render Environment'ga qo'shing.");
const mongoClient = new MongoClient(MONGODB_URI);
let stateCollection, cache = null, adminDone = false;
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('sv:' + String(MONGODB_URI)).digest('hex');

const COMMISSION_RATE = 0.01;
const PAYOUT_CARD = { number: "9860 1901 0557 8776", name: "IZZATILLO V." };
const DEBT_LIMIT = 10000;
const ADMIN_PHONE = '+998774071234';
const WEEK = 7 * 864e5;
const CAT_ICON = { "Telefon": "phone", "Kompyuter": "laptop", "Elektronika": "laptop", "Maishiy texnika": "laptop", "Kiyim": "shirt", "Poyabzal": "shirt", "Aksessuarlar": "shirt", "Go'zallik": "shirt", "Oziq-ovqat": "sofa", "Uy-ro'zg'or": "sofa", "Mebel": "sofa", "Bolalar": "shirt", "Sport": "shirt", "Avto": "car", "Qurilish": "car", "Kitob": "laptop", "Boshqa": "laptop" };
const REGIONS = ["Toshkent shahri", "Toshkent viloyati", "Andijon", "Farg'ona", "Namangan", "Buxoro", "Jizzax", "Qashqadaryo", "Navoiy", "Samarqand", "Sirdaryo", "Surxondaryo", "Xorazm", "Qoraqalpog'iston"];
class UserErr extends Error {}

// ---------- Push-bildirishnoma (ilova yopiq bo'lsa ham telefon ovozi bilan xabar) ----------
let webpush = null;
try { webpush = require('web-push'); } catch (e) { console.error("web-push o'rnatilmagan: push o'chiq. package.json ga \"web-push\" qo'shing"); }
let vapidReady = false;
function pushInit(db) {
  if (!webpush) return false;
  let created = false;
  if (!db.vapid) { db.vapid = webpush.generateVAPIDKeys(); created = true; }
  if (!vapidReady) { webpush.setVapidDetails('mailto:admin@savdouz.uz', db.vapid.publicKey, db.vapid.privateKey); vapidReady = true; }
  return created;
}
function pushNotify(db, userIds, payload) {
  try {
    if (!webpush) return;
    pushInit(db);
    const ids = new Set(userIds);
    (db.pushSubs || []).filter(x => ids.has(x.userId)).forEach(x => {
      webpush.sendNotification(x.sub, JSON.stringify(payload)).catch(e => {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) db.pushSubs = (db.pushSubs || []).filter(y => y !== x);
      });
    });
  } catch (e) { console.error('push xato:', e.message); }
}
const pushAdmins = (db, payload) => pushNotify(db, db.users.filter(u => u.role === 'admin').map(u => u.id), payload);
const SW_JS = String.raw`self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data.json(); } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'SavdoUz', {
    body: d.body || '', tag: d.tag || 'savdouz', renotify: true,
    vibrate: [200, 100, 200, 100, 200], data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
    for (var i = 0; i < l.length; i++) if ('focus' in l[i]) return l[i].focus();
    return self.clients.openWindow('/');
  }));
});`;

async function connectMongo() {
  await mongoClient.connect();
  stateCollection = mongoClient.db('savdouz').collection('state');
  console.log('MongoDB ulanish muvaffaqiyatli ✅');
}

// ---------- Baza ----------
async function loadDB() {
  if (cache) return cache;
  let db = await stateCollection.findOne({ _id: 'main' });
  if (!db) db = { _id: 'main', users: [], products: [], orders: [], payments: [], reviews: [], messages: [], nextId: {} };
  db.nextId = db.nextId || {};
  for (const k of ['user', 'product', 'order', 'payment', 'review', 'message']) if (!db.nextId[k]) db.nextId[k] = 1;
  for (const k of ['users', 'products', 'orders', 'payments', 'reviews', 'messages']) if (!db[k]) db[k] = [];
  db.users.forEach(u => {
    if (u.paidCommission === undefined) u.paidCommission = 0;
    if (!u.favorites) u.favorites = [];
    if (u.role === 'seller') {
      if (!u.accountNumber) u.accountNumber = 'SU' + String(u.id).padStart(8, '0');
      if (u.balance === undefined) u.balance = 0;
      if (!u.txs) u.txs = [];
      // Eski sotuvchilar avtomatik tasdiqlangan hisoblanadi (to'xtab qolmasin)
      if (!u.sellerStatus) u.sellerStatus = 'faol';
    }
  });
  db.products.forEach(p => {
    if (p.deliveryRegions === undefined) p.deliveryRegions = (p.deliveryAvailable === false) ? [] : ['barchasi'];
    if (p.deliveryPrice === undefined) p.deliveryPrice = 0;
    if (p.oldPrice === undefined) p.oldPrice = null;
    if (p.salePrice === undefined) { p.salePrice = null; p.saleEndsAt = null; }
  });
  db.orders.forEach(o => {
    if (!o.paymentMethod || o.paymentMethod === 'naqd/yetkazishda') o.paymentMethod = 'naqd';
    if (!o.paymentStatus) o.paymentStatus = 'naqd';
    if (o.status !== 'yetkazildi' && o.status !== 'bekor qilindi') o.items.forEach(it => { if (it.charge === undefined) it.charge = true; });
  });
  await ensureAdmin(db);
  await saveDB(db);
  cache = db;
  return db;
}
async function saveDB(db) { await stateCollection.replaceOne({ _id: 'main' }, db, { upsert: true }); }

// ---------- Parol va token ----------
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function verifyPassword(password, salt, hash) { return crypto.scryptSync(password, salt, 64).toString('hex') === hash; }
const sign = p => crypto.createHmac('sha256', SECRET).update(p).digest('hex');
function makeToken(id) { const p = id + '.' + (Date.now() + 30 * 864e5); return p + '.' + sign(p); }
function getUserFromReq(req, db) {
  const a = req.headers['authorization'];
  const t = a && a.startsWith('Bearer ') ? a.slice(7) : (req._q && req._q.t);
  if (!t) return null;
  const [id, exp, sig] = String(t).split('.');
  if (!sig) return null;
  const good = sign(id + '.' + exp);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Date.now() > Number(exp)) return null;
  return db.users.find(u => u.id === Number(id)) || null;
}

async function ensureAdmin(db) {
  if (adminDone) return; adminDone = true;
  const pw = process.env.ADMIN_PASSWORD;
  let a = db.users.find(u => u.phone === ADMIN_PHONE);
  if (!a) {
    if (!pw) { console.error("ADMIN_PASSWORD yo'q — admin yaratilmadi"); return; }
    const h = hashPassword(pw);
    db.users.push({ id: db.nextId.user++, name: 'Admin', phone: ADMIN_PHONE, role: 'admin', salt: h.salt, hash: h.hash, paidCommission: 0 });
  } else {
    a.role = 'admin';
    if (pw) { const h = hashPassword(pw); a.salt = h.salt; a.hash = h.hash; }
  }
}
const requireAdmin = (req, db) => { const u = getUserFromReq(req, db); return u && u.role === 'admin' ? u : null; };

// ---------- Yordamchilar ----------
function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 12e6) { reject(new UserErr('Hajm juda katta')); req.destroy(); } });
    req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch (e) { reject(new UserErr("Noto'g'ri so'rov")); } });
  });
}
// Sotuvchi holati: 'kutilmoqda' (admin tasdiqlamagan), 'faol' (tasdiqlangan), 'rad etildi' (rad/blok)
const sellerStatusOf = u => u.sellerStatus || 'faol';
const publicUser = u => {
  const r = { id: u.id, name: u.name, phone: u.phone, role: u.role };
  if (u.role === 'seller') r.sellerStatus = sellerStatusOf(u);
  return r;
};
const isSellerActive = (db, sid) => { const s = db.users.find(u => u.id === sid && u.role === 'seller'); return !!s && sellerStatusOf(s) === 'faol'; };

// ---- Hafta chegirmasi: 7 kundan keyin o'zi tugaydi (vaqt tekshiriladi, qo'shimcha ish kerak emas) ----
const saleActive = p => p.salePrice > 0 && p.saleEndsAt && Date.now() < new Date(p.saleEndsAt).getTime();
const curPrice = p => saleActive(p) ? p.salePrice : p.price;
function applySale(p, b) {
  if (b.saleOn === undefined) return;
  const sp = Number(b.salePrice);
  if (b.saleOn && sp > 0 && sp < p.price) {
    if (!saleActive(p)) p.saleEndsAt = new Date(Date.now() + WEEK).toISOString();
    p.salePrice = sp;
  } else { p.salePrice = null; p.saleEndsAt = null; }
}
// Ro'yxatlarda rasm matni emas, qisqa havola yuboriladi
const pub = p => {
  const on = saleActive(p);
  return {
    ...p, image: p.image ? `/api/img/${p.id}?v=${p.imgv || 0}` : null,
    regularPrice: p.price, price: on ? p.salePrice : p.price, oldPrice: on ? p.price : p.oldPrice,
    onSale: !!on, daysLeft: on ? Math.max(1, Math.ceil((new Date(p.saleEndsAt).getTime() - Date.now()) / 864e5)) : 0
  };
};
const initials = n => String(n || '').trim().split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + '.').join(' ');
function ordOut(o, db) {
  const { receiptImage, ...r } = o;
  const sellers = [...new Set(o.items.map(i => i.sellerId))].map(id => {
    const s = db.users.find(u => u.id === id);
    return s ? { id: s.id, name: s.name, phone: s.phone, card: s.card ? { number: s.card.number, holder: initials(s.card.holder) } : null } : null;
  }).filter(Boolean);
  return { ...r, hasReceipt: !!receiptImage, sellers };
}
function sellerItems(db, sid, deliveredOnly) {
  return db.orders.filter(o => !deliveredOnly || o.status === 'yetkazildi').flatMap(o => o.items.filter(it => it.sellerId === sid));
}
// To'langan komissiya = admin tasdiqlagan to'lovlar + buyurtmalardan balansdan yechilgan summa
function commissionPaid(db, sid) {
  const u = db.users.find(x => x.id === sid);
  return (u ? u.paidCommission || 0 : 0) + sellerItems(db, sid, true).reduce((s, it) => s + (it.balancePaid || 0), 0);
}
function computeSellerDebt(db, sid) {
  const c = sellerItems(db, sid, true).reduce((s, it) => s + (it.commission || 0), 0);
  return c - commissionPaid(db, sid);
}
function settle(db, s) {
  if (!s.txs) s.txs = [];
  // 1) Har bir yetkazilgan buyurtma komissiyasi (1%) birinchi navbatda sotuvchi balansidan yechiladi
  for (const o of db.orders) {
    if (o.status !== 'yetkazildi' || (s.balance || 0) <= 0) continue;
    let took = 0;
    for (const it of o.items) {
      if (it.sellerId !== s.id || !it.charge) continue;
      const t = Math.min(s.balance || 0, (it.commission || 0) - (it.balancePaid || 0));
      if (t > 0) { s.balance -= t; it.balancePaid = (it.balancePaid || 0) + t; took += t; }
    }
    if (took > 0) s.txs.push({ id: Date.now() + o.id, amount: -took, note: 'Buyurtma #' + o.id + ' komissiyasi (1%) yechildi', createdAt: new Date().toISOString() });
  }
  // 2) Eski buyurtmalardan qolgan qarz bo'lsa — shuni ham balansdan yechamiz
  const take = Math.min(s.balance || 0, Math.max(0, computeSellerDebt(db, s.id)));
  if (take > 0) {
    s.balance -= take; s.paidCommission = (s.paidCommission || 0) + take;
    s.txs.push({ id: Date.now(), amount: -take, note: 'Komissiya hisobdan yechildi', createdAt: new Date().toISOString() });
  }
}
const deliversTo = (p, region) => (p.deliveryRegions || []).some(r => r === 'barchasi' || r === region);
const ratingOf = (db, pid) => { const r = db.reviews.filter(x => x.productId === pid); return { avgRating: r.length ? r.reduce((s, x) => s + x.rating, 0) / r.length : 0, reviewCount: r.length }; };

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
// Logotip public/sv-192.png fayldan olinadi. index.html dagi "const LOGO = ..." qatori avtomatik shu bilan almashtiriladi.
const LOGO_DATA = '/sv-192.png';
const LOGO_LINE = "const LOGO = '" + LOGO_DATA + "';";
// Admin uchun "Balansdan ayirish / qo'shish" oynasi, logotipni to'g'rilovchi kod va ovozli/push bildirishnoma — sahifaga avtomatik qo'shiladi
const EXTRA_HTML = String.raw`<script>
(function () {
  var LOGO = "__LOGO__";
  function fixLogo() {
    var l = document.querySelectorAll('img.logo,img.authlogo');
    for (var i = 0; i < l.length; i++) if (l[i].getAttribute('src') !== LOGO) l[i].setAttribute('src', LOGO);
  }
  try { new MutationObserver(fixLogo).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  fixLogo();

  var tok = null, checkedTok = null, isAdmin = false, ofetch = window.fetch;
  function grab(h) {
    try {
      if (!h) return;
      var a = (typeof h.get === 'function') ? h.get('Authorization') : (h.Authorization || h.authorization);
      if (a && /^Bearer /.test(a)) tok = a.slice(7);
    } catch (e) {}
  }
  window.fetch = function (input, init) {
    try { if (init && init.headers) grab(init.headers); else if (input && input.headers) grab(input.headers); } catch (e) {}
    return ofetch.apply(this, arguments);
  };
  function api(method, path, body) {
    return ofetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
  }
  function fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm"; }
  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; }

  var btn = el('button', 'position:fixed;right:14px;bottom:100px;width:52px;height:52px;border-radius:50%;border:none;background:#F23557;color:#fff;font-size:26px;font-weight:800;box-shadow:0 8px 20px -6px rgba(242,53,87,.6);z-index:50;display:none;', '±');
  document.body.appendChild(btn);
  var overlay = el('div', 'position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(21,15,46,.55);z-index:60;display:none;align-items:center;justify-content:center;padding:16px;');
  var box = el('div', 'background:#fff;border-radius:22px;padding:18px;width:100%;max-width:380px;max-height:90vh;overflow:auto;font-family:-apple-system,Segoe UI,sans-serif;color:#150F2E;');
  overlay.appendChild(box); document.body.appendChild(overlay);
  var inputCss = 'width:100%;padding:12px 14px;border-radius:14px;border:1.5px solid #ECE9F5;font-size:14px;margin-bottom:10px;box-sizing:border-box;';
  var sel = el('select', inputCss), amt = el('input', inputCss), note = el('input', inputCss), msg = el('div', 'font-size:12.5px;margin:6px 0 10px;font-weight:700;min-height:16px;');
  amt.setAttribute('inputmode', 'numeric'); amt.placeholder = "Summa (so'm), masalan: 5000";
  note.placeholder = 'Izoh (ixtiyoriy)';
  var row = el('div', 'display:flex;gap:8px;');
  var bMinus = el('button', 'flex:1;border:none;border-radius:14px;padding:13px;background:#F23557;color:#fff;font-weight:800;font-size:14px;', '− Ayirish');
  var bPlus = el('button', 'flex:1;border:none;border-radius:14px;padding:13px;background:#1E7E34;color:#fff;font-weight:800;font-size:14px;', '+ Qo\u2018shish');
  var bClose = el('button', 'width:100%;margin-top:10px;border:none;border-radius:14px;padding:11px;background:#F1EDFE;color:#4E2FD9;font-weight:800;font-size:13px;', 'Yopish');
  row.appendChild(bMinus); row.appendChild(bPlus);
  box.appendChild(el('div', 'font-size:17px;font-weight:800;margin-bottom:12px;', 'Sotuvchi balansi'));
  box.appendChild(sel); box.appendChild(amt); box.appendChild(note); box.appendChild(msg); box.appendChild(row); box.appendChild(bClose);

  var sellers = [];
  function setMsg(t, good) { msg.textContent = t; msg.style.color = good ? '#1E7E34' : '#F23557'; }
  function loadSellers(keep) {
    return api('GET', '/api/admin/sellers').then(function (r) {
      if (!r.ok) { setMsg(r.data.error || 'Xato', false); return; }
      sellers = r.data.sellers || [];
      var cur = keep ? sel.value : '';
      sel.innerHTML = '';
      sellers.forEach(function (s) {
        var o = document.createElement('option'); o.value = s.id;
        o.textContent = s.name + ' — balans: ' + fmt(s.balance); sel.appendChild(o);
      });
      if (cur) sel.value = cur;
      if (!sellers.length) setMsg("Sotuvchilar yo'q", false);
    });
  }
  function submit(kind) {
    var a = parseInt(String(amt.value).replace(/\D/g, ''), 10);
    if (!sel.value) return setMsg('Sotuvchini tanlang', false);
    if (!a || a <= 0) return setMsg("Summani to'g'ri kiriting (faqat raqam)", false);
    var s = sellers.filter(function (x) { return String(x.id) === sel.value; })[0];
    var q = (kind === 'withdraw' ? 'Balansdan ayiramizmi: ' : "Balansga qo'shamizmi: ") + fmt(a) + '\n' + (s ? s.name : '');
    if (!window.confirm(q)) return;
    bMinus.disabled = bPlus.disabled = true;
    api('POST', '/api/admin/sellers/' + sel.value + '/' + kind, { amount: a, note: note.value.trim() || undefined })
      .then(function (r) {
        bMinus.disabled = bPlus.disabled = false;
        if (!r.ok) return setMsg(r.data.error || 'Xato', false);
        setMsg('Bajarildi. Yangi balans: ' + fmt(r.data.balance), true);
        amt.value = ''; note.value = ''; loadSellers(true);
      }).catch(function () { bMinus.disabled = bPlus.disabled = false; setMsg('Tarmoq xatosi', false); });
  }
  bMinus.onclick = function () { submit('withdraw'); };
  bPlus.onclick = function () { submit('deposit'); };
  bClose.onclick = function () { overlay.style.display = 'none'; };
  btn.onclick = function () { setMsg('', true); overlay.style.display = 'flex'; loadSellers(false); };

  setInterval(function () {
    if (document.querySelector('.authwrap')) { tok = null; checkedTok = null; isAdmin = false; btn.style.display = 'none'; overlay.style.display = 'none'; return; }
    if (tok && tok !== checkedTok) {
      checkedTok = tok;
      api('GET', '/api/admin/sellers').then(function (r) { isAdmin = r.ok; btn.style.display = isAdmin ? 'block' : 'none'; }).catch(function () {});
    }
  }, 1200);

  // ---- Ovozli bildirishnoma (ilova ochiq paytda) ----
  var ac = null;
  function unlock() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) {}
  }
  ['click', 'touchstart', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlock, { passive: true }); });
  function beep(kind) {
    try {
      unlock(); if (!ac) return;
      var notes = kind === 'money' ? [660, 880, 1100] : [880, 660, 880, 660];
      notes.forEach(function (f, i) {
        var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * 0.22;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.22);
      });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (e) {}
  }
  var nTok = null, nRole = null, seenOrd = null, seenBal = null, seenPay = null;
  function maxId(a) { return a.reduce(function (m, x) { return x.id > m ? x.id : m; }, 0); }
  setInterval(function () {
    if (!tok) { nTok = null; nRole = null; return; }
    if (nTok !== tok) {
      nTok = tok; nRole = null; seenOrd = seenBal = seenPay = null;
      api('GET', '/api/me').then(function (r) { if (r.ok) nRole = r.data.user.role; }).catch(function () {});
      return;
    }
    if (nRole === 'seller') {
      api('GET', '/api/orders/incoming').then(function (r) {
        if (!r.ok) return;
        var m = maxId(r.data.orders || []);
        if (seenOrd !== null && m > seenOrd) beep('order');
        seenOrd = m;
      }).catch(function () {});
      api('GET', '/api/account').then(function (r) {
        if (!r.ok) return;
        var b = r.data.balance || 0;
        if (seenBal !== null && b > seenBal) beep('money');
        seenBal = b;
      }).catch(function () {});
    } else if (nRole === 'admin') {
      api('GET', '/api/admin/payments').then(function (r) {
        if (!r.ok) return;
        var m = maxId(r.data.payments || []);
        if (seenPay !== null && m > seenPay) beep('money');
        seenPay = m;
      }).catch(function () {});
    }
  }, 8000);

  // ---- Push-bildirishnoma (ilova yopiq bo'lsa ham telefon ovozi bilan xabar) ----
  function b64u(s) {
    var p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(r.length);
    for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i);
    return a;
  }
  var pushDone = null, pushBusy = false;
  function setupPush() {
    if (pushBusy || !tok || (nRole !== 'seller' && nRole !== 'admin') || pushDone === tok) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !window.Notification) return;
    var t = tok; pushBusy = true;
    Promise.resolve(Notification.permission === 'default' ? Notification.requestPermission() : Notification.permission).then(function (p) {
      if (p !== 'granted') return;
      return navigator.serviceWorker.register('/sw.js')
        .then(function () { return navigator.serviceWorker.ready; })
        .then(function (reg) {
          return api('GET', '/api/push/key').then(function (k) {
            if (!k.ok || !k.data.key) return;
            return reg.pushManager.getSubscription()
              .then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(k.data.key) }); })
              .then(function (sub) { return api('POST', '/api/push/subscribe', { subscription: JSON.parse(JSON.stringify(sub)) }); })
              .then(function (r) { if (r.ok) pushDone = t; });
          });
        });
    }).catch(function () {}).then(function () { pushBusy = false; });
  }
  document.addEventListener('click', setupPush);
  setInterval(setupPush, 20000);
})();
</script>`;
function injectLogo(buf) {
  let html = buf.toString('utf8').replace(/const LOGO\s*=\s*(['"`])[\s\S]*?\1\s*;?/, () => LOGO_LINE);
  const extra = EXTRA_HTML.split('__LOGO__').join(LOGO_DATA);
  const i = html.lastIndexOf('</body>');
  html = i === -1 ? html + extra : html.slice(0, i) + extra + html.slice(i);
  return Buffer.from(html);
}
function serveStatic(req, res, pathname) {
  if (pathname === '/sw.js') { res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' }); return res.end(SW_JS); }
  const filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, c2) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(injectLogo(c2));
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(path.basename(filePath) === 'index.html' ? injectLogo(content) : content);
  });
}
function sendDataImage(res, dataUrl, cacheCtl) {
  const d = dataUrl && String(dataUrl).match(/^data:(.+?);base64,(.*)$/s);
  if (!d) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': d[1], 'Cache-Control': cacheCtl });
  res.end(Buffer.from(d[2], 'base64'));
}
let usdCache = { t: 0, data: null };
async function getUsd() {
  if (usdCache.data && Date.now() - usdCache.t < 5 * 60 * 1000) return usdCache.data;
  let data = null;
  try {
    const list = await (await fetch('https://nbu.uz/uz/exchange-rates/json/')).json();
    const d = list.find(x => x.code === 'USD');
    const buy = Math.round(parseFloat(d.nbu_buy_price)), sell = Math.round(parseFloat(d.nbu_cell_price));
    if (buy && sell) data = { rate: Math.round((buy + sell) / 2), buy, sell };
  } catch (e) {}
  if (!data) {
    try {
      const [d] = await (await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/')).json();
      const rate = Math.round(parseFloat(d.Rate));
      if (rate) data = { rate, buy: rate - 50, sell: rate + 50 };
    } catch (e) {}
  }
  if (data) usdCache = { t: Date.now(), data };
  return data || usdCache.data;
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  req._q = parsed.query;
  if (req.method === 'OPTIONS') return sendJSON(res, 200, {});
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  try {
    const db = await loadDB();
    const me = () => getUserFromReq(req, db);
    const M = req.method;
    let m;
    if (pathname === '/api/kurs' && M === 'GET') {
      const d = await getUsd();
      return d ? sendJSON(res, 200, d) : sendJSON(res, 503, { error: 'Kurs olinmadi' });
    }

    // ---- Push obuna ----
    if (pathname === '/api/push/key' && M === 'GET') {
      if (!webpush) return sendJSON(res, 503, { error: "Push o'chiq" });
      if (pushInit(db)) await saveDB(db);
      return sendJSON(res, 200, { key: db.vapid.publicKey });
    }
    if (pathname === '/api/push/subscribe' && M === 'POST') {
      const u = me(); if (!u) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      const { subscription } = await readBody(req);
      if (!subscription || !subscription.endpoint) return sendJSON(res, 400, { error: "Noto'g'ri obuna" });
      db.pushSubs = (db.pushSubs || []).filter(x => x.sub.endpoint !== subscription.endpoint);
      db.pushSubs.push({ userId: u.id, sub: subscription });
      await saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }

    if ((m = pathname.match(/^\/api\/img\/(\d+)$/)) && M === 'GET') {
      const p = db.products.find(x => x.id === Number(m[1]));
      return sendDataImage(res, p && p.image, 'public, max-age=31536000');
    }
    if ((m = pathname.match(/^\/api\/receipt\/(\d+)$/)) && M === 'GET') {
      const u = me(); const o = db.orders.find(x => x.id === Number(m[1]));
      if (!u || !o || !(o.buyerId === u.id || u.role === 'admin' || o.items.some(i => i.sellerId === u.id))) { res.writeHead(403); return res.end(); }
      return sendDataImage(res, o.receiptImage, 'private, max-age=3600');
    }

    if (pathname === '/api/regions' && M === 'GET') return sendJSON(res, 200, { regions: REGIONS });

    if ((m = pathname.match(/^\/api\/sellers\/(\d+)$/)) && M === 'GET') {
      const sid = Number(m[1]);
      const seller = db.users.find(u => u.id === sid && u.role === 'seller');
      if (!seller) return sendJSON(res, 404, { error: "Sotuvchi topilmadi" });
      const rq = me(); const fav = new Set(rq ? rq.favorites || [] : []);
      const hidden = sellerStatusOf(seller) !== 'faol' || computeSellerDebt(db, sid) > DEBT_LIMIT;
      const products = hidden ? [] : db.products.filter(p => p.sellerId === sid).map(p => ({ ...pub(p), sellerName: seller.name, ...ratingOf(db, p.id), isFavorited: fav.has(p.id) }));
      return sendJSON(res, 200, { seller: { id: seller.id, name: seller.name }, products });
    }

    // ---- Kirish / ro'yxat ----
    if (pathname === '/api/register' && M === 'POST') {
      const { name, phone, password, role, idDoc, selfie } = await readBody(req);
      if (!name || !phone || !password || !role) return sendJSON(res, 400, { error: "Barcha maydonlarni to'ldiring" });
      if (!['buyer', 'seller'].includes(role)) return sendJSON(res, 400, { error: "Noto'g'ri rol" });
      if (role === 'seller' && (!String(idDoc || '').startsWith('data:') || !String(selfie || '').startsWith('data:'))) return sendJSON(res, 400, { error: "Pasport yoki ID karta va selfi rasmini yuklang" });
      if (db.users.find(u => u.phone === phone)) return sendJSON(res, 400, { error: "Bu raqam allaqachon ro'yxatdan o'tgan" });
      const { salt, hash } = hashPassword(password);
      const user = { id: db.nextId.user++, name, phone, role, salt, hash, paidCommission: 0, favorites: [] };
      if (role === 'seller') {
        user.accountNumber = 'SU' + String(user.id).padStart(8, '0'); user.balance = 0; user.txs = [];
        user.sellerStatus = 'kutilmoqda'; // admin tasdiqlamaguncha mahsulot qo'sha olmaydi
      }
      db.users.push(user);
      if (role === 'seller') await mongoClient.db('savdouz').collection('sellerdocs').replaceOne({ _id: user.id }, { _id: user.id, idDoc, selfie, createdAt: new Date().toISOString() }, { upsert: true });
      await saveDB(db);
      if (role === 'seller') pushAdmins(db, { title: 'Yangi sotuvchi', body: user.name + ' tasdiqlashni kutmoqda', tag: 'seller' });
      return sendJSON(res, 200, { token: makeToken(user.id), user: publicUser(user) });
    }
    if (pathname === '/api/login' && M === 'POST') {
      const { phone, password } = await readBody(req);
      const user = db.users.find(u => u.phone === phone);
      if (!user || !verifyPassword(password || '', user.salt, user.hash)) return sendJSON(res, 401, { error: "Telefon raqam yoki parol xato" });
      return sendJSON(res, 200, { token: makeToken(user.id), user: publicUser(user) });
    }
    if (pathname === '/api/me' && M === 'GET') {
      const u = me(); if (!u) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      return sendJSON(res, 200, { user: publicUser(u) });
    }

    // ---- Sotuvchi hisobi va kartasi ----
    if (pathname === '/api/account' && M === 'GET') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      return sendJSON(res, 200, { accountNumber: u.accountNumber, balance: u.balance || 0, card: u.card || null, transactions: (u.txs || []).slice(-20).reverse() });
    }
    if (pathname === '/api/me/card' && M === 'PATCH') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const { number, holder } = await readBody(req);
      const digits = String(number || '').replace(/\D/g, '');
      if (digits.length !== 16) return sendJSON(res, 400, { error: "Karta raqami 16 ta raqam bo'lishi kerak" });
      if (!holder || !String(holder).trim()) return sendJSON(res, 400, { error: "Ism familiyani kiriting" });
      u.card = { number: digits.replace(/(.{4})/g, '$1 ').trim(), holder: String(holder).trim() };
      await saveDB(db);
      return sendJSON(res, 200, { card: u.card });
    }

    // ---- Mahsulotlar ----
    if (pathname === '/api/products' && M === 'GET') {
      const rq = me(); const fav = new Set(rq ? rq.favorites || [] : []);
      const list = db.products.filter(p => isSellerActive(db, p.sellerId) && computeSellerDebt(db, p.sellerId) <= DEBT_LIMIT).map(p => {
        const s = db.users.find(u => u.id === p.sellerId);
        return { ...pub(p), sellerName: s ? s.name : "Noma'lum", ...ratingOf(db, p.id), isFavorited: fav.has(p.id) };
      });
      return sendJSON(res, 200, { products: list });
    }
    if (pathname === '/api/products' && M === 'POST') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Faqat sotuvchilar mahsulot qo'sha oladi" });
      if (sellerStatusOf(u) !== 'faol') return sendJSON(res, 403, { error: sellerStatusOf(u) === 'kutilmoqda' ? "Hisobingiz hali admin tomonidan tasdiqlanmagan" : "Hisobingiz rad etilgan yoki bloklangan" });
      const body = await readBody(req);
      const { name, cat, price, desc, stock, image, deliveryRegions, deliveryPrice, oldPrice } = body;
      if (!name || !cat || !price) return sendJSON(res, 400, { error: "Nom, kategoriya va narxni kiriting" });
      const product = {
        id: db.nextId.product++, sellerId: u.id, name, cat, price: Number(price), desc: desc || '', icon: CAT_ICON[cat] || 'laptop',
        stock: stock !== undefined && stock !== '' ? Number(stock) : 999,
        image: typeof image === 'string' && image.startsWith('data:') ? image : null, imgv: 1,
        deliveryRegions: Array.isArray(deliveryRegions) ? deliveryRegions : ['barchasi'],
        deliveryPrice: deliveryPrice !== undefined && deliveryPrice !== '' ? Number(deliveryPrice) : 0,
        oldPrice: (oldPrice !== undefined && oldPrice !== '' && Number(oldPrice) > Number(price)) ? Number(oldPrice) : null,
        salePrice: null, saleEndsAt: null
      };
      applySale(product, body);
      db.products.push(product); await saveDB(db);
      return sendJSON(res, 200, { product: pub(product) });
    }
    if (pathname === '/api/my-products' && M === 'GET') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      return sendJSON(res, 200, { products: db.products.filter(p => p.sellerId === u.id).map(pub) });
    }
    if ((m = pathname.match(/^\/api\/products\/(\d+)$/)) && M === 'DELETE') {
      const u = me(); if (!u) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      const i = db.products.findIndex(p => p.id === Number(m[1]));
      if (i === -1) return sendJSON(res, 404, { error: "Mahsulot topilmadi" });
      if (db.products[i].sellerId !== u.id && u.role !== 'admin') return sendJSON(res, 403, { error: "Bu sizning mahsulotingiz emas" });
      db.products.splice(i, 1); await saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }
    if ((m = pathname.match(/^\/api\/products\/(\d+)$/)) && M === 'PATCH') {
      const u = me(); if (!u) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      const p = db.products.find(x => x.id === Number(m[1]));
      if (!p) return sendJSON(res, 404, { error: "Mahsulot topilmadi" });
      if (p.sellerId !== u.id) return sendJSON(res, 403, { error: "Bu sizning mahsulotingiz emas" });
      const b = await readBody(req);
      if (b.name !== undefined) p.name = b.name;
      if (b.cat !== undefined) { p.cat = b.cat; p.icon = CAT_ICON[b.cat] || 'laptop'; }
      if (b.price !== undefined && b.price !== '') p.price = Number(b.price);
      if (b.desc !== undefined) p.desc = b.desc;
      if (b.stock !== undefined && b.stock !== '') p.stock = Number(b.stock);
      if (b.image === null) { p.image = null; p.imgv = (p.imgv || 0) + 1; }
      else if (typeof b.image === 'string' && b.image.startsWith('data:')) { p.image = b.image; p.imgv = (p.imgv || 0) + 1; }
      if (Array.isArray(b.deliveryRegions)) p.deliveryRegions = b.deliveryRegions;
      if (b.deliveryPrice !== undefined && b.deliveryPrice !== '') p.deliveryPrice = Number(b.deliveryPrice);
      if (b.oldPrice !== undefined) p.oldPrice = (b.oldPrice !== '' && Number(b.oldPrice) > p.price) ? Number(b.oldPrice) : null;
      applySale(p, b);
      await saveDB(db);
      return sendJSON(res, 200, { product: pub(p) });
    }

    // ---- Sharhlar ----
    if ((m = pathname.match(/^\/api\/products\/(\d+)\/reviews$/))) {
      const pid = Number(m[1]);
      if (M === 'POST') {
        const u = me(); if (!u || u.role !== 'buyer') return sendJSON(res, 403, { error: "Faqat xaridorlar baho qoldira oladi" });
        const { rating, comment } = await readBody(req); const r = Number(rating);
        if (!r || r < 1 || r > 5) return sendJSON(res, 400, { error: "Bahoni 1 dan 5 gacha tanlang" });
        if (!db.orders.some(o => o.buyerId === u.id && o.items.some(it => it.productId === pid))) return sendJSON(res, 403, { error: "Faqat sotib olgan mahsulotingizga baho qo'ya olasiz" });
        const old = db.reviews.find(x => x.productId === pid && x.buyerId === u.id);
        if (old) { old.rating = r; old.comment = comment || ''; old.createdAt = new Date().toISOString(); }
        else db.reviews.push({ id: db.nextId.review++, productId: pid, buyerId: u.id, buyerName: u.name, rating: r, comment: comment || '', createdAt: new Date().toISOString() });
        await saveDB(db);
        return sendJSON(res, 200, { ok: true });
      }
      if (M === 'GET') return sendJSON(res, 200, { reviews: db.reviews.filter(r => r.productId === pid).sort((a, b) => b.id - a.id) });
    }

    // ---- Sevimlilar ----
    if (pathname === '/api/favorites/toggle' && M === 'POST') {
      const u = me(); if (!u || u.role !== 'buyer') return sendJSON(res, 403, { error: "Faqat xaridorlar sevimlilarga qo'sha oladi" });
      const pid = Number((await readBody(req)).productId);
      if (!u.favorites) u.favorites = [];
      const i = u.favorites.indexOf(pid); let favorited;
      if (i === -1) { u.favorites.push(pid); favorited = true; } else { u.favorites.splice(i, 1); favorited = false; }
      await saveDB(db);
      return sendJSON(res, 200, { favorited });
    }
    if (pathname === '/api/favorites' && M === 'GET') {
      const u = me(); if (!u || u.role !== 'buyer') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const ids = u.favorites || [];
      const list = db.products.filter(p => ids.includes(p.id) && isSellerActive(db, p.sellerId)).map(p => {
        const s = db.users.find(x => x.id === p.sellerId);
        return { ...pub(p), sellerName: s ? s.name : "Noma'lum", ...ratingOf(db, p.id), isFavorited: true };
      });
      return sendJSON(res, 200, { products: list });
    }

    // ---- Buyurtma xabarlari ----
    if ((m = pathname.match(/^\/api\/orders\/(\d+)\/messages$/))) {
      const u = me(); if (!u) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      const oid = Number(m[1]); const order = db.orders.find(o => o.id === oid);
      if (!order) return sendJSON(res, 404, { error: "Buyurtma topilmadi" });
      if (!(order.buyerId === u.id || order.items.some(it => it.sellerId === u.id) || u.role === 'admin')) return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      if (M === 'GET') return sendJSON(res, 200, { messages: db.messages.filter(x => x.orderId === oid).sort((a, b) => a.id - b.id) });
      if (M === 'POST') {
        const { text } = await readBody(req);
        if (!text || !text.trim()) return sendJSON(res, 400, { error: "Xabar matnini kiriting" });
        const msg = { id: db.nextId.message++, orderId: oid, senderId: u.id, senderRole: u.role, senderName: u.name, text: text.trim(), createdAt: new Date().toISOString() };
        db.messages.push(msg); await saveDB(db);
        return sendJSON(res, 200, { message: msg });
      }
    }

    // ---- Sotuvchining komissiya to'lovi ----
    if (pathname === '/api/payments' && M === 'POST') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Faqat sotuvchilar to'lov yubora oladi" });
      const { amount, receiptImage } = await readBody(req);
      if (!amount || Number(amount) <= 0) return sendJSON(res, 400, { error: "Summani kiriting" });
      if (!receiptImage) return sendJSON(res, 400, { error: "Chek yoki skrinshot rasmini yuklang" });
      const payment = { id: db.nextId.payment++, sellerId: u.id, sellerName: u.name, amount: Number(amount), receiptImage, status: 'kutilmoqda', adminNote: '', createdAt: new Date().toISOString() };
      db.payments.push(payment); await saveDB(db);
      pushAdmins(db, { title: "Yangi to'lov", body: u.name + ": " + payment.amount + " so'm", tag: 'payment' });
      return sendJSON(res, 200, { payment });
    }
    if (pathname === '/api/payments/mine' && M === 'GET') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      return sendJSON(res, 200, { payments: db.payments.filter(p => p.sellerId === u.id).sort((a, b) => b.id - a.id).map(({ receiptImage, ...r }) => r) });
    }

    // ==================== ADMIN ====================
    if (pathname.startsWith('/api/admin/')) {
      const admin = requireAdmin(req, db);
      if (!admin) return sendJSON(res, 403, { error: "Faqat admin uchun" });

      // Tasdiqlashni kutayotgan sotuvchilar soni (admin ekranida belgi va ovoz uchun)
      if (pathname === '/api/admin/pending' && M === 'GET') {
        const list = db.users.filter(u => u.role === 'seller' && sellerStatusOf(u) === 'kutilmoqda').map(u => ({ id: u.id, name: u.name }));
        return sendJSON(res, 200, { count: list.length, sellers: list });
      }
      if (pathname === '/api/admin/sellers' && M === 'GET') {
        const docIds = new Set((await mongoClient.db('savdouz').collection('sellerdocs').find({}, { projection: { _id: 1 } }).toArray()).map(x => x._id));
        const sellers = db.users.filter(u => u.role === 'seller').map(s => {
          const all = sellerItems(db, s.id, false), del = sellerItems(db, s.id, true);
          const totalCommission = del.reduce((x, it) => x + (it.commission || 0), 0), paid = commissionPaid(db, s.id);
          return {
            hasDocs: docIds.has(s.id), sellerStatus: sellerStatusOf(s), id: s.id, name: s.name, phone: s.phone, accountNumber: s.accountNumber, balance: s.balance || 0,
            productCount: db.products.filter(p => p.sellerId === s.id).length,
            orderCount: db.orders.filter(o => o.items.some(it => it.sellerId === s.id)).length,
            totalSales: all.reduce((x, it) => x + (it.subtotal || it.price * it.qty), 0),
            totalCommission, paidCommission: paid, debt: totalCommission - paid, restricted: (totalCommission - paid) > DEBT_LIMIT
          };
        });
        return sendJSON(res, 200, { sellers });
      }
      // Sotuvchining pasport/ID va selfi rasmi (faqat admin ko'radi)
      if ((m = pathname.match(/^\/api\/admin\/sellers\/(\d+)\/doc\/(id|selfie)$/)) && M === 'GET') {
        const d = await mongoClient.db('savdouz').collection('sellerdocs').findOne({ _id: Number(m[1]) });
        return sendDataImage(res, d && (m[2] === 'id' ? d.idDoc : d.selfie), 'private, max-age=3600');
      }
      // Sotuvchini tasdiqlash / rad etish / bloklash
      if ((m = pathname.match(/^\/api\/admin\/sellers\/(\d+)\/status$/)) && M === 'POST') {
        const s = db.users.find(u => u.id === Number(m[1]) && u.role === 'seller');
        if (!s) return sendJSON(res, 404, { error: "Sotuvchi topilmadi" });
        const { status } = await readBody(req);
        if (!['faol', 'rad etildi', 'kutilmoqda'].includes(status)) return sendJSON(res, 400, { error: "Noto'g'ri holat" });
        s.sellerStatus = status;
        await saveDB(db);
        if (status === 'faol') pushNotify(db, [s.id], { title: 'Hisobingiz tasdiqlandi', body: "Endi mahsulot qo'shishingiz mumkin", tag: 'approved' });
        return sendJSON(res, 200, { ok: true, status });
      }
      // Balansga pul qo'shish va ayirish.
      //  /deposit  — summa musbat bo'lsa qo'shadi, manfiy (masalan -5000) bo'lsa ayiradi
      //  /withdraw — summa har doim ayiriladi (musbat son yuboriladi)
      if ((m = pathname.match(/^\/api\/admin\/sellers\/(\d+)\/(deposit|withdraw)$/)) && M === 'POST') {
        const s = db.users.find(u => u.id === Number(m[1]) && u.role === 'seller');
        if (!s) return sendJSON(res, 404, { error: "Sotuvchi topilmadi" });
        const { amount, note } = await readBody(req); let a = Math.round(Number(amount));
        if (m[2] === 'withdraw') a = -Math.abs(a);
        if (!a || Math.abs(a) > 1e10) return sendJSON(res, 400, { error: "To'g'ri summa kiriting" });
        if (a < 0 && (s.balance || 0) < -a) return sendJSON(res, 400, { error: "Balansda yetarli mablag' yo'q (bor: " + (s.balance || 0) + " so'm)" });
        s.balance = (s.balance || 0) + a;
        s.txs.push({ id: Date.now(), amount: a, note: note || (a > 0 ? "Admin tomonidan tushirildi" : "Admin tomonidan ayirildi"), createdAt: new Date().toISOString() });
        if (a > 0) settle(db, s);
        await saveDB(db);
        if (a > 0) pushNotify(db, [s.id], { title: "Hisobingizga pul tushdi", body: a + " so'm", tag: 'money' });
        return sendJSON(res, 200, { balance: s.balance });
      }
      if ((m = pathname.match(/^\/api\/admin\/sellers\/(\d+)$/)) && M === 'DELETE') {
        const sid = Number(m[1]);
        const i = db.users.findIndex(u => u.id === sid && u.role === 'seller');
        if (i === -1) return sendJSON(res, 404, { error: "Sotuvchi topilmadi" });
        const active = db.orders.some(o => !['yetkazildi', 'bekor qilindi'].includes(o.status) && o.items.some(it => it.sellerId === sid));
        if (active) return sendJSON(res, 400, { error: "Sotuvchining tugallanmagan buyurtmalari bor. Avval ularni yakunlang yoki bekor qiling" });
        db.products = db.products.filter(p => p.sellerId !== sid);
        db.users.splice(i, 1);
        await saveDB(db);
        await mongoClient.db('savdouz').collection('sellerdocs').deleteOne({ _id: sid }).catch(() => {});
        return sendJSON(res, 200, { ok: true });
      }
      if (pathname === '/api/admin/buyers' && M === 'GET') {
        const buyers = db.users.filter(u => u.role === 'buyer').map(b => {
          const mo = db.orders.filter(o => o.buyerId === b.id);
          return { id: b.id, name: b.name, phone: b.phone, orderCount: mo.length, totalSpent: mo.reduce((s, o) => s + o.total, 0) };
        });
        return sendJSON(res, 200, { buyers });
      }
      if (pathname === '/api/admin/products' && M === 'GET') {
        return sendJSON(res, 200, { products: db.products.map(p => { const s = db.users.find(u => u.id === p.sellerId); return { ...pub(p), sellerName: s ? s.name : "Noma'lum", sellerPhone: s ? s.phone : '' }; }) });
      }
      if (pathname === '/api/admin/orders' && M === 'GET') {
        return sendJSON(res, 200, { orders: [...db.orders].sort((a, b) => b.id - a.id).map(o => ordOut(o, db)) });
      }
      if ((m = pathname.match(/^\/api\/admin\/orders\/(\d+)$/)) && M === 'PATCH') {
        const o = db.orders.find(x => x.id === Number(m[1]));
        if (!o) return sendJSON(res, 404, { error: "Buyurtma topilmadi" });
        o.adminNote = (await readBody(req)).adminNote || ''; await saveDB(db);
        return sendJSON(res, 200, { ok: true });
      }
      if (pathname === '/api/admin/payments' && M === 'GET') {
        return sendJSON(res, 200, { payments: [...db.payments].sort((a, b) => b.id - a.id) });
      }
      if ((m = pathname.match(/^\/api\/admin\/payments\/(\d+)$/)) && M === 'PATCH') {
        const pay = db.payments.find(p => p.id === Number(m[1]));
        if (!pay) return sendJSON(res, 404, { error: "To'lov topilmadi" });
        const { status, adminNote } = await readBody(req);
        if (!['tasdiqlandi', 'rad etildi'].includes(status)) return sendJSON(res, 400, { error: "Noto'g'ri holat" });
        const was = pay.status === 'tasdiqlandi';
        pay.status = status; if (adminNote !== undefined) pay.adminNote = adminNote;
        const s = db.users.find(u => u.id === pay.sellerId);
        if (s) {
          if (status === 'tasdiqlandi' && !was) s.paidCommission = (s.paidCommission || 0) + pay.amount;
          if (status !== 'tasdiqlandi' && was) s.paidCommission = Math.max(0, (s.paidCommission || 0) - pay.amount);
        }
        await saveDB(db);
        return sendJSON(res, 200, { payment: pay });
      }
    }

    // ==================== BUYURTMALAR ====================
    if (pathname === '/api/orders' && M === 'POST') {
      const u = me(); if (!u || u.role !== 'buyer') return sendJSON(res, 403, { error: "Faqat xaridorlar buyurtma bera oladi" });
      const { items, address, phone, region, paymentMethod } = await readBody(req);
      if (!items || !items.length) return sendJSON(res, 400, { error: "Savat bo'sh" });
      if (!address) return sendJSON(res, 400, { error: "Manzilni kiriting" });
      if (!region || !REGIONS.includes(region)) return sendJSON(res, 400, { error: "Yetkazib berish viloyatini tanlang" });
      const method = paymentMethod === 'karta' ? 'karta' : 'naqd';
      let total = 0, deliveryTotal = 0;
      const orderItems = items.map(it => {
        const p = db.products.find(x => x.id === it.productId);
        if (!p) throw new UserErr("Mahsulot topilmadi");
        if (!isSellerActive(db, p.sellerId)) throw new UserErr(`"${p.name}" hozir sotuvda emas`);
        const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
        if ((p.stock || 0) < qty) throw new UserErr(`"${p.name}" omborda yetarli emas (bor: ${p.stock} dona)`);
        if (!deliversTo(p, region)) throw new UserErr(`"${p.name}" "${region}" hududiga yetkazilmaydi`);
        if (method === 'karta') { const s = db.users.find(x => x.id === p.sellerId); if (!s || !s.card) throw new UserErr(`"${p.name}" sotuvchisi karta kiritmagan. Naqd to'lovni tanlang`); }
        const unit = curPrice(p);
        const subtotal = unit * qty, commission = Math.round(subtotal * COMMISSION_RATE), deliveryFee = p.deliveryPrice || 0;
        total += subtotal; deliveryTotal += deliveryFee;
        return { productId: p.id, name: p.name, price: unit, qty, sellerId: p.sellerId, subtotal, commission, payout: subtotal - commission, deliveryFee, charge: true };
      });
      orderItems.forEach(it => { const p = db.products.find(x => x.id === it.productId); if (p) p.stock -= it.qty; });
      const order = {
        id: db.nextId.order++, buyerId: u.id, buyerName: u.name, items: orderItems,
        total: total + deliveryTotal, itemsTotal: total, deliveryTotal, address, region, phone: phone || u.phone,
        status: 'yangi', paymentMethod: method, paymentStatus: method === 'karta' ? 'kutilmoqda' : 'naqd',
        createdAt: new Date().toISOString()
      };
      db.orders.push(order); await saveDB(db);
      pushNotify(db, orderItems.map(i => i.sellerId), { title: 'Yangi buyurtma!', body: 'Buyurtma #' + order.id + ' — ' + order.total + " so'm", tag: 'order', icon: (p0 => p0 && p0.image ? '/api/img/' + p0.id + '?v=' + (p0.imgv || 0) : '')(db.products.find(x => x.id === orderItems[0].productId)) });
      return sendJSON(res, 200, { order: ordOut(order, db) });
    }
    if (pathname === '/api/orders/mine' && M === 'GET') {
      const u = me(); if (!u) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      return sendJSON(res, 200, { orders: db.orders.filter(o => o.buyerId === u.id).sort((a, b) => b.id - a.id).map(o => ordOut(o, db)) });
    }
    if (pathname === '/api/orders/incoming' && M === 'GET') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const list = db.orders.map(o => ({ ...o, items: o.items.filter(it => it.sellerId === u.id) })).filter(o => o.items.length).sort((a, b) => b.id - a.id).map(o => ordOut(o, db));
      return sendJSON(res, 200, { orders: list });
    }
    if (pathname === '/api/earnings' && M === 'GET') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const all = sellerItems(db, u.id, false), del = sellerItems(db, u.id, true);
      const totalCommission = del.reduce((s, it) => s + (it.commission || 0), 0);
      const paid = commissionPaid(db, u.id), debt = totalCommission - paid;
      return sendJSON(res, 200, {
        totalSales: all.reduce((s, it) => s + (it.subtotal || it.price * it.qty), 0), totalCommission,
        totalPayout: all.reduce((s, it) => s + (it.payout || it.price * it.qty), 0),
        orderCount: db.orders.filter(o => o.items.some(it => it.sellerId === u.id)).length,
        commissionRate: COMMISSION_RATE, payoutCard: { number: PAYOUT_CARD.number, name: initials(PAYOUT_CARD.name) }, paidCommission: paid, debt, debtLimit: DEBT_LIMIT, restricted: debt > DEBT_LIMIT
      });
    }

    if ((m = pathname.match(/^\/api\/orders\/(\d+)\/receipt$/)) && M === 'POST') {
      const u = me(); const o = db.orders.find(x => x.id === Number(m[1]));
      if (!u || !o || o.buyerId !== u.id) return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      if (o.paymentMethod !== 'karta') return sendJSON(res, 400, { error: "Bu buyurtma naqd to'lovli" });
      if (!['kutilmoqda', 'rad etildi'].includes(o.paymentStatus)) return sendJSON(res, 400, { error: "Chek allaqachon yuborilgan" });
      const { image } = await readBody(req);
      if (!image || !String(image).startsWith('data:')) return sendJSON(res, 400, { error: "Chek rasmini yuklang" });
      o.receiptImage = image; o.paymentStatus = 'chek yuborildi'; await saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }
    if ((m = pathname.match(/^\/api\/orders\/(\d+)\/payment$/)) && M === 'POST') {
      const u = me(); const o = db.orders.find(x => x.id === Number(m[1]));
      if (!u || !o || u.role !== 'seller' || !o.items.some(i => i.sellerId === u.id)) return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const { status } = await readBody(req);
      if (!['tasdiqlandi', 'rad etildi'].includes(status)) return sendJSON(res, 400, { error: "Noto'g'ri holat" });
      if (o.paymentStatus !== 'chek yuborildi') return sendJSON(res, 400, { error: "Tasdiqlash uchun chek kerak" });
      o.paymentStatus = status; await saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }
    if ((m = pathname.match(/^\/api\/orders\/(\d+)\/received$/)) && M === 'POST') {
      const u = me(); const o = db.orders.find(x => x.id === Number(m[1]));
      if (!u || !o || o.buyerId !== u.id) return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      if (o.status !== 'kuryerga topshirildi') return sendJSON(res, 400, { error: "Sotuvchi hali mahsulotni topshirmagan" });
      if (o.paymentMethod === 'karta' && o.paymentStatus !== 'tasdiqlandi') return sendJSON(res, 400, { error: "To'lov hali tasdiqlanmagan" });
      o.status = 'yetkazildi'; o.deliveredAt = new Date().toISOString();
      [...new Set(o.items.map(i => i.sellerId))].forEach(id => { const s = db.users.find(x => x.id === id); if (s) settle(db, s); });
      await saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }
    if ((m = pathname.match(/^\/api\/orders\/(\d+)\/status$/)) && M === 'PATCH') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const o = db.orders.find(x => x.id === Number(m[1]));
      if (!o) return sendJSON(res, 404, { error: "Buyurtma topilmadi" });
      if (!o.items.some(it => it.sellerId === u.id)) return sendJSON(res, 403, { error: "Bu sizning buyurtmangiz emas" });
      const { status } = await readBody(req);
      if (o.status === 'yetkazildi') return sendJSON(res, 400, { error: "Yetkazilgan buyurtmani o'zgartirib bo'lmaydi" });
      if (!['yangi', 'tasdiqlandi', 'kuryerga topshirildi', 'bekor qilindi'].includes(status)) return sendJSON(res, 400, { error: "Yetkazildi holatini xaridor «Oldim» tugmasi bilan tasdiqlaydi" });
      if (o.paymentMethod === 'karta' && o.paymentStatus !== 'tasdiqlandi' && ['tasdiqlandi', 'kuryerga topshirildi'].includes(status)) return sendJSON(res, 400, { error: "Avval xaridor to'lovini tasdiqlang" });
      if (status === 'bekor qilindi' && o.status !== 'bekor qilindi') o.items.forEach(it => { const p = db.products.find(x => x.id === it.productId); if (p) p.stock += it.qty; });
      o.status = status; await saveDB(db);
      return sendJSON(res, 200, { order: ordOut(o, db) });
    }

    return sendJSON(res, 404, { error: "Bunday endpoint yo'q" });
  } catch (e) {
    if (e instanceof UserErr) return sendJSON(res, 400, { error: e.message });
    console.error(e);
    return sendJSON(res, 500, { error: "Server xatosi: " + e.message });
  }
});

connectMongo().then(() => {
  server.listen(PORT, () => console.log(`SavdoUz server ishga tushdi: http://localhost:${PORT}`));
}).catch(err => { console.error('MongoDB ulanishda xato:', err.message); process.exit(1); });
