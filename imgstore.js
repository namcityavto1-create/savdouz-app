// imgstore.js — SavdoUz: rasmlarni alohida MongoDB klasterlarga chiqaradi
//   MONGODB_URI_PRODUCTS — mahsulot rasmlari
//   MONGODB_URI_RECEIPTS — xaridor cheklari
//   MONGODB_URI_DOCS     — sotuvchi pasport/ID va selfi
// Havola qo'yilmagan bo'lim eskicha asosiy bazada qoladi (hech narsa buzilmaydi).
// Eski rasmlar avtomatik ko'chiriladi. Asosiy hujjatda rasm o'rnida "ext:<id>" belgisi qoladi.
const http = require('http');
let MongoClient = null;
try { MongoClient = require('mongodb').MongoClient; } catch (e) { console.error("imgstore: 'mongodb' moduli topilmadi"); }

const URI = { products: process.env.MONGODB_URI_PRODUCTS, receipts: process.env.MONGODB_URI_RECEIPTS, docs: process.env.MONGODB_URI_DOCS };
const MARK = 'ext:';
const isData = s => typeof s === 'string' && s.startsWith('data:');
const isExt = s => typeof s === 'string' && s.startsWith(MARK);
const own = new Set(), dbs = {}, clients = {};
let mainClient = null;
const origDb = MongoClient ? MongoClient.prototype.db : null;

// ---- Klasterlarga ulanish (bir xil havola bo'lsa, bitta ulanish ishlatiladi) ----
if (MongoClient) {
  for (const kind of Object.keys(URI)) {
    const uri = URI[kind]; if (!uri) continue;
    let c = clients[uri];
    if (!c) {
      c = clients[uri] = new MongoClient(uri); own.add(c);
      c.connect().then(() => console.log('imgstore: klaster ulandi ✅')).catch(e => console.error('imgstore: klasterga ulanmadi:', e.message));
    }
    dbs[kind] = origDb.call(c, 'savdouz_img');
  }
  // Sotuvchi hujjatlari (sellerdocs) server.js qaysi joydan so'rasa ham, DOCS klasteriga yo'naltiriladi
  if (dbs.docs) {
    MongoClient.prototype.db = function (...a) {
      const d = origDb.apply(this, a);
      if (own.has(this)) return d;
      if (!mainClient) mainClient = this;
      const oc = d.collection.bind(d);
      d.collection = (n, ...r) => n === 'sellerdocs' ? dbs.docs.collection('sellerdocs', ...r) : oc(n, ...r);
      return d;
    };
  }
}

function sendImg(res, dataUrl, cache) {
  const d = dataUrl && String(dataUrl).match(/^data:(.+?);base64,(.*)$/s);
  if (!d) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': d[1], 'Cache-Control': cache });
  res.end(Buffer.from(d[2], 'base64'));
}

// ---- Eski va yangi rasmlarni klasterga ko'chirish ----
let busy = false, again = false;
async function sweep() {
  const SV = global.SV;
  if (!SV || (!dbs.products && !dbs.receipts)) return;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const db = await SV.loadDB(); let moved = 0;
    if (dbs.products) {
      const col = dbs.products.collection('productimg');
      for (const p of db.products) {
        const img = p.image;
        if (!isData(img)) continue;
        await col.replaceOne({ _id: p.id }, { _id: p.id, image: img, v: p.imgv || 0 }, { upsert: true });
        if (p.image === img) { p.image = MARK + p.id; moved++; }   // yuklash paytida rasm almashgan bo'lsa tegmaymiz
      }
    }
    if (dbs.receipts) {
      const col = dbs.receipts.collection('receiptimg');
      for (const o of db.orders) {
        const img = o.receiptImage;
        if (!isData(img)) continue;
        await col.replaceOne({ _id: o.id }, { _id: o.id, image: img }, { upsert: true });
        if (o.receiptImage === img) { o.receiptImage = MARK + o.id; moved++; }
      }
    }
    if (moved) { await SV.saveDB(db); console.log('imgstore: ' + moved + ' ta rasm klasterga ko\'chirildi'); }
  } catch (e) { console.error('imgstore sweep:', e.message); }
  busy = false;
  if (again) { again = false; setTimeout(sweep, 500); }
}

