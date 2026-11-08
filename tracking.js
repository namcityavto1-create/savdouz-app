// ===== SavdoUz: Kuryerni jonli kuzatish (tracking.js) =====
// server.js ning BIRINCHI qatoriga (require('./courier.js') ning ustiga) qo'shiladi: require('./tracking.js');
// Yo'llar: POST /api/trk/loc (kuryer GPS), GET /api/trk/link/:id (Hamkor havola oladi),
//          GET /api/trk/o/:token (ochiq, mijoz uchun), GET /kuzat/:token (mijoz sahifasi)
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const { MongoClient } = require('mongodb');

// courier.js bilan bir xil sir va token formati
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('sv:' + String(process.env.MONGODB_URI)).digest('hex');
const sign = p => crypto.createHmac('sha256', SECRET).update(p).digest('hex');
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function parseTok(t) {
  const [a, exp, sig] = String(t || '').split('.');
  if (!sig || !eq(sign(a + '.' + exp), sig) || Date.now() > Number(exp)) return null;
  const m = a.match(/^([cp]?)(\d+)$/);
  return m ? { kind: m[1] || 'u', id: Number(m[2]) } : null;
}
const trkToken = id => id + '-' + sign('trk' + id).slice(0, 20);
function parseTrk(t) {
  const [id, sg] = String(t || '').split('-');
  if (!/^\d+$/.test(id || '') || !sg || !eq(sg, sign('trk' + id).slice(0, 20))) return null;
  return Number(id);
}

class E extends Error { constructor(m, s) { super(m); this.status = s || 400; } }
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
function readBody(req) {
  return new Promise((ok, no) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 20000) { no(new E('Hajm juda katta')); req.destroy(); } });
    req.on('end', () => { if (!d) return ok({}); try { ok(JSON.parse(d)); } catch (e) { no(new E("Noto'g'ri so'rov")); } });
  });
}

// ---------- MongoDB (faqat o'qish uchun, courier.js dagi kolleksiyalar) ----------
const client = new MongoClient(process.env.MONGODB_URI || '');
let D = null, ready = null;
function db() {
  if (!ready) ready = client.connect().then(() => {
    D = client.db('savdouz');
    D.collection('corders').createIndex({ courierId: 1, status: 1 }).catch(() => {});
  }).catch(e => { ready = null; throw e; });
  return ready.then(() => D);
}

// ---------- Jonli joylashuv (xotirada, bazaga yozilmaydi) ----------
const LIVE = new Map();   // courierId -> { lat, lng, acc, t }
const ACTIVE = new Map(); // courierId -> { n, t } (faol buyurtma borligi keshi)
setInterval(() => { const x = Date.now() - 36e5; for (const [k, v] of LIVE) if (v.t < x) LIVE.delete(k); }, 6e5).unref();

