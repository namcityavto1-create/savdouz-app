// ===== SavdoUz: Taksi moduli (server.js ning 2-qatoriga: require('./taxi.js');) =====
// Yo'llar: /taxi (haydovchi sahifasi), /taxi-admin (admin), /api/taxi/... (API)
// Fayllar: public/taxi.html (haydovchi + admin), public/taxi-ui.js (yo'lovchi ekrani)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { MongoClient } = require('mongodb');

// ---------- SOZLAMALAR ----------
const CFG = {
  cardNumber: process.env.CARD_NUMBER || '9860 1901 0557 8776',
  cardHolder: process.env.CARD_HOLDER || 'V. I.',
  maxKm: 40, routeK: 1.3,                                 // to'g'ri chiziq x1.3
  minBalance: 10000, warnBalance: 15000,                  // haydovchi hisobida kamida shuncha bo'lsin
  promoDays: 30, promoRate: 0.01, rate: 0.05,             // 1 oy 1%, keyin 5% komissiya
  nearKm: 25,                                             // haydovchiga shu masofadagi buyurtmalar ko'rinadi
  workHours: 12, maxCancels: 3, blockHours: 24, expireMin: 30
};
// Tariflar: boshlanish narxi (1-km) va keyingi har km narxi
const TARIFFS = { start: { name: 'Start', base: 8000, km: 2000 }, komfort: { name: 'Komfort', base: 10000, km: 2500 } };
const tariffOf = t => TARIFFS[t] ? t : 'start';
const OWNER_PHONE = '+998774071234';

class E extends Error { constructor(m, s) { super(m); this.status = s || 400; } }
const iso = () => new Date().toISOString();

