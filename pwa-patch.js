// SavdoUz: PWA yordamchisi. server.js ning 2-qatoriga: require('./pwa-patch.js');
const http = require('http');
const origCreate = http.createServer;
const HEAD_TAGS = '<link rel="manifest" href="/manifest.json"><meta name="theme-color" content="#6C4BF4"><link rel="apple-touch-icon" href="/icon-192-6.png"><script>if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js")}</script></head>';
const SW = [
  "self.addEventListener('install', function () { self.skipWaiting(); });",
  "self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });",
  "self.addEventListener('fetch', function () {});",
  "self.addEventListener('push', function (e) {",
  "  var d = {};",
  "  try { d = e.data.json(); } catch (x) {}",
  "  e.waitUntil(self.registration.showNotification(d.title || 'SavdoUz', {",
  "    body: d.body || '', tag: d.tag || 'savdouz', renotify: true,",
  "    vibrate: [200, 100, 200, 100, 200], data: { url: d.url || '/' }",
  "  }));",
  "});",
  "self.addEventListener('notificationclick', function (e) {",
  "  e.notification.close();",
  "  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {",
  "    for (var i = 0; i < l.length; i++) if ('focus' in l[i]) return l[i].focus();",
  "    return self.clients.openWindow('/');",
  "  }));",
  "});"
].join('\n');

http.createServer = function () {
  const args = Array.prototype.slice.call(arguments);
  const i = args.length - 1;
  const handler = args[i];
  if (typeof handler !== 'function') return origCreate.apply(this, args);
  args[i] = function (req, res) {
    const p = String(req.url || '').split('?')[0];
    if (p === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
      return res.end(SW);
    }
    const isPage = req.method === 'GET' && !p.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(p);
    if (isPage || p === '/index.html') {
      const origEnd = res.end;
      res.end = function (chunk) {
        try {
          if (chunk && (Buffer.isBuffer(chunk) || typeof chunk === 'string')) {
            const s = chunk.toString('utf8');
            if (s.indexOf('</head>') !== -1 && s.indexOf('rel="manifest"') === -1) {
              arguments[0] = Buffer.from(s.replace('</head>', HEAD_TAGS));
            }
          }
        } catch (e) {}
        return origEnd.apply(this, arguments);
      };
    }
    return handler.call(this, req, res);
  };
  return origCreate.apply(this, args);
};