const FRESH_MS = 120000;
const SPEED = { Piyoda: 5, Velosiped: 14, Skuter: 25, Avtomobil: 25 }; // km/soat
function dist(a, b) {
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const OCACHE = new Map();
async function orderInfo(C, id) {
  let x = OCACHE.get(id);
  if (x && Date.now() - x.t < 4000) return x;
  const o = await C('corders').findOne({ _id: id });
  let c = null;
  if (o && o.courierId && (o.status === 'qabul' || o.status === 'oldi')) c = await C('couriers').findOne({ _id: o.courierId }, { projection: { name: 1, transport: 1, phone: 1 } });
  x = { t: Date.now(), o, c }; OCACHE.set(id, x);
  if (OCACHE.size > 500) { const old = Date.now() - 60000; for (const [k, v] of OCACHE) if (v.t < old) OCACHE.delete(k); }
  return x;
}
const bearer = req => { const h = req.headers.authorization; return h && h.startsWith('Bearer ') ? h.slice(7) : ''; };

// ---------- "Kuryer admin" huquqi (courier.js ga tegmasdan tekshiriladi) ----------
let ADM = { t: 0, map: new Map() };
async function courierAdminOk(id) {
  const d = await db();
  if (Date.now() - ADM.t > 30000) {
    const st = await d.collection('state').findOne({ _id: 'main' }, { projection: { 'users.id': 1, 'users.role': 1, 'users.phone': 1, 'users.perms': 1 } });
    ADM = { t: Date.now(), map: new Map(((st && st.users) || []).filter(u => u.role === 'admin').map(u => [u.id, u])) };
  }
  const u = ADM.map.get(id);
  if (!u) return false;
  if (u.phone === OWNER_PHONE) return true;               // asosiy admin
  if (!Array.isArray(u.perms)) return true;                // eski adminlar (huquqlar belgilanmagan) hozirgidek kira oladi
  return u.perms.includes('courier');
}
const OWNER_PHONE = '+998774071234';


// ---------- /kuryer-admin sahifasiga tuzatishlar (courier.js ga tegmasdan, javobga qo'shiladi) ----------
const ADMIN_FIX = `<script>
(function(){
  var css='.sv-nav::-webkit-scrollbar{display:none}#svBack{position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);right:12px;z-index:99999;background:#0b6b55;color:#fff;border:0;border-radius:999px;padding:9px 16px;font:600 14px/1 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25)}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  if(!document.querySelector('meta[name=viewport]')){var m=document.createElement('meta');m.name='viewport';m.content='width=device-width,initial-scale=1,viewport-fit=cover';document.head.appendChild(m);}
  // 1) Orqaga tugmasi (kirish oynasida ham, ichida ham) -> asosiy ilovaga
  var b=document.createElement('button');b.id='svBack';b.type='button';b.textContent='\\u2190 Ortga';
  b.onclick=function(){location.href='/';};
  document.body.appendChild(b);
  // 2) Chiqish bosilsa, asosiy ilovaga qaytariladi
  document.addEventListener('click',function(e){
    var t=e.target&&e.target.closest?e.target.closest('a,button,span,div'):null;
    if(t&&t.children.length===0&&(t.textContent||'').trim()==='Chiqish'){setTimeout(function(){location.href='/';},300);}
  },true);
  // 3) Pastdagi bo'limlar sig'ishi uchun: yonga surish o'rniga qatorlarga bo'linadi
  function find(){
    var all=document.body.querySelectorAll('*');
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(el.children.length===0&&(el.textContent||'').trim()==='Hamkorlar'){
        var n=el;
        while(n.parentElement&&n.parentElement!==document.body&&n.parentElement.children.length<4)n=n.parentElement;
        return n.parentElement&&n.parentElement!==document.body?n.parentElement:null;
      }
    }
    return null;
  }
  function imp(el,k,v){el.style.setProperty(k,v,'important');}
  function fix(){
    var nav=find();if(!nav)return;
    nav.classList.add('sv-nav');
    imp(nav,'display','flex');imp(nav,'flex-wrap','nowrap');imp(nav,'justify-content','flex-start');
    imp(nav,'overflow-x','auto');imp(nav,'overflow-y','hidden');imp(nav,'-webkit-overflow-scrolling','touch');
    imp(nav,'touch-action','pan-x');imp(nav,'overscroll-behavior-x','contain');imp(nav,'scrollbar-width','none');
    imp(nav,'box-sizing','border-box');imp(nav,'width','100%');imp(nav,'max-width','100vw');
    imp(nav,'padding-bottom','calc(env(safe-area-inset-bottom,0px) + 4px)');
    var cs=nav.children;
    for(var i=0;i<cs.length;i++){
      var c=cs[i];
      imp(c,'flex','0 0 auto');imp(c,'box-sizing','border-box');
      imp(c,'padding','12px 14px');imp(c,'white-space','nowrap');
    }
    var pad=(nav.offsetHeight+20)+'px';
    if(document.body.style.paddingBottom!==pad)document.body.style.paddingBottom=pad;
  }
  var tm=null;
  function later(){clearTimeout(tm);tm=setTimeout(fix,60);}
  new MutationObserver(later).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('resize',later);
  fix();
})();
</script>`;
function hookCourierOrders(req, res) {
  delete req.headers['accept-encoding'];
  const ow = res.writeHead, oe = res.end, owr = res.write;
  let head = null; const chunks = [];
  res.writeHead = function (code, a, b) { head = { code, h: (a && typeof a === 'object') ? a : (b && typeof b === 'object' ? b : null), msg: typeof a === 'string' ? a : undefined }; return res; };
  res.write = function (c, enc) { if (c) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c), typeof enc === 'string' ? enc : 'utf8')); return true; };
  res.end = function (c, enc) {
    if (c && typeof c !== 'function') chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c), typeof enc === 'string' ? enc : 'utf8'));
    res.writeHead = ow; res.end = oe; res.write = owr;
    (async () => {
      let body = Buffer.concat(chunks);
      const code = head ? head.code : res.statusCode;
      try {
        if (code === 200) {
          const j = JSON.parse(body.toString('utf8'));
          const all = [].concat(j.open || [], j.mine || []);
          if (all.length) {
            const d = await db();
            const pre = new Set((await d.collection('corders').find({ _id: { $in: all.map(x => x.id) }, prepaid: true }, { projection: { _id: 1 } }).toArray()).map(x => x._id));
            all.forEach(x => { if (pre.has(x.id)) x.prepaid = true; });
            body = Buffer.from(JSON.stringify(j), 'utf8');
            if (head && head.h) for (const x in head.h) if (x.toLowerCase() === 'content-length') delete head.h[x];
            res.removeHeader('content-length'); res.setHeader('Content-Length', body.length);
          }
        }
      } catch (e) { /* o'zgartirmasdan yuboramiz */ }
      if (head) { if (head.msg) ow.call(res, head.code, head.msg, head.h || undefined); else ow.call(res, head.code, head.h || undefined); }
      oe.call(res, body);
    })();
    return res;
  };
}
function hookAdminPage(req, res) {
  delete req.headers['accept-encoding'];
  const ow = res.writeHead, oe = res.end, owr = res.write;
  let head = null; const chunks = [];
  res.writeHead = function (code, a, b) { head = { code, h: (a && typeof a === 'object') ? a : (b && typeof b === 'object' ? b : null), msg: typeof a === 'string' ? a : undefined }; return res; };
  res.write = function (c, enc) { if (c) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c), typeof enc === 'string' ? enc : 'utf8')); return true; };
  res.end = function (c, enc) {
    if (c && typeof c !== 'function') chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c), typeof enc === 'string' ? enc : 'utf8'));
    res.writeHead = ow; res.end = oe; res.write = owr;
    let body = Buffer.concat(chunks);
    const code = head ? head.code : res.statusCode;
    const hv = k => { if (head && head.h) for (const x in head.h) if (x.toLowerCase() === k) return String(head.h[x]); return String(res.getHeader(k) || ''); };
    if (code === 200 && /text\/html/i.test(hv('content-type')) && !hv('content-encoding')) {
      let html = body.toString('utf8');
      html = html.includes('</body>') ? html.replace('</body>', () => ADMIN_FIX + '</body>') : html + ADMIN_FIX;
      body = Buffer.from(html, 'utf8');
      if (head && head.h) for (const x in head.h) if (x.toLowerCase() === 'content-length') delete head.h[x];
      res.removeHeader('content-length');
      res.setHeader('Content-Length', body.length);
    }
    if (head) { if (head.msg) ow.call(res, head.code, head.msg, head.h || undefined); else ow.call(res, head.code, head.h || undefined); }
    return oe.call(res, body);
  };
}