// ---------- MongoDB ----------
const client = new MongoClient(process.env.MONGODB_URI || '');
let D = null, ready = null;
function init() {
  if (!ready) ready = client.connect().then(async () => {
    D = client.db('savdouz');
    await D.collection('taxidrivers').createIndex({ phone: 1 }, { unique: true }).catch(() => {});
    await D.collection('taxiorders').createIndex({ status: 1, _id: -1 }).catch(() => {});
    await D.collection('taxiorders').createIndex({ userId: 1, status: 1 }).catch(() => {});
    await D.collection('taxiorders').createIndex({ driverId: 1, status: 1 }).catch(() => {});
    console.log('Taksi moduli tayyor ✅');
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
  const m = a.match(/^([tu]?)(\d+)$/);
  return m ? { kind: m[1] || 'u', id: Number(m[2]) } : null;
}
const bearer = req => { const h = req.headers.authorization; return h && h.startsWith('Bearer ') ? h.slice(7) : null; };

let ADM = { t: 0, map: new Map() };
async function adminOk(id) {
  if (Date.now() - ADM.t > 30000) {
    const st = await C('state').findOne({ _id: 'main' }, { projection: { 'users.id': 1, 'users.role': 1, 'users.phone': 1, 'users.perms': 1 } });
    ADM = { t: Date.now(), map: new Map(((st && st.users) || []).filter(u => u.role === 'admin').map(u => [u.id, u])) };
  }
  const u = ADM.map.get(id);
  if (!u) return false;
  if (u.phone === OWNER_PHONE) return true;
  if (!Array.isArray(u.perms)) return true;
  return u.perms.includes('courier');
}
async function mainUser(req, q) {
  const p = parseTok(bearer(req) || q.get('t'));
  if (!p || p.kind !== 'u') throw new E('Kirish kerak', 401);
  const SVI = global.SVI;
  if (!SVI || !SVI.loadDB) throw new E('Server tayyor emas', 503);
  const sdb = await SVI.loadDB();
  const user = sdb.users.find(x => x.id === p.id);
  if (!user) throw new E('Kirish kerak', 401);
  return user;
}
async function notify(userId, title, body, tag) {
  try { const SVI = global.SVI; if (!SVI || !SVI.pushNotify) return; const sdb = await SVI.loadDB(); SVI.pushNotify(sdb, [userId], { title, body, tag: tag || 'taksi', url: '/' }); } catch (e) {}
}

// ---------- Hisob-kitob ----------
function dist(a, b) {
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const okLL = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
function pt(o) {
  const lat = Number(o && o.lat), lng = Number(o && o.lng);
  if (!okLL(lat, lng)) throw new E("Joylashuv noto'g'ri");
  return { lat, lng, address: String((o && o.address) || '').slice(0, 200) };
}
function price(a, b, tariff) {
  const k = Math.max(1, Math.ceil(dist(a, b) * CFG.routeK)), T = TARIFFS[tariffOf(tariff)];
  if (k > CFG.maxKm) return { k, fee: null };
  return { k, fee: Math.round((T.base + (k - 1) * T.km) / 1000) * 1000 };
}
const normPhone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 9) d = '998' + d; return d.length === 12 ? '+' + d : null; };
const rateOf = d => (!d.firstDoneAt || Date.now() < new Date(d.firstDoneAt).getTime() + CFG.promoDays * 864e5) ? CFG.promoRate : CFG.rate;
const isOn = d => !!d.workUntil && new Date(d.workUntil) > new Date();
const isRestricted = d => !!d.restrictedUntil && new Date(d.restrictedUntil) > new Date();
const ACTIVE = ['yangi', 'qabul', 'keldi', 'yolda'];
const LIVE = ['qabul', 'keldi', 'yolda'];
const eta = (a, b) => Math.max(1, Math.round(dist(a, b) * CFG.routeK / 30 * 60)); // taxminan 30 km/soat

const pubD = d => ({
  id: d._id, name: d.name, phone: d.phone, car: d.car, plate: d.plate, klass: tariffOf(d.klass), status: d.status, balance: d.balance || 0,
  online: isOn(d), workUntil: isOn(d) ? d.workUntil : null, restrictedUntil: isRestricted(d) ? d.restrictedUntil : null,
  rate: rateOf(d), done: d.doneCount || 0, createdAt: d.createdAt
});
const ordD = (o, full) => {
  const x = {
    id: o._id, status: o.status, km: o.km, fee: o.fee, tariff: tariffOf(o.tariff), tariffName: TARIFFS[tariffOf(o.tariff)].name, note: o.note || '',
    from: { lat: o.from.lat, lng: o.from.lng, address: o.from.address }, to: { lat: o.to.lat, lng: o.to.lng, address: o.to.address }
  };
  if (full) { x.name = o.userName; x.phone = o.userPhone; }
  return x;
};

// ---------- Asosiy yo'naltirgich ----------
async function handle(req, res) {
  const u = new URL(req.url, 'http://x'), P = u.pathname, M = req.method;
  if (M === 'GET' && P === '/taxi.webmanifest') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    res.end(JSON.stringify({
      name: 'SavdoUz Taksi', short_name: 'Taksi', start_url: '/taxi', scope: '/taxi', display: 'standalone', background_color: '#F3F5F2', theme_color: '#0B6B52',
      icons: [{ src: '/sv-192.png', sizes: '192x192', type: 'image/png' }, { src: '/sv-512.png', sizes: '512x512', type: 'image/png' }, { src: '/sv-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
    }));
    return true;
  }
  if (M === 'GET' && (P === '/taxi' || P === '/taxi-admin')) {
    fs.readFile(path.join(__dirname, 'public', 'taxi.html'), (e, d) => {
      if (e) { res.writeHead(404); return res.end('public/taxi.html topilmadi'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(String(d).replace('</head>', '<link rel="manifest" href="/taxi.webmanifest"></head>'));
    });
    return true;
  }
  if (!P.startsWith('/api/taxi/')) return false;
  await init();
  const b = M === 'POST' ? await readBody(req) : {};
  const S = P.slice(9);
  let m;
  const R = (method, re) => M === method && (m = S.match(re));
  const ok = o => { send(res, 200, o || {}); return true; };

  // haydovchi / admin tokenlari
  const tp = parseTok(bearer(req) || u.searchParams.get('t'));
  const driver = async () => {
    if (!tp || tp.kind !== 't') throw new E('Kirish kerak', 401);
    const d = await C('taxidrivers').findOne({ _id: tp.id });
    if (!d) throw new E('Kirish kerak', 401);
    return d;
  };
  const admin = async () => { if (!tp || tp.kind !== 'u' || !(await adminOk(tp.id))) throw new E("Ruxsat yo'q", 403); };

  if (R('GET', /^\/info$/)) return ok({
    card: { number: CFG.cardNumber, holder: CFG.cardHolder },
    cfg: { tariffs: TARIFFS, maxKm: CFG.maxKm, minBalance: CFG.minBalance, warnBalance: CFG.warnBalance }
  });

  // =================== YO'LOVCHI (asosiy ilova foydalanuvchisi) ===================
  const view = async o => {
    let dr = null;
    if (o.driverId && LIVE.includes(o.status)) {
      const d = await C('taxidrivers').findOne({ _id: o.driverId }, { projection: { name: 1, phone: 1, car: 1, plate: 1, lat: 1, lng: 1, locAt: 1 } });
      if (d) dr = { name: d.name.split(' ')[0], phone: d.phone, car: d.car, plate: d.plate, lat: d.lat || null, lng: d.lng || null };
    } else if (o.driverId) dr = { name: String(o.driverName || '').split(' ')[0], phone: o.driverPhone, car: o.driverCar, plate: o.driverPlate, lat: null, lng: null };
    let etaMin = null;
    if (dr && dr.lat != null) {
      if (o.status === 'qabul') etaMin = eta(dr, o.from);
      else if (o.status === 'yolda') etaMin = eta(dr, o.to);
    }
    return { id: o._id, status: o.status, from: o.from, to: o.to, km: o.km, fee: o.fee, tariff: tariffOf(o.tariff), tariffName: TARIFFS[tariffOf(o.tariff)].name, driver: dr, etaMin, reason: o.reason || null };
  };
  if (R('POST', /^\/quote$/)) {
    await mainUser(req, u.searchParams);
    const f = pt(b.from), t = pt(b.to), r = price(f, t, 'start'), r2 = price(f, t, 'komfort');
    return ok({ km: r.k, max: CFG.maxKm, fees: { start: r.fee, komfort: r2.fee } });
  }
  if (R('POST', /^\/order$/)) {
    const user = await mainUser(req, u.searchParams);
    if (user.role === 'admin') throw new E("Admin taksi chaqira olmaydi");
    const tariff = tariffOf(b.tariff), f = pt(b.from), t = pt(b.to), { k, fee } = price(f, t, tariff);
    if (fee === null) throw new E(`Masofa ${CFG.maxKm} km dan oshmasin`);
    if (k < 1 || dist(f, t) < 0.1) throw new E("Manzillar juda yaqin");
    if (await C('taxiorders').findOne({ userId: user.id, status: { $in: ACTIVE } })) throw new E("Sizda faol taksi buyurtmasi bor");
    const o = {
      _id: await nextId('taxiorder'), userId: user.id, userName: user.name || 'Yo\'lovchi', userPhone: user.phone || '',
      from: f, to: t, km: k, fee, tariff, note: String(b.note || '').trim().slice(0, 200), status: 'yangi', createdAt: iso()
    };
    await C('taxiorders').insertOne(o);
    return ok({ order: await view(o) });
  }
  if (R('GET', /^\/my$/)) {
    const user = await mainUser(req, u.searchParams);
    const o = await C('taxiorders').findOne({ userId: user.id, status: { $in: ACTIVE } }, { sort: { _id: -1 } });
    return ok({ order: o ? await view(o) : null });
  }
  if (R('GET', /^\/o\/(\d+)$/)) {
    const user = await mainUser(req, u.searchParams);
    const o = await C('taxiorders').findOne({ _id: Number(m[1]), userId: user.id });
    if (!o) throw new E('Buyurtma topilmadi', 404);
    return ok({ order: await view(o) });
  }
  if (R('POST', /^\/cancel$/)) {
    const user = await mainUser(req, u.searchParams);
    const o = await fu('taxiorders', { _id: Number(b.id), userId: user.id, status: { $in: ['yangi', 'qabul', 'keldi'] } }, { $set: { status: 'bekor', reason: 'yo\'lovchi bekor qildi', doneAt: iso() } });
    if (!o) throw new E("Bekor qilib bo'lmaydi (safar boshlangan bo'lishi mumkin)");
    return ok();
  }

  // =================== HAYDOVCHI ===================
  if (R('POST', /^\/d\/register$/)) {
    const name = String(b.name || '').trim(), phone = normPhone(b.phone), pw = String(b.password || '');
    const klass = tariffOf(b.klass), car = String(b.car || '').trim().slice(0, 60), plate = String(b.plate || '').trim().toUpperCase().slice(0, 15);
    if (name.length < 3) throw new E('Ism familiyani yozing');
    if (!phone) throw new E("Telefon raqam noto'g'ri");
    if (pw.length < 6) throw new E("Parol kamida 6 ta belgi bo'lsin");
    if (car.length < 2 || plate.length < 5) throw new E('Mashina markasi va davlat raqamini yozing');
    for (const k of ['techPassport', 'license', 'selfie']) if (!String(b[k] || '').startsWith('data:image/')) throw new E('Texpasport, prava va selfi rasmini yuklang');
    const h = hashPw(pw), id = await nextId('taxidriver');
    try {
      await C('taxidrivers').insertOne({ _id: id, name, phone, car, plate, klass, salt: h.salt, hash: h.hash, techPassport: b.techPassport, license: b.license, selfie: b.selfie, status: 'kutilmoqda', balance: 0, doneCount: 0, cancels: [], createdAt: iso() });
    } catch (e) { if (e.code === 11000) throw new E("Bu raqam allaqachon ro'yxatdan o'tgan"); throw e; }
    return ok({ token: tok('t', id) });
  }
  if (R('POST', /^\/d\/login$/)) {
    const d = await C('taxidrivers').findOne({ phone: normPhone(b.phone) });
    if (!d || !verify(String(b.password || ''), d.salt, d.hash)) throw new E('Telefon raqam yoki parol xato');
    return ok({ token: tok('t', d._id) });
  }
  if (R('GET', /^\/d\/me$/)) return ok({ me: pubD(await driver()) });
  if (R('POST', /^\/d\/work$/)) {
    const d = await driver();
    if (d.status !== 'faol') throw new E('Hisobingiz hali tasdiqlanmagan');
    if (!b.on) {
      if (await C('taxiorders').findOne({ driverId: d._id, status: { $in: LIVE } })) throw new E("Faol buyurtmangiz bor, avval uni tugating");
      await C('taxidrivers').updateOne({ _id: d._id }, { $set: { workUntil: null } }); return ok();
    }
    if (isRestricted(d)) throw new E('Siz vaqtincha cheklangansiz');
    if ((d.balance || 0) < CFG.minBalance) throw new E("Avval hisobingizni to'ldiring");
    if (!isOn(d)) await C('taxidrivers').updateOne({ _id: d._id }, { $set: { workUntil: new Date(Date.now() + CFG.workHours * 36e5).toISOString() } });
    return ok();
  }
  if (R('POST', /^\/d\/loc$/)) {
    const d = await driver(), lat = Number(b.lat), lng = Number(b.lng);
    if (!okLL(lat, lng)) throw new E("Joylashuv noto'g'ri");
    await C('taxidrivers').updateOne({ _id: d._id }, { $set: { lat, lng, locAt: Date.now() } });
    return ok();
  }
  if (R('GET', /^\/d\/orders$/)) {
    const d = await driver();
    let open = [];
    if (isOn(d) && d.status === 'faol' && (d.balance || 0) >= CFG.minBalance && !isRestricted(d)) {
      const busy = await C('taxiorders').findOne({ driverId: d._id, status: { $in: LIVE } });
      if (!busy) {
        const all = await C('taxiorders').find(tariffOf(d.klass) === 'komfort' ? { status: 'yangi' } : { status: 'yangi', tariff: { $in: ['start', null] } }).sort({ _id: -1 }).limit(30).toArray();
        open = all.map(o => Object.assign(ordD(o, false), { pickupKm: d.lat != null ? Math.round(dist(d, o.from) * CFG.routeK * 10) / 10 : null }))
          .filter(o => o.pickupKm === null || o.pickupKm <= CFG.nearKm)
          .sort((a, b2) => (a.pickupKm == null ? 1e9 : a.pickupKm) - (b2.pickupKm == null ? 1e9 : b2.pickupKm)).slice(0, 10);
      }
    }
    const mine = (await C('taxiorders').find({ driverId: d._id }).sort({ _id: -1 }).limit(12).toArray()).map(o => ordD(o, LIVE.includes(o.status)));
    return ok({ open, mine });
  }
  if (R('POST', /^\/d\/orders\/(\d+)\/(\w+)$/)) {
    const d = await driver(), id = Number(m[1]), act = m[2], now = iso(), mineQ = { _id: id, driverId: d._id };
    if (act === 'accept') {
      if (!isOn(d) || d.status !== 'faol' || isRestricted(d)) throw new E("Avval 'Ishdaman' tugmasini bosing");
      if ((d.balance || 0) < CFG.minBalance) throw new E("Avval hisobingizni to'ldiring");
      if (await C('taxiorders').findOne({ driverId: d._id, status: { $in: LIVE } })) throw new E("Sizda tugallanmagan buyurtma bor");
      const o = await fu('taxiorders', { _id: id, status: 'yangi' }, { $set: { status: 'qabul', driverId: d._id, driverName: d.name, driverPhone: d.phone, driverCar: d.car, driverPlate: d.plate, acceptedAt: now } });
      if (!o) throw new E('Buyurtmani boshqa haydovchi oldi');
      notify(o.userId, 'Taksi topildi 🚕', d.name.split(' ')[0] + ' (' + d.car + ', ' + d.plate + ') yo\'lga chiqdi. Xaritada kuzating', 'taksi' + id);
      return ok();
    }
    if (act === 'arrived') {
      const o = await fu('taxiorders', Object.assign({ status: 'qabul' }, mineQ), { $set: { status: 'keldi', arrivedAt: now } });
      if (!o) throw new E('Holat o`zgargan');
      notify(o.userId, 'Taksi yetib keldi 🚕', d.car + ' · ' + d.plate + '. Chiqishingiz mumkin', 'taksi' + id);
      return ok();
    }
    if (act === 'start') {
      const o = await fu('taxiorders', Object.assign({ status: { $in: ['qabul', 'keldi'] } }, mineQ), { $set: { status: 'yolda', startedAt: now } });
      if (!o) throw new E('Holat o`zgargan');
      return ok();
    }
    if (act === 'done') {
      const o = await fu('taxiorders', Object.assign({ status: 'yolda' }, mineQ), { $set: { status: 'yetkazildi', doneAt: now } });
      if (!o) throw new E("Safar hali boshlanmagan");
      const com = Math.round(o.fee * rateOf(d));
      await C('taxidrivers').updateOne({ _id: d._id }, { $inc: { balance: -com, doneCount: 1 } });
      await C('taxidrivers').updateOne({ _id: d._id, firstDoneAt: { $exists: false } }, { $set: { firstDoneAt: now } });
      await C('taxiorders').updateOne({ _id: id }, { $set: { commission: com } });
      return ok();
    }
    if (act === 'release') {
      const o = await fu('taxiorders', Object.assign({ status: { $in: ['qabul', 'keldi'] } }, mineQ), { $set: { status: 'yangi' }, $unset: { driverId: '', driverName: '', driverPhone: '', driverCar: '', driverPlate: '', acceptedAt: '', arrivedAt: '' } });
      if (!o) throw new E("Bekor qilib bo'lmaydi");
      const recent = (d.cancels || []).filter(t => Date.now() - new Date(t) < 864e5).concat(now), set = { cancels: recent };
      if (recent.length >= CFG.maxCancels) { set.restrictedUntil = new Date(Date.now() + CFG.blockHours * 36e5).toISOString(); set.workUntil = null; }
      await C('taxidrivers').updateOne({ _id: d._id }, { $set: set });
      notify(o.userId, 'Haydovchi bekor qildi', 'Yangi haydovchi qidirilmoqda', 'taksi' + id);
      return ok();
    }
    throw new E("Noma'lum amal");
  }
  if (R('POST', /^\/d\/topup$/)) {
    const d = await driver(), amount = Math.round(Number(b.amount));
    if (!(amount >= 1000 && amount <= 5e7)) throw new E("Summa noto'g'ri");
    const code = String(b.code || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12);
    const rec = typeof b.receipt === 'string' && b.receipt.startsWith('data:') ? b.receipt : null;
    await C('taxitopups').insertOne({ _id: await nextId('taxitopup'), userId: d._id, userName: d.name, amount, code, receipt: rec, status: 'kutilmoqda', createdAt: iso() });
    return ok();
  }
  if (R('GET', /^\/d\/topups$/)) {
    const d = await driver();
    return ok({ topups: await C('taxitopups').find({ userId: d._id }, { projection: { receipt: 0 } }).sort({ _id: -1 }).limit(20).toArray() });
  }

  // =================== ADMIN ===================
  if (R('GET', /^\/admin\/data$/)) {
    await admin();
    const ds = await C('taxidrivers').find({}, { projection: { techPassport: 0, license: 0, selfie: 0, salt: 0, hash: 0 } }).sort({ _id: -1 }).limit(200).toArray();
    const tps = await C('taxitopups').find({}, { projection: { receipt: 0 } }).sort({ _id: -1 }).limit(60).toArray();
    const hasR = new Set((await C('taxitopups').find({ receipt: { $ne: null } }, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(60).toArray()).map(x => x._id));
    const od = await C('taxiorders').find({}).sort({ _id: -1 }).limit(50).toArray();
    return ok({
      drivers: ds.map(pubD), topups: tps.map(t => Object.assign(t, { hasReceipt: hasR.has(t._id) })),
      orders: od.map(o => Object.assign(ordD(o, true), { driverName: o.driverName || '-', createdAt: o.createdAt }))
    });
  }
  if (R('GET', /^\/admin\/img\/(drivers|topups)\/(\d+)\/(techPassport|license|selfie|receipt)$/)) {
    await admin();
    const d = await C(m[1] === 'drivers' ? 'taxidrivers' : 'taxitopups').findOne({ _id: Number(m[2]) }, { projection: { [m[3]]: 1 } });
    const mt = d && d[m[3]] && String(d[m[3]]).match(/^data:(.+?);base64,(.*)$/s);
    if (!mt) { res.writeHead(404); res.end(); return true; }
    res.writeHead(200, { 'Content-Type': mt[1], 'Cache-Control': 'private' }); res.end(Buffer.from(mt[2], 'base64'));
    return true;
  }
  if (R('POST', /^\/admin\/driver\/(\d+)$/)) {
    await admin();
    const st = { approve: 'faol', reject: 'rad etildi', block: 'bloklangan', unblock: 'faol' }[b.action];
    if (!st) throw new E("Noto'g'ri amal");
    const set = { status: st }; if (st !== 'faol') set.workUntil = null;
    await C('taxidrivers').updateOne({ _id: Number(m[1]) }, { $set: set });
    return ok();
  }
  if (R('POST', /^\/admin\/topup\/(\d+)$/)) {
    await admin();
    const st = { approve: 'tasdiqlandi', reject: 'rad etildi' }[b.action];
    if (!st) throw new E("Noto'g'ri amal");
    const t = await fu('taxitopups', { _id: Number(m[1]), status: 'kutilmoqda' }, { $set: { status: st, at: iso() } });
    if (!t) throw new E("Bu so'rov allaqachon ko'rib chiqilgan");
    if (st === 'tasdiqlandi') await C('taxidrivers').updateOne({ _id: t.userId }, { $inc: { balance: t.amount } });
    return ok();
  }
  throw new E("Bunday so'rov yo'q", 404);
}

// Javobsiz qolgan buyurtmalar 30 daqiqadan keyin yopiladi
setInterval(async () => {
  try { if (!D) return; await C('taxiorders').updateMany({ status: 'yangi', createdAt: { $lt: new Date(Date.now() - CFG.expireMin * 60000).toISOString() } }, { $set: { status: 'bekor', reason: 'Haydovchi topilmadi', doneAt: iso() } }); } catch (e) {}
}, 60000).unref();

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((ok, no) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 14e6) { no(new E('Hajm juda katta')); req.destroy(); } });
    req.on('end', () => { if (!d) return ok({}); try { ok(JSON.parse(d)); } catch (e) { no(new E("Noto'g'ri so'rov")); } });
  });
}

// ---------- server.js ga ulanish ----------
const origCreate = http.createServer;
http.createServer = function (...a) {
  const li = a.find(x => typeof x === 'function');
  const wrapped = async (req, res) => {
    try { if (await handle(req, res)) return; }
    catch (e) {
      if (!(e instanceof E)) console.error('taxi.js xato:', e);
      if (!res.headersSent) send(res, e instanceof E ? e.status : 500, { error: e instanceof E ? e.message : 'Server xatosi' });
      return;
    }
    return li(req, res);
  };
  return origCreate.call(http, ...a.map(x => x === li ? wrapped : x));
};
