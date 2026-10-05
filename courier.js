// ===== SavdoUz: Kuryer + Hamkor moduli (server.js ga 1 qator bilan ulanadi) =====
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { MongoClient } = require('mongodb');

// ---------- SOZLAMALAR (raqamlarni shu yerda o'zgartirasiz) ----------
const CFG = {
  cardNumber: process.env.CARD_NUMBER || '9860 1901 0557 8776',
  cardHolder: process.env.CARD_HOLDER || 'V. I.',      // ismni faqat bosh harflar bilan ko'rsatamiz
  baseFee: 8000, kmFee: 2000, maxKm: 15, routeK: 1.3,  // 1-km 8000, keyingi har km 2000, to'g'ri chiziq x1.3
  minCash: 300000, maxCash: 5000000, maxProduct: 300000,
  minBalance: 10000, warnBalance: 15000, workHours: 12, maxActive: 2,
  promoDays: 30, promoRate: 0.01, rate: 0.05,          // 1 oy 1%, keyin 5%
  withdrawRate: 0.01, minWithdraw: 50000,              // yechib olishda 1%
  waitMin: 10, calls: 3,                               // mijoz javob bermasa: 10 daqiqa, 3 qo'ng'iroq
  partnerCancelPct: 0.5,                               // kuryer yo'lda bo'lsa Hamkor bekor qilsa haqning 50%
  maxCancels: 3, blockHours: 24                        // 24 soatda 3 marta bekor qilsa 24 soat cheklanadi
};

class E extends Error { constructor(m, s) { super(m); this.status = s || 400; } }
const iso = () => new Date().toISOString();

// ---------- MongoDB (o'z kolleksiyalarimiz, asosiy "state" hujjatiga tegmaydi) ----------
const client = new MongoClient(process.env.MONGODB_URI || '');
let D = null, ready = null;
function init() {
  if (!ready) ready = client.connect().then(async () => {
    D = client.db('savdouz');
    await D.collection('couriers').createIndex({ phone: 1 }, { unique: true }).catch(() => {});
    await D.collection('partners').createIndex({ phone: 1 }, { unique: true }).catch(() => {});
    console.log('Kuryer moduli tayyor ✅');
  });
  return ready;
}
const C = n => D.collection(n);
const unwrap = r => (r && typeof r === 'object' && 'lastErrorObject' in r) ? r.value : r;
const fu = async (coll, filter, upd, opt) => unwrap(await C(coll).findOneAndUpdate(filter, upd, Object.assign({ returnDocument: 'after' }, opt || {})));
const nextId = async n => (await fu('counters', { _id: n }, { $inc: { seq: 1 } }, { upsert: true })).seq;

