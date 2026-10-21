// SavdoUz — qo'shimcha imkoniyatlar: admin statistikasi (GET /api/admin/stats)
// server.js ichida `require('./extras.js');` qatoridan keyin: require('./features.js');
const http = require('http'), crypto = require('crypto'), url = require('url');
const ADMIN_PHONE = '+998774071234', TZ = 5 * 36e5, DAY = 864e5;
const day = t => new Date(t + TZ).toISOString().slice(0, 10);

function compute(db, now) {
  now = now || Date.now();
  const live = (db.orders || []).filter(o => o.status !== 'bekor qilindi');
  const sum = os => os.reduce((s, o) => s + (o.itemsTotal || o.total || 0), 0);
  const since = n => live.filter(o => now - new Date(o.createdAt).getTime() < n * DAY);
  const today = day(now);
  const series = [];
  for (let i = 6; i >= 0; i--) {
    const d = day(now - i * DAY), os = live.filter(o => day(new Date(o.createdAt).getTime()) === d);
    series.push({ d: d.slice(5), n: os.length, sum: sum(os) });
  }
  const prod = {}, sel = {};
  live.forEach(o => (o.items || []).forEach(it => {
    const p = prod[it.productId] = prod[it.productId] || { name: it.name, qty: 0, sum: 0 };
    p.qty += it.qty; p.sum += it.subtotal || it.price * it.qty;
    const s = sel[it.sellerId] = sel[it.sellerId] || { id: it.sellerId, sum: 0, n: 0 };
    s.sum += it.subtotal || it.price * it.qty; s.n += it.qty;
  }));
  const name = id => { const u = (db.users || []).find(x => x.id === id); return u ? u.name : "Noma'lum"; };
  const users = db.users || [];
  return {
    today: { n: live.filter(o => day(new Date(o.createdAt).getTime()) === today).length, sum: sum(live.filter(o => day(new Date(o.createdAt).getTime()) === today)) },
    week: { n: since(7).length, sum: sum(since(7)) },
    month: { n: since(30).length, sum: sum(since(30)) },
    total: { n: live.length, sum: sum(live) },
    commission: (db.orders || []).filter(o => o.status === 'yetkazildi').reduce((s, o) => s + (o.items || []).reduce((x, it) => x + (it.commission || 0), 0), 0),
    buyers: users.filter(u => u.role === 'buyer').length,
    sellers: users.filter(u => u.role === 'seller').length,
    products: (db.products || []).length,
    series,
    topProducts: Object.values(prod).sort((a, b) => b.qty - a.qty).slice(0, 5),
    topSellers: Object.values(sel).sort((a, b) => b.sum - a.sum).slice(0, 5).map(s => ({ name: name(s.id), sum: s.sum, n: s.n }))
  };
}

let client = null, cache = { t: 0, data: null };
async function load() {
  if (cache.data && Date.now() - cache.t < 60000) return cache.data;
  const { MongoClient } = require('mongodb');
  if (!client) { client = new MongoClient(process.env.MONGODB_URI); await client.connect(); }
  const db = await client.db('savdouz').collection('state').findOne({ _id: 'main' }, { projection: {
    'products.image': 0, 'orders.receiptImage': 0, payments: 0, reviews: 0, messages: 0, fcmTokens: 0, pushSubs: 0, vapid: 0,
    'users.hash': 0, 'users.salt': 0, 'users.txs': 0 } });
  cache = { t: Date.now(), data: compute(db || {}) };
  return cache.data;
}
function adminOf(req, db_users) {
  const secret = process.env.SESSION_SECRET || crypto.createHash('sha256').update('sv:' + String(process.env.MONGODB_URI)).digest('hex');
  const a = req.headers['authorization'], q = url.parse(req.url, true).query;
  const t = a && a.startsWith('Bearer ') ? a.slice(7) : q.t;
  const [id, exp, sig] = String(t || '').split('.');
  if (!sig || Date.now() > Number(exp)) return null;
  const good = crypto.createHmac('sha256', secret).update(id + '.' + exp).digest('hex');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  return Number(id);
}
async function handle(req, res) {
  if (url.parse(req.url).pathname !== '/api/admin/stats' || req.method !== 'GET') return false;
  const send = (c, d) => { res.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(d)); return true; };
  try {
    const uid = adminOf(req);
    if (!uid) return send(403, { error: 'Faqat admin uchun' });
    const { MongoClient } = require('mongodb');
    if (!client) { client = new MongoClient(process.env.MONGODB_URI); await client.connect(); }
    const me = ((await client.db('savdouz').collection('state').findOne({ _id: 'main' }, { projection: { users: { $elemMatch: { id: uid } } } })) || {}).users;
    const u = me && me[0];
    if (!u || u.role !== 'admin') return send(403, { error: 'Faqat admin uchun' });
    if (u.phone !== ADMIN_PHONE && Array.isArray(u.perms) && !u.perms.includes('orders')) return send(403, { error: "Bu bo'lim uchun huquqingiz yo'q" });
    return send(200, await load());
  } catch (e) { console.error('stats xato:', e.message); return send(500, { error: 'Server xatosi: ' + e.message }); }
}
const orig = http.createServer;
http.createServer = function (...a) {
  const h = a[a.length - 1];
  if (typeof h === 'function') a[a.length - 1] = async (req, res) => { if (await handle(req, res)) return; return h(req, res); };
  return orig.apply(this, a);
};
module.exports = { compute };
