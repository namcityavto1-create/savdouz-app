// SavdoUz backend v2 — MongoDB Atlas
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), url = require('url');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) console.error("XATO: MONGODB_URI topilmadi. Render Environment'ga qo'shing.");
const mongoClient = new MongoClient(MONGODB_URI);
let stateCollection, cache = null, adminDone = false;
// Token imzosi uchun sir. Render Environment'da SESSION_SECRET qo'yish tavsiya etiladi.
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('sv:' + String(MONGODB_URI)).digest('hex');

const COMMISSION_RATE = 0.01;
const PAYOUT_CARD = { number: "9860 1901 0557 8776", name: "IZZATILLO V." };
const DEBT_LIMIT = 10000;
const ADMIN_PHONE = '+998774071234';
const CAT_ICON = { "Telefon": "phone", "Kompyuter": "laptop", "Elektronika": "laptop", "Maishiy texnika": "laptop", "Kiyim": "shirt", "Poyabzal": "shirt", "Aksessuarlar": "shirt", "Go'zallik": "shirt", "Oziq-ovqat": "sofa", "Uy-ro'zg'or": "sofa", "Mebel": "sofa", "Bolalar": "shirt", "Sport": "shirt", "Avto": "car", "Qurilish": "car", "Kitob": "laptop", "Boshqa": "laptop" };
const REGIONS = ["Toshkent shahri", "Toshkent viloyati", "Andijon", "Farg'ona", "Namangan", "Buxoro", "Jizzax", "Qashqadaryo", "Navoiy", "Samarqand", "Sirdaryo", "Surxondaryo", "Xorazm", "Qoraqalpog'iston"];
class UserErr extends Error {}

async function connectMongo() {
  await mongoClient.connect();
  stateCollection = mongoClient.db('savdouz').collection('state');
  console.log('MongoDB ulanish muvaffaqiyatli ✅');
}

