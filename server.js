// SavdoUz backend v3 — MongoDB Atlas + hafta chegirmasi + ovozli/push bildirishnoma
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
const publicUser = u => ({ id: u.id, name: u.name, phone: u.phone, role: u.role });

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
// Logotip shu faylning o'zida. index.html dagi "const LOGO = ..." qatori avtomatik shu bilan almashtiriladi.
const LOGO_LINE = "const LOGO = 'data:image/png;base64,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';";
const LOGO_DATA = LOGO_LINE.match(/'(data:[^']+)'/)[1];
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
    if (pathname === '/api/usd' && M === 'GET') {
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
      const products = computeSellerDebt(db, sid) > DEBT_LIMIT ? [] : db.products.filter(p => p.sellerId === sid).map(p => ({ ...pub(p), sellerName: seller.name, ...ratingOf(db, p.id), isFavorited: fav.has(p.id) }));
      return sendJSON(res, 200, { seller: { id: seller.id, name: seller.name }, products });
    }

    // ---- Kirish / ro'yxat ----
    if (pathname === '/api/register' && M === 'POST') {
      const { name, phone, password, role } = await readBody(req);
      if (!name || !phone || !password || !role) return sendJSON(res, 400, { error: "Barcha maydonlarni to'ldiring" });
      if (!['buyer', 'seller'].includes(role)) return sendJSON(res, 400, { error: "Noto'g'ri rol" });
      if (db.users.find(u => u.phone === phone)) return sendJSON(res, 400, { error: "Bu raqam allaqachon ro'yxatdan o'tgan" });
      const { salt, hash } = hashPassword(password);
      const user = { id: db.nextId.user++, name, phone, role, salt, hash, paidCommission: 0, favorites: [] };
      if (role === 'seller') { user.accountNumber = 'SU' + String(user.id).padStart(8, '0'); user.balance = 0; user.txs = []; }
      db.users.push(user);
      await saveDB(db);
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
      const list = db.products.filter(p => computeSellerDebt(db, p.sellerId) <= DEBT_LIMIT).map(p => {
        const s = db.users.find(u => u.id === p.sellerId);
        return { ...pub(p), sellerName: s ? s.name : "Noma'lum", ...ratingOf(db, p.id), isFavorited: fav.has(p.id) };
      });
      return sendJSON(res, 200, { products: list });
    }
    if (pathname === '/api/products' && M === 'POST') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Faqat sotuvchilar mahsulot qo'sha oladi" });
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
      const list = db.products.filter(p => ids.includes(p.id)).map(p => {
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

      if (pathname === '/api/admin/sellers' && M === 'GET') {
        const sellers = db.users.filter(u => u.role === 'seller').map(s => {
          const all = sellerItems(db, s.id, false), del = sellerItems(db, s.id, true);
          const totalCommission = del.reduce((x, it) => x + (it.commission || 0), 0), paid = commissionPaid(db, s.id);
          return {
            id: s.id, name: s.name, phone: s.phone, accountNumber: s.accountNumber, balance: s.balance || 0,
            productCount: db.products.filter(p => p.sellerId === s.id).length,
            orderCount: db.orders.filter(o => o.items.some(it => it.sellerId === s.id)).length,
            totalSales: all.reduce((x, it) => x + (it.subtotal || it.price * it.qty), 0),
            totalCommission, paidCommission: paid, debt: totalCommission - paid, restricted: (totalCommission - paid) > DEBT_LIMIT
          };
        });
        return sendJSON(res, 200, { sellers });
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
