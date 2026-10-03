// extras.js — SavdoUz qo'shimchalari: ko'k dizayn, dollar kursi, bildirishnoma rasmi/belgisi
// server.js da "require('./pwa-patch.js');" qatoridan keyin: require('./extras.js');
const http = require('http'), https = require('https');
const zlib = require('zlib');
// Bildirishnoma uchun shaffof fonda oq savat belgisi (96x96) — kod o'zi chizadi
function makeBadge() {
  const N = 96, SS = 3, rows = [];
  const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
  const dSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
  const basket = [[24, 28], [86, 28], [78, 54], [31, 54]], handle = [[10, 20], [22, 20], [32, 60], [78, 60]];
  const on = (x, y) => inPoly(x, y, basket) || [0, 1, 2].some(i => dSeg(x, y, handle[i], handle[i + 1]) <= 3.5) || Math.hypot(x - 38, y - 75) <= 7 || Math.hypot(x - 70, y - 75) <= 7;
  for (let y = 0; y < N; y++) {
    const r = Buffer.alloc(1 + N * 4);
    for (let x = 0; x < N; x++) {
      let k = 0; for (let a = 0; a < SS; a++) for (let b = 0; b < SS; b++) if (on(x + (a + 0.5) / SS, y + (b + 0.5) / SS)) k++;
      r[1 + x * 4] = r[2 + x * 4] = r[3 + x * 4] = 255; r[4 + x * 4] = Math.round(255 * k / (SS * SS));
    }
    rows.push(r);
  }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const BADGE = makeBadge();
const BLUE = '#0F4BE0';

// ---------- Rang: binafsha/pushti ranglarni logotipdagi ko'kka almashtirish ----------
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  return [h * 360, s, l];
}
function hsl2rgb(h, s, l) {
  h /= 360; if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255));
}
function shift(r, g, b) {
  const [h, s, l] = rgb2hsl(r, g, b);
  if (s < 0.15) return [r, g, b];
  if (h >= 245 && h <= 290) return hsl2rgb(223, s, l);
  if (h >= 335 && h <= 353) return hsl2rgb(223, s, l * 0.82);
  return [r, g, b];
}
const hex2 = n => ('0' + n.toString(16)).slice(-2);
function recolor(html) {
  html = html.replace(/([:\s,('"])#([0-9a-fA-F]{6})\b/g, (m, pre, hx) => {
    const c = shift(parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16));
    return pre + '#' + c.map(hex2).join('');
  });
  html = html.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g, (m, r, g, b) => {
    const c = shift(+r, +g, +b); return m.slice(0, m.indexOf('(') + 1) + c.join(',');
  });
  html = html.replace(/<meta[^>]*name=["']theme-color["'][^>]*>/i, '<meta name="theme-color" content="' + BLUE + '">');
  return html;
}

// ---------- Dollar kursi ----------
let usd = null, usdAt = 0;
function getJSON(u) {
  return new Promise((resolve, reject) => {
    const rq = https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, timeout: 8000 }, r => {
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)); }
      let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    rq.on('timeout', () => rq.destroy(new Error('timeout'))); rq.on('error', reject);
  });
}
async function loadUsd() {
  if (usd && Date.now() - usdAt < 30 * 60 * 1000) return usd;
  try { // 1) NBU (O'zMilliybank) — bank sotish kursi
    const a = await getJSON('https://nbu.uz/en/exchange-rates/json/');
    const x = (Array.isArray(a) ? a : []).find(i => String(i.code).toUpperCase() === 'USD');
    const sell = x && Math.round(parseFloat(x.nbu_cell_price)), buy = x && Math.round(parseFloat(x.nbu_buy_price));
    if (sell > 1000) { usd = { sell, buy: buy > 1000 ? buy : null, kind: 'bank', updated: new Date().toISOString() }; usdAt = Date.now(); return usd; }
  } catch (e) {}
  try { // 2) Markaziy bank rasmiy kursi (zaxira)
    const a = await getJSON('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/');
    const sell = Math.round(parseFloat(a[0].Rate));
    if (sell > 1000) { usd = { sell, kind: 'MB', updated: new Date().toISOString() }; usdAt = Date.now(); return usd; }
  } catch (e) {}
  return usd; // eski qiymat (bo'lsa)
}