// ---------- Baza: bir marta yuklanadi va xotirada turadi (tez) ----------
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
  });
  db.orders.forEach(o => {
    if (!o.paymentMethod || o.paymentMethod === 'naqd/yetkazishda') o.paymentMethod = 'naqd';
    if (!o.paymentStatus) o.paymentStatus = 'naqd';
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
// Token endi imzolangan: server qayta ishga tushsa ham foydalanuvchi chiqib ketmaydi
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

// Admin parolini kodda saqlamang: Render Environment'ga ADMIN_PASSWORD qo'ying
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
// Ro'yxatlarda rasm matni emas, qisqa havola yuboriladi (juda tez ochiladi)
const pub = p => ({ ...p, image: p.image ? `/api/img/${p.id}?v=${p.imgv || 0}` : null });
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
// Qarz = yetkazilgan buyurtmalar komissiyasi − to'langani
function computeSellerDebt(db, sid) {
  const c = sellerItems(db, sid, true).reduce((s, it) => s + (it.commission || 0), 0);
  const u = db.users.find(x => x.id === sid);
  return c - (u ? u.paidCommission || 0 : 0);
}
// Qarz bo'lsa, sotuvchi hisobidagi balansdan yechiladi
function settle(db, s) {
  const take = Math.min(s.balance || 0, Math.max(0, computeSellerDebt(db, s.id)));
  if (take > 0) {
    s.balance -= take; s.paidCommission = (s.paidCommission || 0) + take;
    s.txs.push({ id: Date.now(), amount: -take, note: 'Komissiya hisobdan yechildi', createdAt: new Date().toISOString() });
  }
}
const deliversTo = (p, region) => (p.deliveryRegions || []).some(r => r === 'barchasi' || r === region);
const ratingOf = (db, pid) => { const r = db.reviews.filter(x => x.productId === pid); return { avgRating: r.length ? r.reduce((s, x) => s + x.rating, 0) / r.length : 0, reviewCount: r.length }; };

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, c2) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(c2);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}
function sendDataImage(res, dataUrl, cacheCtl) {
  const d = dataUrl && String(dataUrl).match(/^data:(.+?);base64,(.*)$/s);
  if (!d) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': d[1], 'Cache-Control': cacheCtl });
  res.end(Buffer.from(d[2], 'base64'));
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

    // Mahsulot rasmi (ochiq, keshlanadi)
    if ((m = pathname.match(/^\/api\/img\/(\d+)$/)) && M === 'GET') {
      const p = db.products.find(x => x.id === Number(m[1]));
      return sendDataImage(res, p && p.image, 'public, max-age=31536000');
    }
    // Chek rasmi (faqat xaridor, shu buyurtma sotuvchisi yoki admin)
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
      const { name, cat, price, desc, stock, image, deliveryRegions, deliveryPrice, oldPrice } = await readBody(req);
      if (!name || !cat || !price) return sendJSON(res, 400, { error: "Nom, kategoriya va narxni kiriting" });
      const product = {
        id: db.nextId.product++, sellerId: u.id, name, cat, price: Number(price), desc: desc || '', icon: CAT_ICON[cat] || 'laptop',
        stock: stock !== undefined && stock !== '' ? Number(stock) : 999,
        image: typeof image === 'string' && image.startsWith('data:') ? image : null, imgv: 1,
        deliveryRegions: Array.isArray(deliveryRegions) ? deliveryRegions : ['barchasi'],
        deliveryPrice: deliveryPrice !== undefined && deliveryPrice !== '' ? Number(deliveryPrice) : 0,
        oldPrice: (oldPrice !== undefined && oldPrice !== '' && Number(oldPrice) > Number(price)) ? Number(oldPrice) : null
      };
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

    // ---- Sotuvchining platformaga komissiya to'lovi (admin tasdiqlaydi) ----
    if (pathname === '/api/payments' && M === 'POST') {
      const u = me(); if (!u || u.role !== 'seller') return sendJSON(res, 403, { error: "Faqat sotuvchilar to'lov yubora oladi" });
      const { amount, receiptImage } = await readBody(req);
      if (!amount || Number(amount) <= 0) return sendJSON(res, 400, { error: "Summani kiriting" });
      if (!receiptImage) return sendJSON(res, 400, { error: "Chek yoki skrinshot rasmini yuklang" });
      const payment = { id: db.nextId.payment++, sellerId: u.id, sellerName: u.name, amount: Number(amount), receiptImage, status: 'kutilmoqda', adminNote: '', createdAt: new Date().toISOString() };
      db.payments.push(payment); await saveDB(db);
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
          const totalCommission = del.reduce((x, it) => x + (it.commission || 0), 0), paid = s.paidCommission || 0;
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
      // Sotuvchi hisobiga pul tushirish — faqat admin
      if ((m = pathname.match(/^\/api\/admin\/sellers\/(\d+)\/deposit$/)) && M === 'POST') {
        const s = db.users.find(u => u.id === Number(m[1]) && u.role === 'seller');
        if (!s) return sendJSON(res, 404, { error: "Sotuvchi topilmadi" });
        const { amount, note } = await readBody(req); const a = Math.round(Number(amount));
        if (!a || a <= 0 || a > 1e10) return sendJSON(res, 400, { error: "To'g'ri summa kiriting" });
        s.balance = (s.balance || 0) + a;
        s.txs.push({ id: Date.now(), amount: a, note: note || "Admin tomonidan tushirildi", createdAt: new Date().toISOString() });
        settle(db, s);
        await saveDB(db);
        return sendJSON(res, 200, { balance: s.balance });
      }
      // Sotuvchini o'chirish — faqat admin (faol buyurtmasi bo'lsa o'chirilmaydi)
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
        const subtotal = p.price * qty, commission = Math.round(subtotal * COMMISSION_RATE), deliveryFee = p.deliveryPrice || 0;
        total += subtotal; deliveryTotal += deliveryFee;
        return { productId: p.id, name: p.name, price: p.price, qty, sellerId: p.sellerId, subtotal, commission, payout: subtotal - commission, deliveryFee };
      });
      orderItems.forEach(it => { const p = db.products.find(x => x.id === it.productId); if (p) p.stock -= it.qty; });
      const order = {
        id: db.nextId.order++, buyerId: u.id, buyerName: u.name, items: orderItems,
        total: total + deliveryTotal, itemsTotal: total, deliveryTotal, address, region, phone: phone || u.phone,
        status: 'yangi', paymentMethod: method, paymentStatus: method === 'karta' ? 'kutilmoqda' : 'naqd',
        createdAt: new Date().toISOString()
      };
      db.orders.push(order); await saveDB(db);
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
      const debt = totalCommission - (u.paidCommission || 0);
      return sendJSON(res, 200, {
        totalSales: all.reduce((s, it) => s + (it.subtotal || it.price * it.qty), 0), totalCommission,
        totalPayout: all.reduce((s, it) => s + (it.payout || it.price * it.qty), 0),
        orderCount: db.orders.filter(o => o.items.some(it => it.sellerId === u.id)).length,
        commissionRate: COMMISSION_RATE, payoutCard: { number: PAYOUT_CARD.number, name: initials(PAYOUT_CARD.name) }, paidCommission: u.paidCommission || 0, debt, debtLimit: DEBT_LIMIT, restricted: debt > DEBT_LIMIT
      });
    }

    // Xaridor chek yuboradi
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
    // Sotuvchi to'lovni tasdiqlaydi yoki rad etadi
    if ((m = pathname.match(/^\/api\/orders\/(\d+)\/payment$/)) && M === 'POST') {
      const u = me(); const o = db.orders.find(x => x.id === Number(m[1]));
      if (!u || !o || u.role !== 'seller' || !o.items.some(i => i.sellerId === u.id)) return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const { status } = await readBody(req);
      if (!['tasdiqlandi', 'rad etildi'].includes(status)) return sendJSON(res, 400, { error: "Noto'g'ri holat" });
      if (o.paymentStatus !== 'chek yuborildi') return sendJSON(res, 400, { error: "Tasdiqlash uchun chek kerak" });
      o.paymentStatus = status; await saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }
    // Xaridor mahsulotni oldim deydi — shundan keyin komissiya yechiladi
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
    // Sotuvchi holatni o'zgartiradi ("yetkazildi" ni faqat xaridor qo'yadi)
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
