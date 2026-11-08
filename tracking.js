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

async function handle(req, res) {
  const u = new URL(req.url, 'http://x'), P = u.pathname, M = req.method;
  let m;

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
  if (!P.startsWith('/api/trk/')) return false;
  const D = await db();
  const C = n => D.collection(n);

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
function patchHtml(html, P) {
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
module.exports = { patchHtml };

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
