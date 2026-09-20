// SavdoUz — oddiy ko'p-sotuvchili marketplace backendi
// Tashqi kutubxonasiz (faqat Node.js o'zi kifoya)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const empty = { users: [], products: [], orders: [], payments: [], reviews: [], nextId: { user: 1, product: 1, order: 1, payment: 1, review: 1 } };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!db.payments) db.payments = [];
  if (!db.reviews) db.reviews = [];
  if (!db.nextId.payment) db.nextId.payment = 1;
  if (!db.nextId.review) db.nextId.review = 1;
  db.users.forEach(u => { if (u.paidCommission === undefined) u.paidCommission = 0; });
  ensureAdmin(db);
  return db;
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return check === hash;
}

const sessions = {};

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getUserFromReq(req, db) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const userId = sessions[token];
  if (!userId) return null;
  return db.users.find(u => u.id === userId) || null;
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
  });
}

function publicUser(u) {
  return { id: u.id, name: u.name, phone: u.phone, role: u.role };
}

const COMMISSION_RATE = 0.01;

const PAYOUT_CARD = { number: "9860 1901 0557 8776", name: "IZZATILLO V." };

const DEBT_LIMIT = 10000;

function computeSellerDebt(db, sellerId) {
  const items = db.orders.map(o => o.items.filter(it => it.sellerId === sellerId)).flat();
  const totalCommission = items.reduce((s, it) => s + (it.commission || 0), 0);
  const seller = db.users.find(u => u.id === sellerId);
  const paid = seller ? (seller.paidCommission || 0) : 0;
  return totalCommission - paid;
}

const ADMIN_PHONE = '+998774071234';
const ADMIN_PASSWORD = '1992tillo';

function ensureAdmin(db) {
  const exists = db.users.find(u => u.phone === ADMIN_PHONE);
  if (!exists) {
    const { salt, hash } = hashPassword(ADMIN_PASSWORD);
    const admin = { id: db.nextId.user++, name: 'Admin', phone: ADMIN_PHONE, role: 'admin', salt, hash, paidCommission: 0 };
    db.users.push(admin);
    saveDB(db);
  }
}

function requireAdmin(req, db) {
  const user = getUserFromReq(req, db);
  if (!user || user.role !== 'admin') return null;
  return user;
}