// ---------- Token va parol (asosiy server bilan bir xil SECRET) ----------
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('sv:' + String(process.env.MONGODB_URI)).digest('hex');
const sign = p => crypto.createHmac('sha256', SECRET).update(p).digest('hex');
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const tok = (k, id) => { const p = k + id + '.' + (Date.now() + 30 * 864e5); return p + '.' + sign(p); };
const hashPw = (pw, salt) => { salt = salt || crypto.randomBytes(16).toString('hex'); return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') }; };
const verify = (pw, salt, hash) => eq(crypto.scryptSync(pw, salt, 64).toString('hex'), hash);
function parseTok(t) {
  const [a, exp, sig] = String(t || '').split('.');
  if (!sig || !eq(sign(a + '.' + exp), sig) || Date.now() > Number(exp)) return null;
  const m = a.match(/^([cp]?)(\d+)$/);
  return m ? { kind: m[1] || 'u', id: Number(m[2]) } : null;
}
let adm = { t: 0, ids: [] };
async function isAdmin(id) {
  if (Date.now() - adm.t > 60000) {
    const d = await C('state').findOne({ _id: 'main' }, { projection: { 'users.id': 1, 'users.role': 1 } });
    adm = { t: Date.now(), ids: ((d && d.users) || []).filter(u => u.role === 'admin').map(u => u.id) };
  }
  return adm.ids.includes(id);
}
async function who(req, q) {
  const h = req.headers.authorization;
  const p = parseTok(h && h.startsWith('Bearer ') ? h.slice(7) : q.get('t'));
  if (!p) return null;
  if (p.kind === 'c') { const d = await C('couriers').findOne({ _id: p.id }); return d ? { kind: 'c', doc: d } : null; }
  if (p.kind === 'p') { const d = await C('partners').findOne({ _id: p.id }); return d ? { kind: 'p', doc: d } : null; }
  return (await isAdmin(p.id)) ? { kind: 'a' } : null;
}

// ---------- Hisob-kitob ----------
const rateOf = c => (!c.firstDoneAt || Date.now() < new Date(c.firstDoneAt).getTime() + CFG.promoDays * 864e5) ? CFG.promoRate : CFG.rate;
const isOn = c => !!c.workUntil && new Date(c.workUntil) > new Date();
const isRestricted = c => !!c.restrictedUntil && new Date(c.restrictedUntil) > new Date();
function dist(a, b) {
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
function price(a, b) {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) throw new E("Joylashuv noto'g'ri");
  const k = Math.max(1, Math.ceil(dist(a, b) * CFG.routeK));
  if (k > CFG.maxKm) return { k, fee: null };
  return { k, fee: Math.round((CFG.baseFee + (k - 1) * CFG.kmFee) / 1000) * 1000 };
}
const normPhone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 9) d = '998' + d; return d.length === 12 ? '+' + d : null; };

const pubC = c => ({
  id: c._id, name: c.name, phone: c.phone, transport: c.transport, status: c.status, balance: c.balance || 0, cash: c.cash || 0,
  online: isOn(c), workUntil: isOn(c) ? c.workUntil : null, restrictedUntil: isRestricted(c) ? c.restrictedUntil : null,
  rate: rateOf(c), done: c.doneCount || 0, createdAt: c.createdAt
});
const pubP = p => ({ id: p._id, name: p.name, phone: p.phone, type: p.type, address: p.address, lat: p.lat, lng: p.lng, balance: p.balance || 0, held: p.held || 0, card: p.card || '' });
const ordC = o => ({
  id: o._id, status: o.status, partner: o.partnerName, type: o.partnerType, ready: o.ready, productSum: o.productSum, fee: o.fee, km: o.km,
  arrivedAt: o.arrivedAt || null, callCount: o.callCount || 0,
  pickup: { address: o.pickup.address, lat: o.pickup.lat, lng: o.pickup.lng, phone: o.pickup.phone },
  customer: { address: o.customer.address, lat: o.customer.lat, lng: o.customer.lng, name: o.customer.name, phone: o.customer.phone }
});
const ordOpen = o => { const x = ordC(o); x.pickup.phone = undefined; x.customer.phone = undefined; x.customer.name = undefined; return x; };
const ordP = o => ({
  id: o._id, status: o.status, ready: o.ready, type: o.partnerType, productSum: o.productSum, fee: o.fee, km: o.km, by: o.createdBy,
  customer: { name: o.customer.name, phone: o.customer.phone, address: o.customer.address },
  courierName: o.courierName || null, courierPhone: o.courierPhone || null, sellerPaid: !!o.sellerPaid, createdAt: o.createdAt
});