// ---------- SOTUVCHI KURYER CHAQIRADI (do'kon buyurtmasi -> kuryer tizimi) ----------
// Narx formulasi courier.js dagi CFG bilan bir xil bo'lishi shart (o'zgartirsangiz ikkalasini ham o'zgartiring)
const SCFG = { baseFee: 8000, kmFee: 2000, maxKm: 15, routeK: 1.3, maxProduct: 300000 };
function shopPrice(a, b) {
  const k = Math.max(1, Math.ceil(dist(a, b) * SCFG.routeK));
  if (k > SCFG.maxKm) return { k, fee: null };
  return { k, fee: Math.round((SCFG.baseFee + (k - 1) * SCFG.kmFee) / 1000) * 1000 };
}
const unwrap = r => (r && typeof r === 'object' && 'lastErrorObject' in r) ? r.value : r;
async function nextOrderId(C) {
  const r = unwrap(await C('counters').findOneAndUpdate({ _id: 'order' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' }));
  return r.seq;
}
const okLL = (la, ln) => Number.isFinite(la) && Number.isFinite(ln) && la >= 36 && la <= 46 && ln >= 55 && ln <= 74;
async function mainUser(req, u) {
  const p = parseTok(bearer(req) || u.searchParams.get('t'));
  if (!p || p.kind !== 'u') throw new E('Kirish kerak', 401);
  const SVI = global.SVI;
  if (!SVI || !SVI.loadDB) throw new E('Server tayyor emas', 503);
  const sdb = await SVI.loadDB();
  const user = sdb.users.find(x => x.id === p.id);
  if (!user) throw new E('Kirish kerak', 401);
  return { sdb, user };
}
// sotuvchining shu buyurtmadagi ulushi: mahsulotlar + o'zi belgilagan yetkazish haqi (xaridor shuncha to'laydi)
function sellerShare(o, sid) {
  const its = (o.items || []).filter(i => i.sellerId === sid);
  if (!its.length) return null;
  const single = new Set(o.items.map(i => i.sellerId)).size === 1;
  return single ? o.total : its.reduce((s, i) => s + (i.subtotal || i.price * i.qty) + (i.deliveryFee || 0), 0);
}
async function shopQuote(C, sdb, user, b, commit) {
  const o = sdb.orders.find(x => x.id === Number(b.orderId));
  if (!o) throw new E('Buyurtma topilmadi', 404);
  const share = sellerShare(o, user.id);
  if (share === null) throw new E("Bu sizning buyurtmangiz emas", 403);
  if (user.role !== 'seller') throw new E("Faqat sotuvchi kuryer chaqira oladi", 403);
  const card = o.paymentMethod === 'karta';
  if (card && o.paymentStatus !== 'tasdiqlandi') throw new E("Xaridor to'lovi hali tasdiqlanmagan");
  if (!card && o.paymentMethod !== 'naqd') throw new E("To'lov usuli noma'lum");
  if (o.status !== 'tasdiqlandi') throw new E(o.status === 'yangi' ? 'Avval buyurtmani tasdiqlang' : "Bu holatdagi buyurtmaga kuryer chaqirib bo'lmaydi");
  const active = await C('corders').findOne({ shopOrderId: o.id, sellerId: user.id, status: { $in: ['yangi', 'qabul', 'oldi'] } }, { projection: { _id: 1 } });
  if (active) throw new E('Bu buyurtmaga kuryer allaqachon chaqirilgan');
  const D0 = await db();
  let shop = await D0.collection('shoploc').findOne({ _id: user.id });
  const sLat = Number(b.shopLat), sLng = Number(b.shopLng);
  if (okLL(sLat, sLng)) shop = { _id: user.id, lat: sLat, lng: sLng, address: String(b.shopAddress || (shop && shop.address) || user.shopName || user.name || '').slice(0, 200) };
  if (!shop) throw new E("Avval do'koningiz joyini xaritada belgilang");
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!okLL(lat, lng)) throw new E("Xaridor manzilini xaritadan belgilang");
  const { k, fee } = shopPrice(shop, { lat, lng });
  if (fee === null) throw new E("Masofa " + SCFG.maxKm + " km dan oshmasin");
  // naqd: kuryer xaridordan pul oladi, sotuvchiga mahsulot pulini beradi. Karta: xaridor oldindan to'lagan, kuryer haqini sotuvchi to'laydi
  const productSum = card ? 0 : Math.round(share - fee);
  if (!card && productSum < 0) throw new E("Buyurtma summasi kuryer haqidan kam, kuryer chaqirib bo'lmaydi");
  if (productSum > SCFG.maxProduct) throw new E("Buyurtma summasi " + SCFG.maxProduct + " so'mdan oshmasligi kerak (kuryer cheklovi)");
  if (card && (user.balance || 0) < fee) throw new E("Hisobingizda mablag' yetarli emas. Kuryer haqi: " + fee + " so'm, hisobingiz: " + (user.balance || 0) + " so'm");
  const quote = { km: k, fee, productSum, total: Math.round(share), mode: card ? 'karta' : 'naqd', balance: user.balance || 0 };
  if (!commit) return quote;
  await D0.collection('shoploc').updateOne({ _id: user.id }, { $set: { lat: shop.lat, lng: shop.lng, address: shop.address } }, { upsert: true });
  const doc = {
    _id: await nextOrderId(C), partnerId: -user.id, partnerName: user.name, partnerType: 'dokon', ready: true,
    pickup: { address: shop.address || user.name, lat: shop.lat, lng: shop.lng, phone: user.phone },
    customer: { name: o.buyerName, phone: o.phone, address: (o.region ? o.region + ', ' : '') + o.address, lat, lng },
    productSum, km: k, fee, status: 'yangi', callCount: 0, calls: [], createdBy: 'sotuvchi', createdAt: new Date().toISOString(),
    shopOrderId: o.id, sellerId: user.id, buyerId: o.buyerId, prepaid: card, shopCharged: card ? fee : 0
  };
  const SVI = global.SVI;
  if (card) {
    if ((user.balance || 0) < fee) throw new E("Hisobingizda mablag' yetarli emas");
    user.balance -= fee;
    if (!user.txs) user.txs = [];
    user.txs.push({ id: Date.now(), amount: -fee, note: 'Kuryer haqi — buyurtma #' + o.id, createdAt: new Date().toISOString() });
    await SVI.saveDB(sdb);
  }
  try { await C('corders').insertOne(doc); }
  catch (e) { if (card) { user.balance += fee; user.txs.push({ id: Date.now(), amount: fee, note: 'Kuryer haqi qaytarildi — buyurtma #' + o.id, createdAt: new Date().toISOString() }); await SVI.saveDB(sdb); } throw e; }
  return Object.assign(quote, { id: doc._id });
}
async function refundSeller(sdb, o) {
  if (!o || !o.prepaid || !o.shopCharged || o.shopRefunded) return;
  const D1 = await db();
  const m = unwrap(await D1.collection('corders').findOneAndUpdate({ _id: o._id, shopRefunded: { $ne: true } }, { $set: { shopRefunded: true } }, { returnDocument: 'after' }));
  if (!m) return;
  const s = sdb.users.find(x => x.id === o.sellerId);
  if (!s) return;
  s.balance = (s.balance || 0) + o.shopCharged;
  if (!s.txs) s.txs = [];
  s.txs.push({ id: Date.now(), amount: o.shopCharged, note: 'Kuryer haqi qaytarildi — buyurtma #' + o.shopOrderId, createdAt: new Date().toISOString() });
  await global.SVI.saveDB(sdb);
}
// ---------- KURYER PUL YECHISH (admin "Yechish" bo'limida hamkorlar bilan bir ro'yxatda chiqadi) ----------
const WD = { rate: 0.01, min: 50000, keep: 10000 }; // komissiya 1%, eng kam 50 000, balansda kamida 10 000 qoladi
async function courierWd(req, res, u, P, M, C) {
  const p = parseTok(bearer(req) || u.searchParams.get('t'));
  if (!p || p.kind !== 'c') throw new E('Kirish kerak', 401);
  if (M === 'GET' && P === '/api/trk/cwithdrawals') {
    const list = await C('withdrawals').find({ courierId: p.id }, { projection: { amount: 1, fee: 1, status: 1, card: 1, createdAt: 1 } }).sort({ _id: -1 }).limit(15).toArray();
    send(res, 200, { list });
    return true;
  }
  if (M === 'POST' && P === '/api/trk/cwithdraw') {
    const b = await readBody(req), amount = Math.round(Number(b.amount)), card = String(b.card || '').replace(/\D/g, '');
    if (!(amount >= WD.min)) throw new E("Eng kam summa: " + WD.min + " so'm");
    if (card.length !== 16) throw new E("Karta raqami 16 ta raqam bo'lsin");
    const fee = Math.round(amount * WD.rate / 100) * 100, cardF = card.replace(/(.{4})/g, '$1 ').trim();
    const cur = await C('couriers').findOne({ _id: p.id }, { projection: { name: 1, status: 1 } });
    if (!cur || cur.status !== 'faol') throw new E('Hisobingiz faol emas');
    const x = unwrap(await C('couriers').findOneAndUpdate({ _id: p.id, status: 'faol', balance: { $gte: amount + fee + WD.keep } }, { $inc: { balance: -(amount + fee) }, $set: { card: cardF } }, { returnDocument: 'after' }));
    if (!x) throw new E("Balansda yetarli mablag' yo'q. Komissiya (" + fee + " so'm) bilan kerak: " + (amount + fee) + " so'm, hisobda kamida " + WD.keep + " so'm qolishi kerak");
    const id = unwrap(await C('counters').findOneAndUpdate({ _id: 'withdraw' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })).seq;
    // partnerId manfiy: courier.js admin "rad etish" bosilsa hamkorga pul qaytarmasligi uchun; kuryerga qaytarishni quyidagi sinxronlash qiladi
    await C('withdrawals').insertOne({ _id: id, partnerId: -(1e6 + p.id), partnerName: 'Kuryer: ' + cur.name, courierId: p.id, amount, fee, card: cardF, status: 'kutilmoqda', createdAt: new Date().toISOString() });
    send(res, 200, { ok: true });
    return true;
  }
  return false;
}
async function syncWd() {
  try {
    const d = await db();
    const rows = await d.collection('withdrawals').find({ courierId: { $exists: true }, status: 'rad etildi', refunded: { $ne: true } }).limit(20).toArray();
    for (const w of rows) {
      const g = unwrap(await d.collection('withdrawals').findOneAndUpdate({ _id: w._id, refunded: { $ne: true } }, { $set: { refunded: true } }, { returnDocument: 'after' }));
      if (g) await d.collection('couriers').updateOne({ _id: w.courierId }, { $inc: { balance: w.amount + w.fee } });
    }
  } catch (e) { console.error('tracking.js yechish sinxron xatosi:', e.message); }
}
setInterval(syncWd, 10000).unref();

async function shopRoutes(req, res, u, P, M, C) {
  let m;
  if (M === 'GET' && P === '/api/trk/shop/list') {
    const { user } = await mainUser(req, u);
    const q = user.role === 'seller' ? { sellerId: user.id } : { buyerId: user.id };
    const rows = await C('corders').find(Object.assign({ shopOrderId: { $exists: true } }, q)).sort({ _id: -1 }).limit(60).toArray();
    const loc = user.role === 'seller' ? await C('shoploc').findOne({ _id: user.id }) : null;
    send(res, 200, {
      shop: loc ? { lat: loc.lat, lng: loc.lng, address: loc.address } : null,
      list: rows.map(o => ({
        id: o._id, orderId: o.shopOrderId, status: o.status, mine: user.role === 'seller', fee: o.fee, productSum: o.productSum, km: o.km, prepaid: !!o.prepaid, token: trkToken(o._id),
        courier: o.courierId && ['qabul', 'oldi', 'yetkazildi'].includes(o.status) ? { name: String(o.courierName || '').split(' ')[0], phone: o.courierPhone || '' } : null,
        url: (o.status === 'qabul' || o.status === 'oldi') ? '/kuzat/' + trkToken(o._id) : null
      }))
    });
    return true;
  }
  if (M === 'POST' && P === '/api/trk/shop/loc') {
    const { user } = await mainUser(req, u);
    if (user.role !== 'seller') throw new E('Ruxsat yoq', 403);
    const b = await readBody(req), lat = Number(b.lat), lng = Number(b.lng);
    if (!okLL(lat, lng)) throw new E("Joylashuv noto'g'ri");
    await C('shoploc').updateOne({ _id: user.id }, { $set: { lat, lng, address: String(b.address || user.name || '').slice(0, 200) } }, { upsert: true });
    send(res, 200, { ok: true });
    return true;
  }
  if (M === 'POST' && (P === '/api/trk/shop/quote' || P === '/api/trk/shop/call')) {
    const { sdb, user } = await mainUser(req, u);
    const b = await readBody(req);
    const r = await shopQuote(C, sdb, user, b, P.endsWith('/call'));
    send(res, 200, r);
    return true;
  }
  if (M === 'POST' && P === '/api/trk/shop/cancel') {
    const { sdb, user } = await mainUser(req, u);
    const b = await readBody(req);
    const r = unwrap(await C('corders').findOneAndUpdate({ shopOrderId: Number(b.orderId), sellerId: user.id, status: { $in: ['yangi', 'qabul'] } }, { $set: { status: 'bekor', doneAt: new Date().toISOString() } }, { returnDocument: 'after' }));
    if (!r) throw new E("Bekor qilib bo'lmaydi (kuryer mahsulotni olgan bo'lishi mumkin)");
    await refundSeller(sdb, r);
    send(res, 200, { ok: true });
    return true;
  }
  return false;
}

// Kuryer holati o'zgarsa: sotuvchi va xaridorga bildirishnoma, do'kon buyurtma holati yangilanadi
async function syncShop() {
  try {
    const SVI = global.SVI;
    if (!SVI || !SVI.pushNotify || !SVI.loadDB) return;
    const d = await db();
    const sdb0 = await SVI.loadDB();
    // do'kon buyurtmasi bekor qilingan bo'lsa, kuryer chaqiruvi ham bekor bo'ladi va kuryer haqi qaytariladi
    const act = await d.collection('corders').find({ shopOrderId: { $exists: true }, status: { $in: ['yangi', 'qabul'] } }).limit(50).toArray();
    for (const o of act) {
      const ord0 = sdb0.orders.find(x => x.id === o.shopOrderId);
      if (ord0 && ord0.status === 'bekor qilindi') {
        const r = unwrap(await d.collection('corders').findOneAndUpdate({ _id: o._id, status: { $in: ['yangi', 'qabul'] } }, { $set: { status: 'bekor', doneAt: new Date().toISOString() } }, { returnDocument: 'after' }));
        if (r) await refundSeller(sdb0, r);
      }
    }
    const rows = await d.collection('corders').find({ shopOrderId: { $exists: true }, status: { $ne: 'yangi' }, $expr: { $ne: ['$status', { $ifNull: ['$shopSynced', ''] }] } }).limit(20).toArray();
    const fresh = await d.collection('corders').find({ shopOrderId: { $exists: true }, status: 'yangi', shopSynced: { $nin: ['yangi'] } }).limit(20).toArray();
    for (const o of fresh) await d.collection('corders').updateOne({ _id: o._id }, { $set: { shopSynced: 'yangi' } });
    if (!rows.length) return;
    const sdb = await SVI.loadDB();
    let dirty = false;
    for (const o of rows) {
      const ord = sdb.orders.find(x => x.id === o.shopOrderId);
      const single = ord && new Set(ord.items.map(i => i.sellerId)).size === 1;
      const nm = String(o.courierName || 'Kuryer').split(' ')[0];
      const toS = (title, body) => SVI.pushNotify(sdb, [o.sellerId], { title, body, tag: 'kuryer' + o._id, url: '/' });
      const toB = (title, body) => ord && SVI.pushNotify(sdb, [ord.buyerId], { title, body, tag: 'kuryer' + o._id, url: '/' });
      if (o.status === 'qabul') {
        toS('Kuryer topildi', nm + ' №' + o.shopOrderId + ' buyurtmani olishga yo\'lga chiqdi');
        toB('Kuryer tayinlandi', nm + ' buyurtmangizni olib keladi. Xaritada kuzating');
      } else if (o.status === 'oldi') {
        if (single && ord && ['yangi', 'tasdiqlandi'].includes(ord.status)) { ord.status = 'kuryerga topshirildi'; dirty = true; }
        toS('Kuryer mahsulotni oldi', '№' + o.shopOrderId + ' buyurtma yo\'lda');
        toB("Buyurtmangiz yo'lda", nm + ' buyurtmangizni olib yo\'lga chiqdi. Xaritada kuzating');
      } else if (o.status === 'yetkazildi') {
        if (o.prepaid && o.courierId) {
          // xaridor pul bermagan: kuryer haqi sotuvchi hisobidan olingan, kuryerga hamyoniga o'tkaziladi (courier.js yozgan "naqd"dan ayriladi)
          const g = unwrap(await d.collection('corders').findOneAndUpdate({ _id: o._id, prepaidSettled: { $ne: true } }, { $set: { prepaidSettled: true } }, { returnDocument: 'after' }));
          if (g) await d.collection('couriers').updateOne({ _id: o.courierId }, { $inc: { cash: -o.fee, balance: o.fee } });
        }
        if (single && ord && ord.status !== 'yetkazildi' && ord.status !== 'bekor qilindi' && SVI.settle) {
          ord.status = 'yetkazildi'; ord.deliveredAt = new Date().toISOString();
          const s = sdb.users.find(x => x.id === o.sellerId); if (s) SVI.settle(sdb, s);
          dirty = true;
        }
        toS('Buyurtma yetkazildi', '№' + o.shopOrderId + ' buyurtmani kuryer topshirdi');
        toB('Buyurtma yetkazildi', ord && ord.status !== 'yetkazildi' ? "«Mahsulotni oldim» tugmasini bosing" : 'Xaridingiz uchun rahmat!');
      } else if (o.status === 'javob_yoq') {
        if (single && ord && ord.status === 'kuryerga topshirildi') { ord.status = 'tasdiqlandi'; dirty = true; }
        toS('Xaridor javob bermadi', '№' + o.shopOrderId + ': kuryer mahsulotni sizga qaytaradi');
        toB('Kuryer sizga yetib bora olmadi', "Sotuvchi bilan bog'laning");
      }
      await d.collection('corders').updateOne({ _id: o._id }, { $set: { shopSynced: o.status } });
    }
    if (dirty) await SVI.saveDB(sdb);
  } catch (e) { console.error('tracking.js do\'kon sinxron xatosi:', e.message); }
}
setInterval(syncShop, 8000).unref();

async function handle(req, res) {
  const u = new URL(req.url, 'http://x'), P = u.pathname, M = req.method;
  let m;

  // Kuryer admin sahifasi (courier.js beradi): javobga orqaga tugmasi va pastki menyu tuzatishi qo'shiladi
  if (M === 'GET' && /^\/kuryer-admin\/?$/.test(P)) { hookAdminPage(req, res); return false; }

  // Kuryer va Hamkor sahifalari: courier.html ga GPS va "kuzatuv havolasi" avtomatik qo'shiladi
  if (M === 'GET' && (P === '/kuryer' || P === '/hamkor')) {
    fs.readFile(path.join(__dirname, 'public', 'courier.html'), (e, d) => {
      if (e) { res.writeHead(404); return res.end('public/courier.html topilmadi'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(patchHtml(String(d), P));
    });
    return true;
  }

  // Mijoz sahifasi
  if (M === 'GET' && /^\/kuzat\/[\w-]+$/.test(P)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
    res.end(PAGE);
    return true;
  }
  // Kuryer admin sahifasi API si: faqat 'courier' huquqi borlar (asosiy admin ham)
  if (P.startsWith('/api/c/')) {
    const p = parseTok(bearer(req) || u.searchParams.get('t'));
    if (p && p.kind === 'u' && !(await courierAdminOk(p.id))) throw new E("Kuryer admin huquqingiz yo'q", 403);
    if (M === 'GET' && P === '/api/c/courier/orders') hookCourierOrders(req, res);
    return false;
  }
  if (!P.startsWith('/api/trk/')) return false;
  const D = await db();
  const C = n => D.collection(n);

  if (P.startsWith('/api/trk/shop/') && await shopRoutes(req, res, u, P, M, C)) return true;
  if ((P === '/api/trk/cwithdraw' || P === '/api/trk/cwithdrawals') && await courierWd(req, res, u, P, M, C)) return true;

  // Admin uchun: tasdiqlashni kutayotgan kuryer/hamkorlar
  if (M === 'GET' && P === '/api/trk/pending') {
    const p = parseTok(bearer(req) || u.searchParams.get('t'));
    if (!p || p.kind !== 'u' || !(await courierAdminOk(p.id))) throw new E("Ruxsat yo'q", 403);
    const pick = a => a.map(x => ({ id: x._id, name: x.name }));
    const cs = await C('couriers').find({ status: 'kutilmoqda' }, { projection: { name: 1 } }).limit(50).toArray();
    const ps = await C('partners').find({ status: 'kutilmoqda' }, { projection: { name: 1 } }).limit(50).toArray();
    send(res, 200, { couriers: pick(cs), partners: pick(ps), topups: await C('topups').countDocuments({ status: 'kutilmoqda' }), withdrawals: await C('withdrawals').countDocuments({ status: 'kutilmoqda' }) });
    return true;
  }

  // Kuryer GPS yuboradi
  if (M === 'POST' && P === '/api/trk/loc') {
    const p = parseTok(bearer(req));
    if (!p || p.kind !== 'c') throw new E('Kirish kerak', 401);
    const b = await readBody(req), lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 36 || lat > 46 || lng < 55 || lng > 74) throw new E("Joylashuv noto'g'ri");
    const prev = LIVE.get(p.id);
    if (prev && Date.now() - prev.t < 800) { send(res, 200, { ok: true }); return true; }
    let a = ACTIVE.get(p.id);
    if (!a || Date.now() - a.t > 20000) {
      a = { n: await C('corders').countDocuments({ courierId: p.id, status: { $in: ['qabul', 'oldi'] } }), t: Date.now() };
      ACTIVE.set(p.id, a);
    }
    if (!a.n) { LIVE.delete(p.id); send(res, 200, { active: false }); return true; }
    const hd = Number(b.hdg), sp = Number(b.spd);
    LIVE.set(p.id, { lat, lng, acc: Number(b.acc) || null, hdg: Number.isFinite(hd) && b.hdg !== null && hd >= 0 && hd <= 360 ? hd : null, spd: Number.isFinite(sp) && b.spd !== null ? sp : null, t: Date.now() });
    send(res, 200, { active: true });
    return true;
  }

  // Hamkor o'z buyurtmasining kuzatuv havolasini oladi
  if (M === 'GET' && (m = P.match(/^\/api\/trk\/link\/(\d+)$/))) {
    const p = parseTok(bearer(req));
    if (!p || p.kind !== 'p') throw new E('Kirish kerak', 401);
    const o = await C('corders').findOne({ _id: Number(m[1]), partnerId: p.id }, { projection: { _id: 1 } });
    if (!o) throw new E('Buyurtma topilmadi', 404);
    const base = process.env.RENDER_EXTERNAL_URL || ((req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host);
    send(res, 200, { url: base + '/kuzat/' + trkToken(o._id) });
    return true;
  }

  // Mijoz uchun ochiq ma'lumot (token bilan, har soniyada so'ralishi mumkin, shuning uchun keshlanadi)
  if (M === 'GET' && (m = P.match(/^\/api\/trk\/o\/([\w-]+)$/))) {
    const id = parseTrk(m[1]);
    if (id === null) throw new E("Havola noto'g'ri", 404);
    const { o, c } = await orderInfo(C, id);
    if (!o) throw new E('Buyurtma topilmadi', 404);
    const out = {
      id: o._id, status: o.status, partner: o.partnerName,
      dest: { lat: o.customer.lat, lng: o.customer.lng, address: o.customer.address },
      pickup: { lat: o.pickup.lat, lng: o.pickup.lng }, courier: null, etaMin: null, km: null
    };
    if ((o.status === 'qabul' || o.status === 'oldi') && o.courierId) {
      const l = LIVE.get(o.courierId), fresh = !!l && Date.now() - l.t < FRESH_MS;
      out.courier = {
        name: String((c && c.name) || '').split(' ')[0], transport: (c && c.transport) || '', phone: (c && c.phone) || '',
        fresh, lat: fresh ? l.lat : null, lng: fresh ? l.lng : null, hdg: fresh ? l.hdg : null, spd: fresh ? l.spd : null
      };
      if (fresh) {
        const sp = SPEED[c && c.transport] || 15;
        if (o.status === 'oldi') { const km = dist(l, o.customer) * 1.3; out.km = Math.round(km * 10) / 10; out.etaMin = Math.max(1, Math.round(km / sp * 60)); }
        else { const km = (dist(l, o.pickup) + dist(o.pickup, o.customer)) * 1.3; out.km = Math.round(km * 10) / 10; out.etaMin = Math.max(1, Math.round(km / sp * 60) + 5); }
      }
    }
    send(res, 200, out);
    return true;
  }
  throw new E("Bunday so'rov yo'q", 404);
}

// ---------- Yangi kuryer / hamkor ro'yxatdan o'tsa, "Kuryer admin" huquqi borlarga bildirishnoma ----------
async function notifyNew() {
  try {
    const SVI = global.SVI;
    if (!SVI || !SVI.pushNotify || !SVI.loadDB) return;
    const d = await db();
    for (const [col, title] of [['couriers', 'Yangi kuryer'], ['partners', "Yangi hamkor (do'kon/kafe)"]]) {
      const list = await d.collection(col).find({ status: 'kutilmoqda', notified: { $ne: true } }, { projection: { name: 1 } }).limit(20).toArray();
      if (!list.length) continue;
      const sdb = await SVI.loadDB();
      const ids = sdb.users.filter(u => u.role === 'admin' && SVI.hasPerm(u, 'courier')).map(u => u.id);
      for (const x of list) SVI.pushNotify(sdb, ids, { title, body: String(x.name || '') + ' tasdiqlashni kutmoqda', tag: col, url: '/kuryer-admin' });
      await d.collection(col).updateMany({ _id: { $in: list.map(x => x._id) } }, { $set: { notified: true } });
    }
  } catch (e) { console.error('tracking.js bildirishnoma xatosi:', e.message); }
}
setInterval(notifyNew, 15000).unref();

// ---------- server.js ga ulanish ----------
const origCreate = http.createServer;
http.createServer = function (...a) {
  const li = a.find(x => typeof x === 'function');
  const wrapped = async (req, res) => {
    try { if (await handle(req, res)) return; }
    catch (e) {
      if (!(e instanceof E)) console.error('tracking.js xato:', e);
      if (!res.headersSent) send(res, e instanceof E ? e.status : 500, { error: e instanceof E ? e.message : 'Server xatosi' });
      return;
    }
    return li(req, res);
  };
  return origCreate.call(http, ...a.map(x => x === li ? wrapped : x));
};


// ---------- courier.html ni avtomatik to'ldirish ----------
const TRACK_BTN = "${o.status === 'qabul' || o.status === 'oldi' ? `<button class=\"btn ghost\" data-act=\"pTrack\" data-id=\"${o.id}\">\ud83d\udccd Mijozga kuzatuv havolasi</button>` : ''}\n  ";
const INJECT = `<script>
(function(){
  if(typeof MODE==='undefined'||typeof ACT==='undefined')return;
  var GPS={id:null,last:null,lock:null,sent:0};
  function push(){
    var p=GPS.last; if(!p||!TOKEN||Date.now()-GPS.sent<900)return; GPS.sent=Date.now();
    fetch('/api/trk/loc',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+TOKEN},
      body:JSON.stringify({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy,hdg:p.coords.heading,spd:p.coords.speed})}).catch(function(){});
  }
  function wake(){try{if(navigator.wakeLock)navigator.wakeLock.request('screen').then(function(l){GPS.lock=l;}).catch(function(){});}catch(e){}}
  function sync(){
    var on=MODE==='courier'&&TOKEN&&ORD.some(function(o){return o.status==='qabul'||o.status==='oldi';});
    if(on&&GPS.id===null&&navigator.geolocation){
      GPS.id=navigator.geolocation.watchPosition(function(p){GPS.last=p;push();},
        function(e){if(e.code===1)toast("Joylashuvga ruxsat bering, mijoz sizni ko'ra olmaydi");},
        {enableHighAccuracy:true,maximumAge:0,timeout:20000});
      wake();
    }else if(!on&&GPS.id!==null){
      navigator.geolocation.clearWatch(GPS.id);GPS.id=null;GPS.last=null;
      if(GPS.lock){GPS.lock.release().catch(function(){});GPS.lock=null;}
    }
  }
  // Kuryer hamyonida "Pulni yechib olish" bo'limi
  var CWD=null,CWDJ='';
  function loadCwd(){
    if(MODE!=='courier'||!TOKEN)return;
    fetch('/api/trk/cwithdrawals',{headers:{Authorization:'Bearer '+TOKEN}}).then(function(r){return r.json();}).then(function(j){
      var t=JSON.stringify(j.list||[]); if(t!==CWDJ){CWDJ=t;CWD=j.list||[];if(TAB==='wallet')render();}
    }).catch(function(){});
  }
  if(MODE==='courier'&&typeof walletView==='function'){
    var _wv=walletView;
    walletView=function(){
      var h=_wv.apply(this,arguments); loadCwd();
      var c=INFO.cfg||{};
      var rows=(CWD||[]).map(function(x){return '<div class="note">'+fmt(x.amount)+' (komissiya '+fmt(x.fee)+') · <b>'+esc(x.status)+'</b></div>';}).join('')||'<div class="note">Hali yo\\'q</div>';
      var blk='<div class="card"><b>Pulni yechib olish</b><div class="note">Komissiya '+Math.round((c.withdrawRate||0.01)*100)+'%: balansdan summa + komissiya yechiladi. Eng kam: '+fmt(c.minWithdraw||50000)+'. Balansda kamida '+fmt(c.minBalance||10000)+' qoladi.</div>'
        +'<label>Summa</label><input id="w_amt" inputmode="numeric"><label>Karta raqami</label><input id="w_card" inputmode="numeric" placeholder="8600 0000 0000 0000"><button class="btn" data-act="cWithdraw">Yechib olishni so\\'rash</button></div>'
        +'<div class="card"><b>Yechib olishlar</b>'+rows+'</div>';
      var tail='<p class="c"><a href="#" data-act="out">Chiqish</a></p>';
      return h.endsWith(tail)?h.slice(0,h.length-tail.length)+blk+tail:h+blk;
    };
    ACT.cWithdraw=function(){
      var a=document.getElementById('w_amt').value,cd=document.getElementById('w_card').value;
      fetch('/api/trk/cwithdraw',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+TOKEN},body:JSON.stringify({amount:a,card:cd})})
      .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Xato');return j;});})
      .then(function(){toast("So'rov yuborildi");CWDJ='';load();loadCwd();})
      .catch(function(e){toast(e.message);});
    };
  }
  setInterval(push,1000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&GPS.id!==null){wake();push();}});
  var _r=render; render=function(){_r.apply(this,arguments);sync();};
  ACT.pTrack=function(d){
    fetch('/api/trk/link/'+d.id,{headers:{Authorization:'Bearer '+TOKEN}})
    .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Xato');return j;});})
    .then(function(j){
      if(navigator.share){navigator.share({title:'Buyurtmangiz kuzatuvi',url:j.url}).catch(function(){});}
      else if(navigator.clipboard){navigator.clipboard.writeText(j.url).then(function(){toast('Havola nusxalandi');}).catch(function(){prompt('Havola:',j.url);});}
      else prompt('Havola:',j.url);
    }).catch(function(e){toast(e.message);});
  };
})();
</script>`;
const MONEY_OLD = "Sotuvchiga to'lanadi: <b>${fmt(o.productSum)}</b><br>Mijozdan olinadi: <b>${fmt(o.productSum + o.fee)}</b><br>Sizning haqingiz: <b>${fmt(o.fee)}</b>";
const MONEY_NEW = "${o.prepaid ? 'Oldindan to‘langan: mijozdan pul <b>olinmaydi</b>.<br>' : 'Sotuvchiga to‘lanadi: <b>' + fmt(o.productSum) + '</b><br>Mijozdan olinadi: <b>' + fmt(o.productSum + o.fee) + '</b><br>'}Sizning haqingiz: <b>${fmt(o.fee)}</b>${o.prepaid ? ' (hamyoningizga tushadi)' : ''}";
function patchHtml(html, P) {
  if (html.includes(MONEY_OLD)) html = html.replace(MONEY_OLD, () => MONEY_NEW);
  else console.warn("tracking.js: kuryer sahifasidagi summa matni topilmadi (oldindan to'langan buyurtma matni qo'shilmadi)");
  html = html.replace('>Yetkazdim, pulni oldim<', () => ">${o.prepaid ? 'Yetkazdim' : 'Yetkazdim, pulni oldim'}<");
  // 1) Hamkor buyurtma kartasiga tugma
  const k = html.indexOf('data-act="pCancel"');
  const st = k > -1 ? html.lastIndexOf('${', k) : -1;
  if (st > -1) html = html.slice(0, st) + TRACK_BTN + html.slice(st);
  else console.warn("tracking.js: 'pCancel' joyi topilmadi, havola tugmasi qo'shilmadi");
  // 2) GPS + tugma funksiyasi
  html = html.replace('</body>', () => INJECT + '</body>');
  // 3) PWA manifest (courier.js dagi kabi)
  return html.replace('</head>', () => '<link rel="manifest" href="/' + (P === '/hamkor' ? 'hamkor' : 'kuryer') + '.webmanifest"></head>');
}
module.exports = { patchHtml, notifyNew };

// ---------- Mijoz sahifasi ----------
const PAGE = `<!DOCTYPE html>
<html lang="uz"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Buyurtma kuzatuvi</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
:root{--g:#0B6B52;--gl:#DDF0E8;--ink:#14201B;--mut:#6B7A72;--bg:#fff;--chip:#F1F4F2}
@media (prefers-color-scheme:dark){:root{--gl:#1F3A31;--ink:#EEF3F0;--mut:#9FB1A8;--bg:#17201C;--chip:#233029}}
html,body{height:100%;margin:0}
body{display:flex;flex-direction:column;background:var(--bg);color:var(--ink);font:500 14px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif}
#map{flex:1;min-height:0}
#sheet{padding:10px 18px calc(16px + env(safe-area-inset-bottom,0px));border-radius:22px 22px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.14);position:relative;z-index:500;background:var(--bg);text-align:center}
.grip{width:46px;height:5px;border-radius:9px;background:var(--chip);margin:0 auto 12px}
#lbl{color:var(--mut);font-size:15px}
#eta{font-size:38px;font-weight:800;letter-spacing:-1px;margin:2px 0 12px}
#steps{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:10px}
.s{width:46px;height:46px;border-radius:50%;background:var(--chip);color:var(--mut);display:flex;align-items:center;justify-content:center;font-size:20px;flex:none}
.s.d{background:var(--gl);color:var(--g)}
.s.c{background:var(--g);color:#fff}
.ln{width:22px;height:3px;background:var(--chip);flex:none}.ln.d{background:var(--gl)}
#txt{color:var(--mut);font-size:15px;min-height:22px}
#cr{display:none;align-items:center;gap:12px;margin-top:14px;text-align:left}
.av{width:48px;height:48px;border-radius:50%;background:var(--g);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;flex:none}
#cn{font-size:18px;font-weight:800}#cs{color:var(--mut)}
#call{margin-left:auto;background:var(--chip);color:var(--ink);text-decoration:none;font-weight:800;padding:13px 18px;border-radius:26px;white-space:nowrap}
.car{transition:none;will-change:transform}
</style></head><body>
<div id="map"></div>
<div id="sheet"><div class="grip"></div>
<div id="lbl">Yuklanmoqda...</div><div id="eta"></div>
<div id="steps"></div><div id="txt"></div>
<div id="cr"><div class="av" id="av">K</div><div><div id="cn"></div><div id="cs">Kuryer</div></div><a id="call" href="#">Qo\u2018ng\u2018iroq</a></div>
</div>
<script>
var tk=location.pathname.split('/').pop();
var map=L.map('map',{zoomControl:false}).setView([40.9983,71.6726],13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'\u00a9 OpenStreetMap'}).addTo(map);
function el(i){return document.getElementById(i);}
var CAR='<div class="car" id="car" style="width:44px;height:44px"><svg width="44" height="44" viewBox="0 0 44 44"><ellipse cx="22" cy="24" rx="15" ry="19" fill="rgba(0,0,0,.18)"/><rect x="11" y="4" width="22" height="36" rx="10" fill="#1E88FF" stroke="#fff" stroke-width="2.5"/><rect x="14" y="12" width="16" height="8" rx="3" fill="#0B2A4A"/><rect x="14" y="29" width="16" height="5" rx="2" fill="#0B2A4A" opacity=".85"/></svg></div>';
var homeIc=L.divIcon({html:'<div style="font-size:30px;line-height:34px;text-align:center">\ud83c\udfe0</div>',className:'',iconSize:[34,34],iconAnchor:[17,30]});
var shopIc=L.divIcon({html:'<div style="font-size:28px;line-height:32px;text-align:center">\ud83c\udfea</div>',className:'',iconSize:[32,32],iconAnchor:[16,28]});
var carIc=L.divIcon({html:CAR,className:'',iconSize:[44,44],iconAnchor:[22,22]});
var mC=null,mD=null,mP=null,line=null,cur=null,anim=0,fitD=false,userMoved=false,lastFit=0,timer=0,done=false,last=null;
map.on('dragstart',function(){userMoved=true;});
function mdist(a,b){var r=Math.PI/180,dl=(b.lat-a.lat)*r,dg=(b.lng-a.lng)*r,h=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dg/2)*Math.sin(dg/2);return 12742000*Math.asin(Math.sqrt(h));}
function bear(a,b){var r=Math.PI/180,y=Math.sin((b.lng-a.lng)*r)*Math.cos(b.lat*r),x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos((b.lng-a.lng)*r);return (Math.atan2(y,x)/r+360)%360;}
function rot(h){var c=el('car');if(c)c.style.transform='rotate('+h+'deg)';}
function moveCar(lat,lng,hdg){
  if(!mC){mC=L.marker([lat,lng],{icon:carIc,zIndexOffset:1000}).addTo(map);cur={lat:lat,lng:lng,hdg:hdg||0};rot(cur.hdg);return;}
  var from={lat:cur.lat,lng:cur.lng},d=mdist(from,{lat:lat,lng:lng});
  if(d>1500){cur.lat=lat;cur.lng=lng;mC.setLatLng([lat,lng]);return;}
  var h0=cur.hdg,h1=(hdg!=null)?hdg:(d>3?bear(from,{lat:lat,lng:lng}):h0);
  var dh=((h1-h0+540)%360)-180,t0=performance.now(),dur=1000;
  cancelAnimationFrame(anim);
  (function step(now){var k=Math.min(1,(now-t0)/dur);
    cur.lat=from.lat+(lat-from.lat)*k;cur.lng=from.lng+(lng-from.lng)*k;cur.hdg=h0+dh*k;
    mC.setLatLng([cur.lat,cur.lng]);rot(cur.hdg);
    if(line&&mD)line.setLatLngs([[cur.lat,cur.lng],mD.getLatLng()]);
    if(k<1)anim=requestAnimationFrame(step);})(performance.now());
}
var IDX={yangi:0,qabul:1,oldi:2,yetkazildi:3},ICO=['\ud83d\udd53','\ud83c\udf73','\ud83d\udef5','\u2713'];
var TXT={yangi:'Buyurtmangiz qabul qilindi, kuryer qidirilmoqda',qabul:'Buyurtmangiz tayyorlanmoqda, kuryer do\u2018konda',oldi:'Kuryer siz tomon yo\u2018lga chiqdi',yetkazildi:'Buyurtma yetkazildi \u2705',javob_yoq:'Yetkazib bo\u2018lmadi, mijoz javob bermadi',bekor:'Buyurtma bekor qilindi'};
function steps(st){
  var n=IDX[st],h='';
  for(var i=0;i<4;i++){
    var c=n===undefined?'':(i<n?'d':(i===n?'c':''));
    if(i)h+='<div class="ln '+(n!==undefined&&i<=n?'d':'')+'"></div>';
    h+='<div class="s '+c+'">'+ICO[i]+'</div>';
  }
  el('steps').innerHTML=h;
}
function hm(d){return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
function draw(d){
  last=d;steps(d.status);el('txt').textContent=TXT[d.status]||d.status;
  var c=d.courier;
  if(d.dest&&!mD){mD=L.marker([d.dest.lat,d.dest.lng],{icon:homeIc}).addTo(map);}
  if(d.pickup&&d.status==='qabul'){if(!mP)mP=L.marker([d.pickup.lat,d.pickup.lng],{icon:shopIc}).addTo(map);}
  else if(mP){map.removeLayer(mP);mP=null;}
  var lbl='',eta='';
  if(c&&c.fresh&&d.etaMin!=null){var a=new Date(Date.now()+d.etaMin*60000),b=new Date(a.getTime()+5*60000);lbl='Yetkazib beradigan vaqtimiz:';eta=hm(a)+' \u2013 '+hm(b);}
  else if(c)lbl='Kuryer joylashuvi kutilmoqda...';
  else if(d.status==='yetkazildi'||d.status==='javob_yoq'||d.status==='bekor')lbl='';
  else lbl='Buyurtma holati';
  el('lbl').textContent=lbl;el('eta').textContent=eta;
  if(c){el('cr').style.display='flex';el('cn').textContent=c.name||'Kuryer';el('av').textContent=(c.name||'K').charAt(0).toUpperCase();
    var cl=el('call');if(c.phone){cl.href='tel:'+c.phone;cl.style.display='';}else cl.style.display='none';}
  else el('cr').style.display='none';
  if(c&&c.fresh){
    moveCar(c.lat,c.lng,c.hdg);
    var tgt=d.status==='qabul'?d.pickup:d.dest;
    if(tgt&&mD){var p=[[c.lat,c.lng],[d.dest.lat,d.dest.lng]];if(!line)line=L.polyline(p,{color:'#1E88FF',weight:4,opacity:.55,dashArray:'2 9',lineCap:'round'}).addTo(map);}
    if(!userMoved&&Date.now()-lastFit>8000){var pts=[[c.lat,c.lng],[d.dest.lat,d.dest.lng]];if(d.status==='qabul')pts.push([d.pickup.lat,d.pickup.lng]);map.fitBounds(L.latLngBounds(pts),{padding:[70,70],maxZoom:17,animate:true});lastFit=Date.now();}
  }else{
    if(mC){map.removeLayer(mC);mC=null;cur=null;}
    if(line){map.removeLayer(line);line=null;}
    if(d.dest&&!fitD){map.setView([d.dest.lat,d.dest.lng],15);fitD=true;}
  }
  if(d.status==='yetkazildi'||d.status==='javob_yoq'||d.status==='bekor')done=true;
}
function tick(){
  if(done)return;
  if(document.hidden){timer=setTimeout(tick,2000);return;}
  fetch('/api/trk/o/'+tk,{cache:'no-store'}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Xato');return j;});})
  .then(draw).catch(function(e){el('lbl').textContent=e.message;}).then(function(){timer=setTimeout(tick,1000);});
}
steps('yangi');tick();
</script></body></html>`;