const CAT_ICON = {
  "Telefon": "phone", "Kiyim": "shirt", "Uy-ro'zg'or": "sofa",
  "Avto": "car", "Boshqa": "laptop"
};

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, c2) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(c2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') { return sendJSON(res, 200, {}); }

  if (!pathname.startsWith('/api/')) {
    return serveStatic(req, res, pathname);
  }

  const db = loadDB();

  try {
    if (pathname === '/api/register' && req.method === 'POST') {
      const { name, phone, password, role } = await readBody(req);
      if (!name || !phone || !password || !role) return sendJSON(res, 400, { error: "Barcha maydonlarni to'ldiring" });
      if (!['buyer', 'seller'].includes(role)) return sendJSON(res, 400, { error: "Noto'g'ri rol" });
      if (db.users.find(u => u.phone === phone)) return sendJSON(res, 400, { error: "Bu raqam allaqachon ro'yxatdan o'tgan" });
      const { salt, hash } = hashPassword(password);
      const user = { id: db.nextId.user++, name, phone, role, salt, hash };
      db.users.push(user);
      saveDB(db);
      const token = makeToken();
      sessions[token] = user.id;
      return sendJSON(res, 200, { token, user: publicUser(user) });
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      const { phone, password } = await readBody(req);
      const user = db.users.find(u => u.phone === phone);
      if (!user || !verifyPassword(password, user.salt, user.hash)) {
        return sendJSON(res, 401, { error: "Telefon raqam yoki parol xato" });
      }
      const token = makeToken();
      sessions[token] = user.id;
      return sendJSON(res, 200, { token, user: publicUser(user) });
    }

    if (pathname === '/api/me' && req.method === 'GET') {
      const user = getUserFromReq(req, db);
      if (!user) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      return sendJSON(res, 200, { user: publicUser(user) });
    }

    if (pathname === '/api/products' && req.method === 'GET') {
      const list = db.products
        .filter(p => computeSellerDebt(db, p.sellerId) <= DEBT_LIMIT)
        .map(p => {
          const seller = db.users.find(u => u.id === p.sellerId);
          const prodReviews = db.reviews.filter(r => r.productId === p.id);
          const avgRating = prodReviews.length ? (prodReviews.reduce((s, r) => s + r.rating, 0) / prodReviews.length) : 0;
          return { ...p, sellerName: seller ? seller.name : "Noma'lum", avgRating, reviewCount: prodReviews.length };
        });
      return sendJSON(res, 200, { products: list });
    }

    if (pathname === '/api/products' && req.method === 'POST') {
      const user = getUserFromReq(req, db);
      if (!user || user.role !== 'seller') return sendJSON(res, 403, { error: "Faqat sotuvchilar mahsulot qo'sha oladi" });
      const { name, cat, price, desc, stock, image } = await readBody(req);
      if (!name || !cat || !price) return sendJSON(res, 400, { error: "Nom, kategoriya va narxni kiriting" });
      const product = {
        id: db.nextId.product++, sellerId: user.id, name, cat,
        price: Number(price), desc: desc || '', icon: CAT_ICON[cat] || 'laptop',
        stock: stock !== undefined && stock !== '' ? Number(stock) : 999,
        image: image || null
      };
      db.products.push(product);
      saveDB(db);
      return sendJSON(res, 200, { product });
    }

    if (pathname === '/api/my-products' && req.method === 'GET') {
      const user = getUserFromReq(req, db);
      if (!user || user.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const list = db.products.filter(p => p.sellerId === user.id);
      return sendJSON(res, 200, { products: list });
    }

    const delMatch = pathname.match(/^\/api\/products\/(\d+)$/);
    if (delMatch && req.method === 'DELETE') {
      const user = getUserFromReq(req, db);
      if (!user) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      const pid = Number(delMatch[1]);
      const idx = db.products.findIndex(p => p.id === pid);
      if (idx === -1) return sendJSON(res, 404, { error: "Mahsulot topilmadi" });
      if (db.products[idx].sellerId !== user.id) return sendJSON(res, 403, { error: "Bu sizning mahsulotingiz emas" });
      db.products.splice(idx, 1);
      saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }

    const editMatch = pathname.match(/^\/api\/products\/(\d+)$/);
    if (editMatch && req.method === 'PATCH') {
      const user = getUserFromReq(req, db);
      if (!user) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      const pid = Number(editMatch[1]);
      const product = db.products.find(p => p.id === pid);
      if (!product) return sendJSON(res, 404, { error: "Mahsulot topilmadi" });
      if (product.sellerId !== user.id) return sendJSON(res, 403, { error: "Bu sizning mahsulotingiz emas" });
      const { name, cat, price, desc, stock, image } = await readBody(req);
      if (name !== undefined) product.name = name;
      if (cat !== undefined) { product.cat = cat; product.icon = CAT_ICON[cat] || 'laptop'; }
      if (price !== undefined && price !== '') product.price = Number(price);
      if (desc !== undefined) product.desc = desc;
      if (stock !== undefined && stock !== '') product.stock = Number(stock);
      if (image !== undefined) product.image = image;
      saveDB(db);
      return sendJSON(res, 200, { product });
    }

    const reviewMatch = pathname.match(/^\/api\/products\/(\d+)\/reviews$/);
    if (reviewMatch && req.method === 'POST') {
      const user = getUserFromReq(req, db);
      if (!user || user.role !== 'buyer') return sendJSON(res, 403, { error: "Faqat xaridorlar baho qoldira oladi" });
      const pid = Number(reviewMatch[1]);
      const { rating, comment } = await readBody(req);
      const r = Number(rating);
      if (!r || r < 1 || r > 5) return sendJSON(res, 400, { error: "Bahoni 1 dan 5 gacha tanlang" });
      const hasOrdered = db.orders.some(o => o.buyerId === user.id && o.items.some(it => it.productId === pid));
      if (!hasOrdered) return sendJSON(res, 403, { error: "Faqat sotib olgan mahsulotingizga baho qo'ya olasiz" });
      const already = db.reviews.find(rv => rv.productId === pid && rv.buyerId === user.id);
      if (already) { already.rating = r; already.comment = comment || ''; already.createdAt = new Date().toISOString(); }
      else db.reviews.push({ id: db.nextId.review++, productId: pid, buyerId: user.id, buyerName: user.name, rating: r, comment: comment || '', createdAt: new Date().toISOString() });
      saveDB(db);
      return sendJSON(res, 200, { ok: true });
    }
    if (reviewMatch && req.method === 'GET') {
      const pid = Number(reviewMatch[1]);
      const list = db.reviews.filter(r => r.productId === pid).sort((a, b) => b.id - a.id);
      return sendJSON(res, 200, { reviews: list });
    }

    if (pathname === '/api/payments' && req.method === 'POST') {
      const user = getUserFromReq(req, db);
      if (!user || user.role !== 'seller') return sendJSON(res, 403, { error: "Faqat sotuvchilar to'lov yubora oladi" });
      const { amount, receiptImage } = await readBody(req);
      if (!amount || Number(amount) <= 0) return sendJSON(res, 400, { error: "Summani kiriting" });
      if (!receiptImage) return sendJSON(res, 400, { error: "Chek yoki skrinshot rasmini yuklang" });
      const payment = {
        id: db.nextId.payment++, sellerId: user.id, sellerName: user.name,
        amount: Number(amount), receiptImage, status: 'kutilmoqda', adminNote: '',
        createdAt: new Date().toISOString()
      };
      db.payments.push(payment);
      saveDB(db);
      return sendJSON(res, 200, { payment });
    }

    if (pathname === '/api/payments/mine' && req.method === 'GET') {
      const user = getUserFromReq(req, db);
      if (!user || user.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const list = db.payments.filter(p => p.sellerId === user.id).sort((a, b) => b.id - a.id);
      return sendJSON(res, 200, { payments: list });
    }

    if (pathname === '/api/admin/sellers' && req.method === 'GET') {
      const admin = requireAdmin(req, db);
      if (!admin) return sendJSON(res, 403, { error: "Faqat admin uchun" });
      const sellers = db.users.filter(u => u.role === 'seller').map(s => {
        const myItems = db.orders.map(o => o.items.filter(it => it.sellerId === s.id)).flat();
        const totalSales = myItems.reduce((sum, it) => sum + (it.subtotal || it.price * it.qty), 0);
        const totalCommission = myItems.reduce((sum, it) => sum + (it.commission || 0), 0);
        const paid = s.paidCommission || 0;
        const productCount = db.products.filter(p => p.sellerId === s.id).length;
        const orderCount = db.orders.filter(o => o.items.some(it => it.sellerId === s.id)).length;
        return { id: s.id, name: s.name, phone: s.phone, productCount, orderCount, totalSales, totalCommission, paidCommission: paid, debt: totalCommission - paid, restricted: (totalCommission - paid) > DEBT_LIMIT };
      });
      return sendJSON(res, 200, { sellers });
    }

    if (pathname === '/api/admin/buyers' && req.method === 'GET') {
      const admin = requireAdmin(req, db);
      if (!admin) return sendJSON(res, 403, { error: "Faqat admin uchun" });
      const buyers = db.users.filter(u => u.role === 'buyer').map(b => {
        const myOrders = db.orders.filter(o => o.buyerId === b.id);
        const totalSpent = myOrders.reduce((s, o) => s + o.total, 0);
        return { id: b.id, name: b.name, phone: b.phone, orderCount: myOrders.length, totalSpent };
      });
      return sendJSON(res, 200, { buyers });
    }

    if (pathname === '/api/admin/products' && req.method === 'GET') {
      const admin = requireAdmin(req, db);
      if (!admin) return sendJSON(res, 403, { error: "Faqat admin uchun" });
      const list = db.products.map(p => {
        const seller = db.users.find(u => u.id === p.sellerId);
        return { ...p, sellerName: seller ? seller.name : "Noma'lum", sellerPhone: seller ? seller.phone : '' };
      });
      return sendJSON(res, 200, { products: list });
    }

    if (pathname === '/api/admin/orders' && req.method === 'GET') {
      const admin = requireAdmin(req, db);
      if (!admin) return sendJSON(res, 403, { error: "Faqat admin uchun" });
      const list = [...db.orders].sort((a, b) => b.id - a.id);
      return sendJSON(res, 200, { orders: list });
    }

    const adminOrderMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (adminOrderMatch && req.method === 'PATCH') {
      const admin = requireAdmin(req, db);
      if (!admin) return sendJSON(res, 403, { error: "Faqat admin uchun" });
      const order = db.orders.find(o => o.id === Number(adminOrderMatch[1]));
      if (!order) return sendJSON(res, 404, { error: "Buyurtma topilmadi" });
      const { adminNote } = await readBody(req);
      order.adminNote = adminNote || '';
      saveDB(db);
      return sendJSON(res, 200, { order });
    }

    if (pathname === '/api/admin/payments' && req.method === 'GET') {
      const admin = requireAdmin(req, db);
      if (!admin) return sendJSON(res, 403, { error: "Faqat admin uchun" });
      const list = [...db.payments].sort((a, b) => b.id - a.id);
      return sendJSON(res, 200, { payments: list });
    }

    const adminPayMatch = pathname.match(/^\/api\/admin\/payments\/(\d+)$/);
    if (adminPayMatch && req.method === 'PATCH') {
      const admin = requireAdmin(req, db);
      if (!admin) return sendJSON(res, 403, { error: "Faqat admin uchun" });
      const payment = db.payments.find(p => p.id === Number(adminPayMatch[1]));
      if (!payment) return sendJSON(res, 404, { error: "To'lov topilmadi" });
      const { status, adminNote } = await readBody(req);
      if (!['tasdiqlandi', 'rad etildi'].includes(status)) return sendJSON(res, 400, { error: "Noto'g'ri holat" });
      const wasApproved = payment.status === 'tasdiqlandi';
      payment.status = status;
      payment.adminNote = adminNote !== undefined ? adminNote : payment.adminNote;
      const seller = db.users.find(u => u.id === payment.sellerId);
      if (status === 'tasdiqlandi' && !wasApproved && seller) {
        seller.paidCommission = (seller.paidCommission || 0) + payment.amount;
      }
      if (status !== 'tasdiqlandi' && wasApproved && seller) {
        seller.paidCommission = Math.max(0, (seller.paidCommission || 0) - payment.amount);
      }
      saveDB(db);
      return sendJSON(res, 200, { payment });
    }

    if (pathname === '/api/orders' && req.method === 'POST') {
      const user = getUserFromReq(req, db);
      if (!user || user.role !== 'buyer') return sendJSON(res, 403, { error: "Faqat xaridorlar buyurtma bera oladi" });
      const { items, address, phone } = await readBody(req);
      if (!items || !items.length) return sendJSON(res, 400, { error: "Savat bo'sh" });
      if (!address) return sendJSON(res, 400, { error: "Manzilni kiriting" });
      let total = 0;
      const orderItems = items.map(it => {
        const p = db.products.find(pp => pp.id === it.productId);
        if (!p) throw new Error("Mahsulot topilmadi: " + it.productId);
        const qty = Number(it.qty) || 1;
        if ((p.stock || 0) < qty) throw new Error(`"${p.name}" omborda yetarli emas (bor: ${p.stock} dona)`);
        const subtotal = p.price * qty;
        const commission = Math.round(subtotal * COMMISSION_RATE);
        const payout = subtotal - commission;
        total += subtotal;
        return { productId: p.id, name: p.name, price: p.price, qty, sellerId: p.sellerId, subtotal, commission, payout };
      });
      orderItems.forEach(it => {
        const p = db.products.find(pp => pp.id === it.productId);
        if (p) p.stock -= it.qty;
      });
      const order = {
        id: db.nextId.order++, buyerId: user.id, buyerName: user.name,
        items: orderItems, total, address, phone: phone || user.phone,
        status: 'yangi', paymentMethod: 'naqd/yetkazishda',
        createdAt: new Date().toISOString()
      };
      db.orders.push(order);
      saveDB(db);
      return sendJSON(res, 200, { order });
    }

    if (pathname === '/api/orders/mine' && req.method === 'GET') {
      const user = getUserFromReq(req, db);
      if (!user) return sendJSON(res, 401, { error: "Tizimga kirilmagan" });
      const list = db.orders.filter(o => o.buyerId === user.id).sort((a, b) => b.id - a.id);
      return sendJSON(res, 200, { orders: list });
    }

    if (pathname === '/api/orders/incoming' && req.method === 'GET') {
      const user = getUserFromReq(req, db);
      if (!user || user.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const list = db.orders
        .map(o => ({ ...o, items: o.items.filter(it => it.sellerId === user.id) }))
        .filter(o => o.items.length > 0)
        .sort((a, b) => b.id - a.id);
      return sendJSON(res, 200, { orders: list });
    }

    if (pathname === '/api/earnings' && req.method === 'GET') {
      const user = getUserFromReq(req, db);
      if (!user || user.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      let totalSales = 0, totalCommission = 0, totalPayout = 0, orderCount = 0;
      db.orders.forEach(o => {
        const mine = o.items.filter(it => it.sellerId === user.id);
        if (mine.length) {
          orderCount++;
          mine.forEach(it => {
            totalSales += it.subtotal || (it.price * it.qty);
            totalCommission += it.commission || 0;
            totalPayout += it.payout || (it.price * it.qty);
          });
        }
      });
      const debt = totalCommission - (user.paidCommission || 0);
      return sendJSON(res, 200, { totalSales, totalCommission, totalPayout, orderCount, commissionRate: COMMISSION_RATE, payoutCard: PAYOUT_CARD, paidCommission: user.paidCommission || 0, debt, debtLimit: DEBT_LIMIT, restricted: debt > DEBT_LIMIT });
    }

    const statusMatch = pathname.match(/^\/api\/orders\/(\d+)\/status$/);
    if (statusMatch && req.method === 'PATCH') {
      const user = getUserFromReq(req, db);
      if (!user || user.role !== 'seller') return sendJSON(res, 403, { error: "Ruxsat yo'q" });
      const oid = Number(statusMatch[1]);
      const order = db.orders.find(o => o.id === oid);
      if (!order) return sendJSON(res, 404, { error: "Buyurtma topilmadi" });
      const ownsItem = order.items.some(it => it.sellerId === user.id);
      if (!ownsItem) return sendJSON(res, 403, { error: "Bu sizning buyurtmangiz emas" });
      const { status } = await readBody(req);
      order.status = status;
      saveDB(db);
      return sendJSON(res, 200, { order });
    }

    return sendJSON(res, 404, { error: "Bunday endpoint yo'q" });
  } catch (e) {
    console.error(e);
    return sendJSON(res, 500, { error: "Server xatosi: " + e.message });
  }
});

server.listen(PORT, () => {
  console.log(`SavdoUz server ishga tushdi: http://localhost:${PORT}`);
});