async function createOrder(p, b, by) {
  const name = String(b.name || '').trim(), phone = normPhone(b.phone), address = String(b.address || '').trim();
  if (!name || !phone || !address) throw new E("Ism, telefon va manzilni to'ldiring");
  if (!p.lat || !p.lng) throw new E("Avval do'kon joylashuvini xaritada belgilang (Profil)");
  const sum = Math.round(Number(b.productSum) || 0);
  if (sum < 0 || sum > CFG.maxProduct) throw new E(`Mahsulot summasi 0 dan ${CFG.maxProduct} so'mgacha bo'lsin`);
  const to = { lat: Number(b.lat), lng: Number(b.lng) };
  const { k, fee } = price(p, to);
  if (fee === null) throw new E(`Masofa ${CFG.maxKm} km dan oshmasin`);
  const okHold = await fu('partners', { _id: p._id, balance: { $gte: fee } }, { $inc: { balance: -fee, held: fee } });
  if (!okHold) throw new E(`Balans yetarli emas. Yetkazish haqi: ${fee} so'm`);
  const o = {
    _id: await nextId('order'), partnerId: p._id, partnerName: p.name, partnerType: p.type, ready: p.type !== 'kafe',
    pickup: { address: p.address, lat: p.lat, lng: p.lng, phone: p.phone },
    customer: { name, phone, address, lat: to.lat, lng: to.lng },
    productSum: sum, km: k, fee, status: 'yangi', callCount: 0, calls: [], createdBy: by, createdAt: iso()
  };
  await C('corders').insertOne(o);
  return o;
}

async function login(col, kind, b) {
  const c = await C(col).findOne({ phone: normPhone(b.phone) });
  if (!c || !verify(String(b.password || ''), c.salt, c.hash)) throw new E("Telefon raqam yoki parol xato");
  return { token: tok(kind, c._id) };
}

