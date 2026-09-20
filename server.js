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
    const empty = { users: [], products: [], orders: [], nextId: { user: 1, product: 1, order: 1 } };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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
      const list = db.products.map(p => {
        const seller = db.users.find(u => u.id === p.sellerId);
        return { ...p, sellerName: seller ? seller.name : "Noma'lum" };
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
      return sendJSON(res, 200, { totalSales, totalCommission, totalPayout, orderCount, commissionRate: COMMISSION_RATE });
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