// ---- Keraksiz (o'chirilgan mahsulot / eskirgan chek) rasmlarni tozalash ----
async function gc() {
  const SV = global.SV; if (!SV) return;
  try {
    const db = await SV.loadDB();
    if (dbs.products) {
      const col = dbs.products.collection('productimg');
      const live = new Set(db.products.filter(p => isExt(p.image)).map(p => p.id));
      const del = (await col.find({}, { projection: { _id: 1 } }).toArray()).map(x => x._id).filter(id => !live.has(id));
      if (del.length) await col.deleteMany({ _id: { $in: del } });
    }
    if (dbs.receipts) {
      const col = dbs.receipts.collection('receiptimg');
      const live = new Set(db.orders.filter(o => isExt(o.receiptImage)).map(o => o.id));
      const del = (await col.find({}, { projection: { _id: 1 } }).toArray()).map(x => x._id).filter(id => !live.has(id));
      if (del.length) await col.deleteMany({ _id: { $in: del } });
    }
  } catch (e) { console.error('imgstore gc:', e.message); }
}

// ---- Eski pasport/selfi hujjatlarini asosiy bazadan DOCS klasteriga ko'chirish ----
async function migrateDocs() {
  if (!dbs.docs || !mainClient) return;
  try {
    const src = origDb.call(mainClient, 'savdouz').collection('sellerdocs'), dst = dbs.docs.collection('sellerdocs');
    let n = 0;
    for (;;) {
      const d = await src.findOne({});
      if (!d) break;
      await dst.replaceOne({ _id: d._id }, d, { upsert: true });
      if (!(await dst.findOne({ _id: d._id }, { projection: { _id: 1 } }))) break;   // yozilmagan bo'lsa o'chirmaymiz
      await src.deleteOne({ _id: d._id }); n++;
    }
    if (n) console.log('imgstore: ' + n + ' ta sotuvchi hujjati DOCS klasteriga ko\'chirildi');
  } catch (e) { console.error('imgstore docs:', e.message); }
}

// ---- So'rovlar: rasmlarni klasterdan beradi ----
async function handle(req, res, orig) {
  const SV = global.SV;
  if (!SV || !String(req.url).startsWith('/api/')) return orig(req, res);
  const u = new URL(req.url, 'http://x'), p = u.pathname, M = req.method;
  if (!req._q) req._q = Object.fromEntries(u.searchParams);
  if (M !== 'GET' && typeof res.on === 'function' && /^\/api\/(products|orders)/.test(p)) res.on('finish', () => setTimeout(sweep, 300));
  let m;
  try {
    if (M === 'GET' && dbs.products && (m = p.match(/^\/api\/img\/(\d+)$/))) {
      const db = await SV.loadDB(), pr = db.products.find(x => x.id === Number(m[1]));
      if (pr && isExt(pr.image)) {
        const d = await dbs.products.collection('productimg').findOne({ _id: pr.id });
        if (d && d.image) return sendImg(res, d.image, 'public, max-age=31536000');
      }
    }
    if (M === 'GET' && dbs.receipts && (m = p.match(/^\/api\/receipt\/(\d+)$/))) {
      const db = await SV.loadDB(), usr = SV.getUserFromReq(req, db), o = db.orders.find(x => x.id === Number(m[1]));
      if (o && isExt(o.receiptImage)) {
        if (!usr || !(o.buyerId === usr.id || usr.role === 'admin' || o.items.some(i => i.sellerId === usr.id))) { res.writeHead(403); return res.end(); }
        const d = await dbs.receipts.collection('receiptimg').findOne({ _id: o.id });
        return sendImg(res, d && d.image, 'private, max-age=3600');
      }
    }
  } catch (e) { console.error('imgstore:', e.message); }
  return orig(req, res);
}

if (MongoClient && (dbs.products || dbs.receipts || dbs.docs)) {
  const orig = http.createServer;
  http.createServer = function (...a) {
    const i = a.findIndex(x => typeof x === 'function');
    if (i !== -1) { const fn = a[i]; a[i] = (req, res) => handle(req, res, fn).catch(e => { console.error(e); try { res.writeHead(500); res.end(); } catch (x) {} }); }
    return orig.apply(this, a);
  };
  setInterval(sweep, 60 * 1000);
  setInterval(gc, 60 * 60 * 1000);
  setInterval(migrateDocs, 10 * 60 * 1000);
  setTimeout(migrateDocs, 20 * 1000);
  console.log('imgstore.js yuklandi ✅ (' + Object.keys(dbs).join(', ') + ')');
} else console.log('imgstore.js: klaster havolalari yo\'q, eski tartib saqlanadi');