// ---------- Asosiy yo'naltirgich ----------
async function handle(req, res) {
  const u = new URL(req.url, 'http://x'), P = u.pathname, M = req.method;
  if (M === 'GET' && (P === '/kuryer' || P === '/hamkor' || P === '/kuryer-admin')) {
    fs.readFile(path.join(__dirname, 'public', 'courier.html'), (e, d) => {
      if (e) { res.writeHead(404); return res.end('public/courier.html topilmadi'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(d);
    });
    return true;
  }
  if (!P.startsWith('/api/c/')) return false;
  await init();
  const b = M === 'POST' ? await readBody(req) : {};
  const w = await who(req, u.searchParams);
  const S = P.slice(6);
  let m;
  const R = (method, re) => M === method && (m = S.match(re));
  const ok = o => { send(res, 200, o || {}); return true; };
  const need = k => { if (!w) throw new E('Kirish kerak', 401); if (w.kind !== k) throw new E("Ruxsat yo'q", 403); return w.doc; };
  const owner = () => { if (!w || (w.kind !== 'c' && w.kind !== 'p')) throw new E('Kirish kerak', 401); return w; };

  if (R('GET', /^\/info$/)) return ok({
    card: { number: CFG.cardNumber, holder: CFG.cardHolder },
    cfg: { minCash: CFG.minCash, minBalance: CFG.minBalance, warnBalance: CFG.warnBalance, maxProduct: CFG.maxProduct, waitMin: CFG.waitMin, calls: CFG.calls, baseFee: CFG.baseFee, kmFee: CFG.kmFee, maxKm: CFG.maxKm, withdrawRate: CFG.withdrawRate, minWithdraw: CFG.minWithdraw }
  });

  // ===== Ro'yxatdan o'tish / kirish =====
  if (R('POST', /^\/courier\/register$/)) {
    const name = String(b.name || '').trim(), phone = normPhone(b.phone), pw = String(b.password || '');
    if (name.length < 3) throw new E('Ism familiyani yozing');
    if (!phone) throw new E("Telefon raqam noto'g'ri");
    if (pw.length < 6) throw new E("Parol kamida 6 ta belgi bo'lsin");
    if (!String(b.passport || '').startsWith('data:') || !String(b.selfie || '').startsWith('data:')) throw new E('Pasport va selfi rasmini yuklang');
    const h = hashPw(pw), id = await nextId('courier');
    try {
      await C('couriers').insertOne({ _id: id, name, phone, transport: String(b.transport || 'Piyoda'), salt: h.salt, hash: h.hash, passport: b.passport, selfie: b.selfie, status: 'kutilmoqda', balance: 0, cash: 0, doneCount: 0, cancels: [], createdAt: iso() });
    } catch (e) { if (e.code === 11000) throw new E("Bu raqam allaqachon ro'yxatdan o'tgan"); throw e; }
    return ok({ token: tok('c', id) });
  }
  if (R('POST', /^\/courier\/login$/)) return ok(await login('couriers', 'c', b));
  if (R('POST', /^\/partner\/register$/)) {
    const name = String(b.name || '').trim(), phone = normPhone(b.phone), pw = String(b.password || '');
    if (name.length < 2) throw new E("Do'kon yoki kafe nomini yozing");
    if (!phone) throw new E("Telefon raqam noto'g'ri");
    if (pw.length < 6) throw new E("Parol kamida 6 ta belgi bo'lsin");
    const h = hashPw(pw), id = await nextId('partner');
    try {
      await C('partners').insertOne({ _id: id, name, phone, type: b.type === 'kafe' ? 'kafe' : 'dokon', address: String(b.address || '').trim(), salt: h.salt, hash: h.hash, balance: 0, held: 0, createdAt: iso() });
    } catch (e) { if (e.code === 11000) throw new E("Bu raqam allaqachon ro'yxatdan o'tgan"); throw e; }
    return ok({ token: tok('p', id) });
  }
  if (R('POST', /^\/partner\/login$/)) return ok(await login('partners', 'p', b));

  // ===== Balans to'ldirish (kuryer va Hamkor uchun bir xil) =====
  if (R('POST', /^\/topup$/)) {
    const x = owner(), amount = Math.round(Number(b.amount));
    if (!(amount >= 1000 && amount <= 5e7)) throw new E("Summa noto'g'ri");
    const code = String(b.code || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12);
    const rec = typeof b.receipt === 'string' && b.receipt.startsWith('data:') ? b.receipt : null;
    await C('topups').insertOne({ _id: await nextId('topup'), role: x.kind, userId: x.doc._id, userName: x.doc.name, amount, code, receipt: rec, status: 'kutilmoqda', createdAt: iso() });
    return ok();
  }
  if (R('GET', /^\/topups$/)) {
    const x = owner();
    return ok({ topups: await C('topups').find({ role: x.kind, userId: x.doc._id }, { projection: { receipt: 0 } }).sort({ _id: -1 }).limit(20).toArray() });
  }

  // ===== KURYER =====
  if (R('GET', /^\/courier\/me$/)) return ok({ me: pubC(need('c')) });
  if (R('POST', /^\/courier\/work$/)) {
    const c = need('c');
    if (c.status !== 'faol') throw new E('Hisobingiz hali tasdiqlanmagan');
    if (!b.on) { await C('couriers').updateOne({ _id: c._id }, { $set: { workUntil: null } }); return ok(); }
    if (isRestricted(c)) throw new E('Siz vaqtincha cheklangansiz');
    if ((c.balance || 0) < CFG.minBalance) throw new E("Avval hisobingizni to'ldiring");
    const cash = Math.round(Number(b.cash) || 0);
    if (cash < CFG.minCash) throw new E(`Ishga chiqish uchun kamida ${CFG.minCash} so'm naqd pul kerak`);
    if (cash > CFG.maxCash) throw new E("Naqd pul summasi juda katta");
    const set = { cash };
    if (!isOn(c)) set.workUntil = new Date(Date.now() + CFG.workHours * 36e5).toISOString();
    await C('couriers').updateOne({ _id: c._id }, { $set: set });
    return ok();
  }
  if (R('POST', /^\/courier\/cash$/)) {
    const c = need('c'), cash = Math.round(Number(b.cash));
    if (!(cash >= 0 && cash <= CFG.maxCash)) throw new E("Summa noto'g'ri");
    await C('couriers').updateOne({ _id: c._id }, { $set: { cash } });
    return ok();
  }
  if (R('GET', /^\/courier\/orders$/)) {
    const c = need('c');
    let open = [];
    if (isOn(c) && c.status === 'faol' && (c.balance || 0) >= CFG.minBalance && !isRestricted(c)) {
      const lim = Math.min(c.cash || 0, CFG.maxProduct);
      open = (await C('corders').find({ status: 'yangi', productSum: { $lte: lim } }).sort({ _id: -1 }).limit(20).toArray()).map(ordOpen);
    }
    const mine = (await C('corders').find({ courierId: c._id }).sort({ _id: -1 }).limit(15).toArray()).map(ordC);
    return ok({ open, mine });
  }
  if (R('POST', /^\/courier\/orders\/(\d+)\/(\w+)$/)) {
    const c = need('c'), id = Number(m[1]), act = m[2], now = iso();
    const mineQ = { _id: id, courierId: c._id };
    if (act === 'accept') {
      if (!isOn(c) || c.status !== 'faol' || isRestricted(c)) throw new E("Avval 'Ishdaman' tugmasini bosing");
      if ((c.balance || 0) < CFG.minBalance) throw new E("Avval hisobingizni to'ldiring");
      if (await C('corders').countDocuments({ courierId: c._id, status: { $in: ['qabul', 'oldi'] } }) >= CFG.maxActive) throw new E(`Bir vaqtda ${CFG.maxActive} tadan ortiq buyurtma olib bo'lmaydi`);
      const o0 = await C('corders').findOne({ _id: id });
      if (!o0) throw new E('Buyurtma topilmadi');
      if (o0.productSum > Math.min(c.cash || 0, CFG.maxProduct)) throw new E("Qo'lingizdagi naqd pul bu buyurtma uchun yetmaydi");
      const o = await fu('corders', { _id: id, status: 'yangi' }, { $set: { status: 'qabul', courierId: c._id, courierName: c.name, courierPhone: c.phone, acceptedAt: now } });
      if (!o) throw new E('Buyurtmani boshqa kuryer oldi');
      return ok();
    }
    if (act === 'release') {
      const o = await fu('corders', Object.assign({ status: 'qabul' }, mineQ), { $set: { status: 'yangi' }, $unset: { courierId: '', courierName: '', courierPhone: '', acceptedAt: '' } });
      if (!o) throw new E("Bekor qilib bo'lmaydi");
      const recent = (c.cancels || []).filter(t => Date.now() - new Date(t) < 864e5).concat(now);
      const set = { cancels: recent };
      if (recent.length >= CFG.maxCancels) { set.restrictedUntil = new Date(Date.now() + CFG.blockHours * 36e5).toISOString(); set.workUntil = null; }
      await C('couriers').updateOne({ _id: c._id }, { $set: set });
      return ok();
    }
    if (act === 'pickup') {
      const o0 = await C('corders').findOne(Object.assign({ status: 'qabul' }, mineQ));
      if (!o0) throw new E('Buyurtma topilmadi');
      if (o0.partnerType === 'kafe' && !o0.ready) throw new E("Ovqat hali tayyor emas. 'Tayyor' bosilishini kuting");
      const cc = await fu('couriers', { _id: c._id, cash: { $gte: o0.productSum } }, { $inc: { cash: -o0.productSum } });
      if (!cc) throw new E("Qo'lingizdagi naqd pul yetmaydi. Hamyon bo'limida pulni tuzating");
      const o = await fu('corders', Object.assign({ status: 'qabul' }, mineQ), { $set: { status: 'oldi', pickedAt: now } });
      if (!o) { await C('couriers').updateOne({ _id: c._id }, { $inc: { cash: o0.productSum } }); throw new E('Holat o`zgargan'); }
      return ok();
    }
    if (act === 'arrived') {
      await C('corders').updateOne(Object.assign({ status: 'oldi', arrivedAt: { $exists: false } }, mineQ), { $set: { arrivedAt: now } });
      return ok();
    }
    if (act === 'call') {
      const r = await C('corders').updateOne(Object.assign({ status: 'oldi', arrivedAt: { $exists: true } }, mineQ), { $inc: { callCount: 1 }, $push: { calls: now } });
      if (!r.matchedCount) throw new E("Avval 'Yetib keldim' ni bosing");
      return ok();
    }
    if (act === 'done') {
      const o = await fu('corders', Object.assign({ status: 'oldi' }, mineQ), { $set: { status: 'yetkazildi', doneAt: now } });
      if (!o) throw new E('Buyurtma topilmadi');
      const com = Math.round(o.fee * rateOf(c));
      await C('couriers').updateOne({ _id: c._id }, { $inc: { cash: o.productSum + o.fee, balance: -com, doneCount: 1 } });
      await C('couriers').updateOne({ _id: c._id, firstDoneAt: { $exists: false } }, { $set: { firstDoneAt: now } });
      await C('partners').updateOne({ _id: o.partnerId }, { $inc: { held: -o.fee, balance: o.fee } }); // yetkazish haqini mijoz to'ladi, Hamkorga qaytadi
      await C('corders').updateOne({ _id: id }, { $set: { commission: com } });
      return ok();
    }
    if (act === 'noanswer') {
      const o0 = await C('corders').findOne(Object.assign({ status: 'oldi' }, mineQ));
      if (!o0) throw new E('Buyurtma topilmadi');
      if (!o0.arrivedAt) throw new E("Avval 'Yetib keldim' ni bosing");
      if (Date.now() - new Date(o0.arrivedAt) < CFG.waitMin * 60000) throw new E(`${CFG.waitMin} daqiqa kutishingiz kerak`);
      if ((o0.callCount || 0) < CFG.calls) throw new E(`Kamida ${CFG.calls} marta qo'ng'iroq qiling`);
      const o = await fu('corders', Object.assign({ status: 'oldi' }, mineQ), { $set: { status: 'javob_yoq', doneAt: now } });
      if (!o) throw new E('Holat o`zgargan');
      const com = Math.round(o.fee * rateOf(c));
      // mahsulotni sotuvchiga qaytaradi (pulini oladi), yetkazish haqi Hamkor balansidan kuryerga yoziladi
      await C('couriers').updateOne({ _id: c._id }, { $inc: { cash: o.productSum, balance: o.fee - com } });
      await C('partners').updateOne({ _id: o.partnerId }, { $inc: { held: -o.fee } });
      await C('corders').updateOne({ _id: id }, { $set: { commission: com } });
      return ok();
    }
    throw new E("Noma'lum amal");
  }

  // ===== HAMKOR =====
  if (R('GET', /^\/partner\/me$/)) return ok({ me: pubP(need('p')) });
  if (R('POST', /^\/partner\/profile$/)) {
    const p = need('p'), lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new E('Xaritadan joylashuvni belgilang');
    const address = String(b.address || '').trim();
    if (!address) throw new E('Manzilni yozing');
    await C('partners').updateOne({ _id: p._id }, { $set: { lat, lng, address } });
    return ok();
  }
  if (R('POST', /^\/price$/)) {
    let p = null;
    if (w && w.kind === 'p') p = w.doc; else if (w && w.kind === 'a') p = await C('partners').findOne({ _id: Number(b.partnerId) });
    if (!p || !p.lat) throw new E("Do'kon joylashuvi belgilanmagan");
    const r = price(p, { lat: Number(b.lat), lng: Number(b.lng) });
    return ok({ km: r.k, fee: r.fee, max: CFG.maxKm });
  }
  if (R('POST', /^\/partner\/orders$/)) { const o = await createOrder(need('p'), b, 'hamkor'); return ok({ id: o._id, fee: o.fee }); }
  if (R('GET', /^\/partner\/orders$/)) {
    const p = need('p');
    return ok({ orders: (await C('corders').find({ partnerId: p._id }).sort({ _id: -1 }).limit(40).toArray()).map(ordP) });
  }
  if (R('POST', /^\/partner\/orders\/(\d+)\/(ready|paid|cancel)$/)) {
    const p = need('p'), id = Number(m[1]), act = m[2], q = { _id: id, partnerId: p._id };
    if (act === 'ready') { await C('corders').updateOne(Object.assign({ status: { $in: ['yangi', 'qabul'] } }, q), { $set: { ready: true } }); return ok(); }
    if (act === 'paid') { await C('corders').updateOne(Object.assign({ status: { $in: ['oldi', 'yetkazildi', 'javob_yoq'] } }, q), { $set: { sellerPaid: true } }); return ok(); }
    const o = await C('corders').findOne(q);
    if (!o) throw new E('Buyurtma topilmadi');
    if (o.status === 'yangi') {
      if (!(await fu('corders', Object.assign({ status: 'yangi' }, q), { $set: { status: 'bekor', doneAt: iso() } }))) throw new E("Holat o'zgargan, qayta urining");
      await C('partners').updateOne({ _id: p._id }, { $inc: { held: -o.fee, balance: o.fee } });
      return ok();
    }
    if (o.status === 'qabul') {
      const x = await fu('corders', Object.assign({ status: 'qabul' }, q), { $set: { status: 'bekor', doneAt: iso() } });
      if (!x) throw new E("Holat o'zgargan, qayta urining");
      const pay = Math.round(o.fee * CFG.partnerCancelPct / 100) * 100;
      await C('partners').updateOne({ _id: p._id }, { $inc: { held: -o.fee, balance: o.fee - pay } });
      const cc = await C('couriers').findOne({ _id: x.courierId });
      if (cc) await C('couriers').updateOne({ _id: cc._id }, { $inc: { balance: pay - Math.round(pay * rateOf(cc)) } });
      return ok();
    }
    throw new E("Bu bosqichda bekor qilib bo'lmaydi (mahsulot kuryerda)");
  }
  if (R('POST', /^\/withdraw$/)) {
    const p = need('p'), amount = Math.round(Number(b.amount)), card = String(b.card || '').replace(/\D/g, '');
    if (!(amount >= CFG.minWithdraw)) throw new E(`Eng kam summa: ${CFG.minWithdraw} so'm`);
    if (card.length !== 16) throw new E("Karta raqami 16 ta raqam bo'lsin");
    const fee = Math.round(amount * CFG.withdrawRate / 100) * 100, cardF = card.replace(/(.{4})/g, '$1 ').trim();
    const x = await fu('partners', { _id: p._id, balance: { $gte: amount + fee } }, { $inc: { balance: -(amount + fee) }, $set: { card: cardF } });
    if (!x) throw new E(`Balansda yetarli mablag' yo'q. Komissiya bilan kerak: ${amount + fee} so'm`);
    await C('withdrawals').insertOne({ _id: await nextId('withdraw'), partnerId: p._id, partnerName: p.name, amount, fee, card: cardF, status: 'kutilmoqda', createdAt: iso() });
    return ok();
  }
  if (R('GET', /^\/partner\/withdrawals$/)) {
    const p = need('p');
    return ok({ list: await C('withdrawals').find({ partnerId: p._id }).sort({ _id: -1 }).limit(20).toArray() });
  }

  // ===== ADMIN =====
  if (R('GET', /^\/admin\/data$/)) {
    need('a');
    const cs = await C('couriers').find({}, { projection: { passport: 0, selfie: 0, salt: 0, hash: 0 } }).sort({ _id: -1 }).limit(200).toArray();
    const ps = await C('partners').find({}, { projection: { salt: 0, hash: 0 } }).sort({ _id: -1 }).limit(200).toArray();
    const tp = await C('topups').find({}, { projection: { receipt: 0 } }).sort({ _id: -1 }).limit(60).toArray();
    const hasR = new Set((await C('topups').find({ receipt: { $ne: null } }, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(60).toArray()).map(x => x._id));
    const wd = await C('withdrawals').find({}).sort({ _id: -1 }).limit(40).toArray();
    const od = await C('corders').find({}).sort({ _id: -1 }).limit(50).toArray();
    return ok({
      couriers: cs.map(pubC), partners: ps.map(pubP), topups: tp.map(t => Object.assign(t, { hasReceipt: hasR.has(t._id) })), withdrawals: wd,
      orders: od.map(o => Object.assign(ordP(o), { partner: o.partnerName, courierName: o.courierName || '-' }))
    });
  }
  if (R('GET', /^\/admin\/img\/(couriers|topups)\/(\d+)\/(passport|selfie|receipt)$/)) {
    need('a');
    const d = await C(m[1]).findOne({ _id: Number(m[2]) }, { projection: { [m[3]]: 1 } });
    const mt = d && d[m[3]] && String(d[m[3]]).match(/^data:(.+?);base64,(.*)$/s);
    if (!mt) { res.writeHead(404); res.end(); return true; }
    res.writeHead(200, { 'Content-Type': mt[1], 'Cache-Control': 'private' }); res.end(Buffer.from(mt[2], 'base64'));
    return true;
  }
  if (R('POST', /^\/admin\/courier\/(\d+)$/)) {
    need('a');
    const st = { approve: 'faol', reject: 'rad etildi', block: 'bloklangan', unblock: 'faol' }[b.action];
    if (!st) throw new E("Noto'g'ri amal");
    const set = { status: st }; if (st !== 'faol') set.workUntil = null;
    await C('couriers').updateOne({ _id: Number(m[1]) }, { $set: set });
    return ok();
  }
  if (R('POST', /^\/admin\/topup\/(\d+)$/)) {
    need('a');
    const st = { approve: 'tasdiqlandi', reject: 'rad etildi' }[b.action];
    if (!st) throw new E("Noto'g'ri amal");
    const t = await fu('topups', { _id: Number(m[1]), status: 'kutilmoqda' }, { $set: { status: st, at: iso() } });
    if (!t) throw new E("Bu so'rov allaqachon ko'rib chiqilgan");
    if (st === 'tasdiqlandi') await C(t.role === 'c' ? 'couriers' : 'partners').updateOne({ _id: t.userId }, { $inc: { balance: t.amount } });
    return ok();
  }
  if (R('POST', /^\/admin\/withdraw\/(\d+)$/)) {
    need('a');
    const st = { paid: 'tasdiqlandi', reject: 'rad etildi' }[b.action];
    if (!st) throw new E("Noto'g'ri amal");
    const x = await fu('withdrawals', { _id: Number(m[1]), status: 'kutilmoqda' }, { $set: { status: st, at: iso() } });
    if (!x) throw new E("Bu so'rov allaqachon ko'rib chiqilgan");
    if (st === 'rad etildi') await C('partners').updateOne({ _id: x.partnerId }, { $inc: { balance: x.amount + x.fee } });
    return ok();
  }
  if (R('POST', /^\/admin\/order$/)) {
    need('a');
    const p = await C('partners').findOne({ _id: Number(b.partnerId) });
    if (!p) throw new E('Hamkorni tanlang');
    const o = await createOrder(p, b, 'admin');
    return ok({ id: o._id, fee: o.fee });
  }
  throw new E("Bunday so'rov yo'q", 404);
}

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((ok, no) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 12e6) { no(new E('Hajm juda katta')); req.destroy(); } });
    req.on('end', () => { if (!d) return ok({}); try { ok(JSON.parse(d)); } catch (e) { no(new E("Noto'g'ri so'rov")); } });
  });
}

// ---------- server.js ga ulanish: so'rovlarni avval shu modul tekshiradi ----------
const origCreate = http.createServer;
http.createServer = function (...a) {
  const li = a.find(x => typeof x === 'function');
  const wrapped = async (req, res) => {
    try { if (await handle(req, res)) return; }
    catch (e) {
      if (!(e instanceof E)) console.error('courier.js xato:', e);
      if (!res.headersSent) send(res, e instanceof E ? e.status : 500, { error: e instanceof E ? e.message : 'Server xatosi' });
      return;
    }
    return li(req, res);
  };
  return origCreate.call(http, ...a.map(x => x === li ? wrapped : x));
};
