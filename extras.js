// extras.js — SavdoUz qo'shimchalari: ko'k dizayn, dollar kursi, bildirishnoma rasmi/belgisi
// server.js da "require('./pwa-patch.js');" qatoridan keyin: require('./extras.js');
const http = require('http'), https = require('https');
const BADGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAFaklEQVR42u1cTYscVRQ9t6pFUALpCQiixoUuXAhBogs3zkKDKyHgWgV/QdZunP/hxo0LcSBkYzQGjBICxo+RoGh0Fm6MAxJEZ2TMdFcdF31feBTdPVXV1e/Vxz1Q1MxQ07ffux/n3VvvXcBgMBgMBoPBYDAYDAaDwWAwGIYAKfsgybTG5+ciQpvmiCCZ2Cys6AEkRwBeBDCq8NkZgO9E5ICkmCfUs17R+wbJe6yO30i+YJ6wGGUnhQD2AeRq2XmJKwPwJIBPST4+04Epoa4C3LNVrhTAFMAYwDsWglZXQB2k6j1vkNwQkdyFNUN1BWQlrnwOyRPAQwDOBFJ6LxUgAE6qRY/0Pu+a93m5/n2zau4xBJRdVk4AfAzghFq0LLD0pwCcLjzj7i9p+Mlt2te3bH1Nl59Tbyma6/0uyQ1/eWuokFgds4RM1LJ3APwL4GHPC5zVjwGcIXkNQEoy63WGG3rVRzIhmZL8Ri0+87xgovcts/maHlCG0EVkSvI6gLMe+fo8sEly7HlMLyOxjvdQRP5rpBZU0gNSEclIngdwUZel6Zyl7D8eafcV9wBsisgvJBMRyUMoQESEJB8DcLvAA0PDLQDPAeBxXNBYUqSTLwD2APzsueM8F+3rNdH7FbX6Y9+hNJ2VpiKSAbjuJWHzvK6vlyu9bC8xwLUqwAm8NsCs1y06dgHsaEjOQivAWfzXmg+kPSfbeWO/ISJHZee2UQVU4IE+19W26/xTaB7o49o/AXAHwJdVxp2s6csMjQfuh14R2deciLEUMGQeuFTV6BpXwAB5gGpkfwO47GX80ThgaDzgxrYjIntaemBsBQyJB9xYP6kzp8marWIIPJBiVny7WMfb16KAAfFApt79A4BdzX7zNnjAUHjgfqgtW3wLqYAh8IB7sfRRXS9fpwL6zgO1im/BFDAAHqhVfAvpAX3ngVrFt9AK6CsP1C6+hVZAX3mgdvEtqAIGwAOXVvXsEDuV+8YDKxXfYiigLA8Q5U7exL6meq9VfCtiFEABRR5YtF9IOkLSzmgvF5KxdipgDg+cLSjA7aD7AMD7+nMXNu7eXDX8hPIAxwOL9o06jEXkatcIYdVd0EFc/ph9o84b9gG8CeAA3dg7+q2I/LXqGehQCujjvtFzInLVGVerQ1CBB34C8PwCBXRhierC57SJDxsF/OKOB24s4YGunKBMmvLekAN2cfIz2EnJKB7gDml/AeAPAI8COEKNt0gtCEFsapEQTAHKA4kWr85jduz1VAeN1hnMA13zALhWBSJyU7uovA7gFW8w0hEPSAD8WQit3YF1TQmcByxRwrw6il8TYgQLKyufveoAQ1JIjoqn6PXscdJ3+bEnPy38PiZ50v97zaaBnZDfCj4g+QjJLZJfaV+JuyR/JPkeyWedlfZNflsm/1WSvy/pPXdE8oKGibQv8lsRdkieK/SUyLTDSq4/T7y+E1tNhYPY8ttAuELyFMk9Hex0iQXmaoU5yc1VJyG2/DZZ/1ahm8oyuAn6XDuzJF2V36Yl5/clrM+3wpzkIcnTqyR0seX7SGJMviYwJzBrbyYlv4d7S/YggKfrJpKx5UdXQGFAScD/a5v8OArw3o4dakGrSrlBMOtIcqduISy2/LZ4QCIih5ht1irbSdE9swvg1zrHgVokvzUJ2DNKgBOvu+IiuObhbzWwDI0qv21L0QveMm9amAiXDLnBb7vmgF2X3zZPeLdgbVmh6yJJfqhFMmmqJhNbfmtyAr2/TPIKyYNCaeAWybeLz/dFvrQlHLnNTSSf8NbZewBu+13X1/ESJLb81nDCIusKEXNjyZcWKsLf9EQEfvUXW77BYDAYDAaDwWAwGAwGwxrxPyZYax4Ci+LDAAAAAElFTkSuQmCC', 'base64');
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
    const sell = x && Math.round(parseFloat(x.nbu_cell_price));
    if (sell > 1000) { usd = { sell, kind: 'sotish', updated: new Date().toISOString() }; usdAt = Date.now(); return usd; }
  } catch (e) {}
  try { // 2) Markaziy bank rasmiy kursi (zaxira)
    const a = await getJSON('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/');
    const sell = Math.round(parseFloat(a[0].Rate));
    if (sell > 1000) { usd = { sell, kind: 'MB', updated: new Date().toISOString() }; usdAt = Date.now(); return usd; }
  } catch (e) {}
  return usd; // eski qiymat (bo'lsa)
}

// ---------- Sahifaga qo'shiladigan dollar kursi ----------
const USD_HTML = '<div id="usdbox" style="position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:10px;z-index:40;background:#fff;color:#0A33B0;border-radius:14px;padding:5px 10px;font:800 12px -apple-system,Segoe UI,sans-serif;box-shadow:0 4px 14px -4px rgba(15,75,224,.4);display:none;pointer-events:none;"></div>' +
'<script>(function(){var b=document.getElementById("usdbox");function f(n){return String(n).replace(/\B(?=(\d{3})+(?!\d))/g," ");}' +
'function load(){fetch("/api/usd").then(function(r){return r.json();}).then(function(d){if(d&&d.sell){b.textContent="$ "+d.kind+": "+f(d.sell);b.style.display="block";}}).catch(function(){});}' +
'load();setInterval(load,30*60*1000);})();</script>';

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
          s = i === -1 ? s + USD_HTML : s.slice(0, i) + USD_HTML + s.slice(i);
          arguments[0] = Buffer.from(s);
        } catch (e) { console.error('extras xato:', e.message); }
      }
      return oEnd.apply(null, arguments);
    };
    return handler.apply(this, arguments);
  });
};
console.log('extras.js yuklandi ✅');