// ---------- Sahifaga qo'shiladigan dollar kursi ----------
const USD_HTML = '<style>*{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}input,textarea,select,[contenteditable]{-webkit-user-select:text;user-select:text}</style><div id="usdbox" style="position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:10px;z-index:40;background:#fff;color:#0A33B0;border-radius:14px;padding:5px 10px;line-height:1.3;text-align:right;font:800 12px -apple-system,Segoe UI,sans-serif;box-shadow:0 4px 14px -4px rgba(15,75,224,.4);display:none;pointer-events:none;"></div>' +
'<script>(function(){var b=document.getElementById("usdbox");function f(n){return String(n).replace(/\B(?=(\d{3})+(?!\d))/g," ");}' +
'function load(){fetch("/api/usd").then(function(r){return r.json();}).then(function(d){if(d&&d.sell){b.innerHTML=d.buy?"$ olish: "+f(d.buy)+"<br>$ sotish: "+f(d.sell):"$ MB: "+f(d.sell);b.style.display="block";}}).catch(function(){});}' +
'load();setInterval(load,30*60*1000);document.addEventListener("selectstart",function(e){var t=e.target&&e.target.tagName;if(t!=="INPUT"&&t!=="TEXTAREA"&&t!=="SELECT")e.preventDefault();},true);document.addEventListener("contextmenu",function(e){var t=e.target&&e.target.tagName;if(t!=="INPUT"&&t!=="TEXTAREA")e.preventDefault();},true);})();</script>';
const SW = String.raw`self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data.json(); } catch (x) {}
  var o = {
    body: d.body || '', tag: d.tag || 'savdouz', renotify: true, silent: false, requireInteraction: false,
    icon: d.icon || '/sv-192.png', badge: '/badge.png',
    vibrate: [200, 100, 200, 100, 200], data: { url: d.url || '/' }
  };
  if (d.icon && String(d.icon).indexOf('/api/img/') === 0) o.image = d.icon;
  e.waitUntil(self.registration.showNotification(d.title || 'SavdoUz', o));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
    for (var i = 0; i < l.length; i++) if ('focus' in l[i]) return l[i].focus();
    return self.clients.openWindow('/');
  }));
});`;

// ---------- http.createServer ni o'rab olish ----------
const origCreate = http.createServer;
http.createServer = function (handler) {
  return origCreate.call(http, function (req, res) {
    const p = (req.url || '').split('?')[0];
    if (req.method === 'GET') {
      if (p === '/badge.png') { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }); return res.end(BADGE); }
      if (p === '/sw.js') { res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' }); return res.end(SW); }
      if (p === '/api/usd') {
        return loadUsd().then(u => {
          res.writeHead(u ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(JSON.stringify(u || { error: 'kurs yo\'q' }));
        });
      }
    }
    const oWH = res.writeHead.bind(res), oEnd = res.end.bind(res); let html = false;
    res.writeHead = function (code, headers) {
      if (headers && typeof headers === 'object' && /text\/html/i.test(String(headers['Content-Type'] || ''))) html = true;
      return oWH.apply(null, arguments);
    };
    res.end = function (chunk) {
      if (html && chunk && (Buffer.isBuffer(chunk) || typeof chunk === 'string')) {
        try {
          let s = recolor(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk);
          const i = s.lastIndexOf('</body>');
          // eski dollar qutisi o'chirildi
          arguments[0] = Buffer.from(s);
        } catch (e) { console.error('extras xato:', e.message); }
      }
      return oEnd.apply(null, arguments);
    };
    return handler.apply(this, arguments);
  });
};
console.log('extras.js yuklandi ✅');
