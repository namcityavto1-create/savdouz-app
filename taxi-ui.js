// ===== SavdoUz Taksi: yo'lovchi ekrani (yangi dizayn v2). index.html ga <script src="/taxi-ui.js?v=2"></script> bilan ulanadi =====
(function(){
  'use strict';
  if(window.__taxiUI) return; window.__taxiUI = 1;
  var NAM = [40.9983, 71.6726];
  var AIRPORT = { lat: 40.9846, lng: 71.5567 }; // Namangan aeroporti (taxminiy)
  var E = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var F = function(n){ return Number(n || 0).toLocaleString('ru-RU') + " so'm"; };
  var say = function(m){ try { toast(m); } catch(e){ alert(m); } };
  var tget = function(p){ return api('/api/taxi' + p); };
  var tpost = function(p, b){ return api('/api/taxi' + p, { method: 'POST', body: JSON.stringify(b || {}) }); };
  var lsGet = function(k){ try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; } };
  var lsSet = function(k, v){ try { if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
  var STTXT = {
    yangi: 'Haydovchi qidirilmoqda…',
    qabul: "Haydovchi sizga qarab yo'lga chiqdi",
    keldi: 'Haydovchi yetib keldi, chiqing!',
    yolda: 'Safar boshlandi',
    yetkazildi: 'Safar tugadi',
    bekor: 'Buyurtma bekor qilindi'
  };
  var CHIP = { yangi: 'Qidirilmoqda', qabul: "Yo'lda", keldi: 'Keldi', yolda: 'Safarda', yetkazildi: 'Tugadi', bekor: 'Bekor' };
  var FABTXT = { yangi: 'Haydovchi qidirilmoqda', qabul: "Taksi yo'lda", keldi: 'Taksi keldi!', yolda: 'Safarda' };

  var CAR_SVG = '<svg viewBox="0 0 230 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="txcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd84a"/><stop offset="1" stop-color="#f2a500"/></linearGradient></defs>'
    + '<ellipse cx="115" cy="90" rx="105" ry="7" fill="#000" opacity=".35"/>'
    + '<path d="M10 70 L22 46 Q27 38 38 37 L66 34 L84 16 Q89 11 97 11 L142 11 Q151 11 156 17 L172 35 L200 41 Q220 46 222 62 L222 72 Q222 77 216 77 L16 77 Q8 77 10 70Z" fill="url(#txcg)"/>'
    + '<path d="M90 18 L141 18 L155 35 L74 35Z" fill="#13224f"/><path d="M116 18 L116 35" stroke="#f2a500" stroke-width="3"/>'
    + '<rect x="100" y="2" width="30" height="10" rx="3" fill="#fff" stroke="#111" stroke-width="1.5"/><text x="115" y="10" font-size="7" font-weight="800" text-anchor="middle" fill="#111" font-family="sans-serif">TAXI</text>'
    + '<rect x="176" y="49" width="38" height="9" rx="4" fill="#fff8d6"/><rect x="14" y="54" width="14" height="6" rx="3" fill="#ff4b3a"/>'
    + '<path d="M16 66 L216 66" stroke="#111" stroke-width="3" opacity=".8"/>'
    + '<circle cx="58" cy="77" r="16" fill="#111"/><circle cx="58" cy="77" r="8" fill="#c9ccd6"/><circle cx="176" cy="77" r="16" fill="#111"/><circle cx="176" cy="77" r="8" fill="#c9ccd6"/></svg>';
  var SKY_SVG = '<svg viewBox="0 0 400 220" preserveAspectRatio="xMaxYMax slice" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="txg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7a6bff" stop-opacity=".7"/><stop offset="1" stop-color="#7a6bff" stop-opacity="0"/></radialGradient></defs>'
    + '<circle cx="250" cy="70" r="60" fill="url(#txg)"/>'
    + '<rect x="248" y="20" width="4" height="150" fill="#9b8cff"/><ellipse cx="250" cy="78" rx="12" ry="5" fill="#b9aeff"/><ellipse cx="250" cy="96" rx="8" ry="3" fill="#8f82ff"/>'
    + '<g fill="#101d4f"><rect x="290" y="110" width="30" height="80"/><rect x="326" y="95" width="26" height="95"/><rect x="358" y="120" width="42" height="70"/><rect x="170" y="130" width="28" height="60"/><rect x="205" y="120" width="24" height="70"/><rect x="120" y="140" width="40" height="50"/></g>'
    + '<g fill="#ffd84a" opacity=".55"><rect x="296" y="120" width="3" height="3"/><rect x="306" y="132" width="3" height="3"/><rect x="332" y="108" width="3" height="3"/><rect x="342" y="124" width="3" height="3"/><rect x="366" y="132" width="3" height="3"/><rect x="380" y="146" width="3" height="3"/><rect x="176" y="142" width="3" height="3"/><rect x="210" y="132" width="3" height="3"/></g>'
    + '<rect x="0" y="185" width="400" height="35" fill="#0a1128"/></svg>';

  var css = document.createElement('style');
  css.textContent =
    '#taxiFab{position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 92px);z-index:9000;border:0;border-radius:26px;padding:12px 16px;font:800 14px/1 inherit;background:#FFC529;color:#1b1b1b;box-shadow:0 4px 14px rgba(0,0,0,.28)}'
  // ---- xarita ekrani ----
  + '.txo{position:fixed;inset:0;z-index:99996;background:var(--bg,#f3f5f2);display:flex;flex-direction:column;color:var(--ink,#14201b)}'
  + '.txh{display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;font-weight:800;font-size:17px;background:var(--card,#fff)}'
  + '.txh button{width:42px;height:42px;border-radius:50%;border:0;background:var(--vl,#e8eef9);font-size:22px;color:inherit}'
  + '.txmap{flex:1;min-height:0}'
  + '.txs{background:var(--card,#fff);border-radius:22px 22px 0 0;margin-top:-18px;position:relative;z-index:1000;padding:14px 16px calc(env(safe-area-inset-bottom,0px) + 16px);box-shadow:0 -4px 18px rgba(0,0,0,.15)}'
  + '.txchips{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}'
  + '.txchip{display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:14px;border:2px solid var(--line,#e1e7e3);background:var(--card,#fff);font:700 14px/1.2 inherit;text-align:left;color:inherit}'
  + '.txchip.on{border-color:#FFC529;background:#FFF6D6;color:#1b1b1b}'
  + '.txchip small{display:block;font-weight:500;color:var(--mut,#667);font-size:12px}'
  + '.txchip.on small{color:#665}'
  + '.txin{width:100%;padding:11px 12px;border:1.5px solid var(--line,#e1e7e3);border-radius:12px;font:inherit;background:var(--card,#fff);color:inherit;margin-bottom:8px}'
  + '.txb{display:block;width:100%;border:0;border-radius:14px;padding:15px 0;font:800 15px/1 inherit;background:#FFC529;color:#1b1b1b;margin-top:6px}'
  + '.txb:disabled{opacity:.45}.txb.g{background:var(--vl,#eef3ff);color:var(--vt,#2a4fd0)}.txb.r{background:#fadbd8;color:#7a160d}'
  + '.txtar{display:flex;gap:8px;margin-bottom:8px}.txt{flex:1;border:2px solid var(--line,#e1e7e3);background:var(--card,#fff);border-radius:14px;padding:10px 6px;font:inherit;color:inherit;text-align:center}.txt.on{border-color:#FFC529;background:#FFF6D6;color:#1b1b1b}.txt b{display:block;font-size:15px}.txt small{display:block;font-size:12.5px;color:inherit;opacity:.75;margin-top:2px}'
  + '.txp{font-size:15px;margin:2px 0 8px}.txp b{font-size:22px}'
  + '.txst{font-weight:800;font-size:18px;text-align:center}.txeta{text-align:center;color:var(--mut,#667);margin:4px 0 8px}'
  + '.txd{display:flex;align-items:center;gap:12px;margin-top:6px}.txav{width:50px;height:50px;border-radius:50%;background:#FFC529;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;color:#1b1b1b}'
  + '.txd .n{font-weight:800;font-size:17px}.txd .s{color:var(--mut,#667);font-size:13px}'
  + '.txcall{margin-left:auto;background:var(--vl,#eef3ff);color:inherit;border-radius:28px;padding:13px 18px;font-weight:700;text-decoration:none;white-space:nowrap}'
  + '.txm{font-size:26px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}'
  + '.txplate{display:inline-block;background:#fff;border:2px solid #222;border-radius:6px;padding:1px 8px;font-weight:800;color:#222;font-size:13px}'
  // ---- bosh sahifa (yangi dizayn: sariq-qora premium) ----
  + '.hm{position:fixed;inset:0;z-index:99990;background:#0b1430;color:#fff;display:flex;flex-direction:column;font-family:inherit}'
  + '.hms{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:12px}'
  + '.hmh{position:relative;min-height:330px;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 0;background:linear-gradient(180deg,#0a1a55 0%,#0b1430 100%);overflow:hidden}'
  + '.hmsky{position:absolute;inset:0;opacity:.9}.hmsky svg{width:100%;height:100%}'
  + '.hmtop{position:relative;z-index:2;display:flex;justify-content:space-between}'
  + '.hmx,.hmbell{width:42px;height:42px;border-radius:50%;border:0;background:rgba(0,0,0,.45);color:#fff;font-size:19px;position:relative}'
  + '.hmbell i{position:absolute;top:-3px;right:-3px;background:#ff3b30;color:#fff;border-radius:50%;width:19px;height:19px;font:700 12px/19px sans-serif;font-style:normal}'
  + '.hmlogo{position:relative;z-index:2;display:flex;align-items:center;gap:10px;margin-top:6px}'
  + '.hmpin{width:62px;height:62px;border-radius:50% 50% 50% 8%;transform:rotate(-45deg);background:#FFC529;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.4)}.hmpin span{transform:rotate(45deg);font-size:28px}'
  + '.hmlogo .t1{font:900 38px/1 inherit;font-style:italic;letter-spacing:-1px}.hmlogo .t1 span{color:#FFC529}.hmlogo .t2{font:900 40px/1 inherit;font-style:italic;letter-spacing:-1px}'
  + '.hmtag{position:relative;z-index:2;margin-top:12px;font:800 19px/1 inherit;font-style:italic}.hmtag i{color:#FFC529;margin:0 5px}'
  + '.hmcar{position:absolute;z-index:1;right:-18px;bottom:-4px;width:70%;max-width:340px}.hmcar svg{width:100%;display:block}'
  + '.hmcard{position:relative;z-index:3;margin:-8px 12px 0;background:#f4f6ff;color:#111;border-radius:24px;padding:8px 6px 8px 0;display:flex;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.35)}'
  + '.hmcard .ic{flex:none;width:58px;height:58px;border-radius:50%;background:#FFC529;margin:0 8px 0 14px;display:flex;align-items:center;justify-content:center;font-size:28px}'
  + '.hmcard .rows{flex:1;min-width:0}'
  + '.hmr{display:flex;align-items:center;gap:10px;width:100%;padding:11px 8px;border:0;background:none;text-align:left;color:#111;font:inherit}'
  + '.hmr+.hmr{border-top:1px solid #d9dcec}.hmr .pi{font-size:22px}.hmr b{display:block;font-size:19px}.hmr small{display:block;font-size:14px;color:#556}.hmr .ch{margin-left:auto;font-size:26px;color:#333}'
  + '.hmgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 12px 0}'
  + '.hmtile{border:0;background:#15234d;color:#fff;border-radius:18px;padding:12px 2px;font:700 13px/1.15 inherit;text-align:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}.hmtile span{display:block;font-size:28px;margin-bottom:5px}'
  + '.hmpromo{margin:12px 12px 0;border-radius:22px;padding:12px 14px;background:linear-gradient(90deg,#ffd43b,#ffb300);color:#111;display:flex;align-items:center;gap:12px}'
  + '.hmpromo .g{font-size:46px}.hmpromo .tx{flex:1;min-width:0}.hmpromo b{display:block;font-size:23px;font-weight:900}.hmpromo em{display:block;font-size:16px;font-weight:700}'
  + '.hmpromo button{border:0;background:#0b1430;color:#fff;border-radius:24px;padding:12px 16px;font:800 16px/1 inherit;white-space:nowrap}'
  + '.hmfeat{margin:12px 12px 0;background:#15234d;border-radius:20px;display:grid;grid-template-columns:repeat(4,1fr);padding:10px 0}'
  + '.hmfeat div{text-align:center;font:700 12.5px/1.2 inherit;padding:2px 2px;border-left:1px solid rgba(255,255,255,.12)}.hmfeat div:first-child{border-left:0}.hmfeat span{display:block;font-size:24px;margin-bottom:4px}'
  + '.hmcta{display:flex;align-items:center;justify-content:center;gap:10px;width:calc(100% - 24px);margin:12px 12px 0;border:0;border-radius:32px;padding:17px 0;background:linear-gradient(90deg,#ffd43b,#ffb300);color:#111;font:900 22px/1 inherit;box-shadow:0 6px 18px rgba(255,180,0,.35)}'
  + '.hmn{display:flex;background:#0e1a3d;border-radius:22px 22px 0 0;padding:8px 4px calc(env(safe-area-inset-bottom,0px) + 8px);box-shadow:0 -4px 16px rgba(0,0,0,.4)}'
  + '.hmn button{flex:1;border:0;background:none;color:#fff;font:700 14px/1.2 inherit;padding:6px 0 7px;position:relative}.hmn button span{display:block;font-size:24px;margin-bottom:2px}'
  + '.hmn button.on{color:#FFC529}.hmn button.on:after{content:"";position:absolute;left:22%;right:22%;bottom:0;height:3px;border-radius:3px;background:#FFC529}'
  + '.hmpg{padding:calc(env(safe-area-inset-top,0px) + 16px) 14px 8px}.hmpg h2{font:900 26px/1.1 inherit;margin:4px 2px 14px}'
  + '.hmo{display:flex;align-items:center;gap:10px;background:#15234d;border-radius:16px;padding:13px 14px;margin-bottom:10px;width:100%;border:0;color:#fff;text-align:left;font:inherit}.hmo b{display:block;font-size:16px}.hmo small{display:block;color:#aab3d6;font-size:13px;margin-top:2px}.hmo .r{margin-left:auto;text-align:right}'
  + '.hmchip{display:inline-block;border-radius:10px;padding:3px 9px;font:700 12px/1.3 inherit;background:#2a3a73;color:#fff;margin-top:4px}.hmchip.ok{background:#1f7a46}.hmchip.no{background:#7a2a2a}.hmchip.go{background:#FFC529;color:#111}'
  + '.hmbox{background:#15234d;border-radius:18px;padding:16px;margin-bottom:12px}.hmbox .l{color:#aab3d6;font-size:14px}.hmbox .v{font:900 26px/1.2 inherit;margin-top:4px}.hmbox p{color:#c9d0ee;font-size:14px;margin:8px 0 0}'
  + '.hm2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.hm2 .hmbox{margin:0}'
  + '.hmbtn{display:block;width:100%;border:0;border-radius:14px;padding:14px 0;background:#15234d;color:#fff;font:700 15px/1 inherit;margin-bottom:10px}.hmbtn.y{background:#FFC529;color:#111}'
  + '.hmem{text-align:center;color:#aab3d6;padding:30px 10px}';
  document.head.appendChild(css);

  function loadLeaflet(){
    return new Promise(function(ok, no){
      if(window.L) return ok();
      if(!document.getElementById('kLeafCss')){ var l = document.createElement('link'); l.id = 'kLeafCss'; l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(l); }
      var ex = document.getElementById('kLeafJs');
      if(ex){ var t = setInterval(function(){ if(window.L){ clearInterval(t); ok(); } }, 100); setTimeout(function(){ clearInterval(t); if(!window.L) no(); }, 15000); return; }
      var s = document.createElement('script'); s.id = 'kLeafJs'; s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s);
    });
  }
  var icon = function(emoji){ return L.divIcon({ html: '<div class="txm">' + emoji + '</div>', className: '', iconSize: [30, 30], iconAnchor: [15, 26] }); };

  var T = null; // ochiq xarita ekrani
  var H = null; // ochiq bosh sahifa

  function closeMap(){
    if(!T) return;
    clearInterval(T.tm); T.dead = true;
    try { if(T.map) T.map.remove(); } catch(e){}
    if(T.el && T.el.parentNode) T.el.parentNode.removeChild(T.el);
    T = null;
    if(H && H.tab === 'orders') paintHome();
    syncFab();
  }

  function shell(title){
    var w = document.createElement('div'); w.className = 'txo';
    w.innerHTML = '<div class="txh"><button data-x>←</button><span>' + E(title) + '</span></div><div class="txmap"></div><div class="txs"></div>';
    document.body.appendChild(w);
    w.querySelector('[data-x]').onclick = closeMap;
    return w;
  }
  function initMap(center, zoom){
    T.map = L.map(T.el.querySelector('.txmap'), { zoomControl: false, attributionControl: true }).setView(center, zoom || 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(T.map);
    setTimeout(function(){ if(T && T.map) T.map.invalidateSize(); }, 200);
  }
  var sheet = function(){ return T.el.querySelector('.txs'); };

  // ---------- Buyurtma berish ----------
  function orderView(){
    T.mode = 'order'; T.tariff = 'start'; T.from = null; T.to = null; T.active = 'to'; T.mk = {}; T.quote = null;
    T.el.querySelector('.txh span').textContent = 'Taksi chaqirish';
    sheet().innerHTML =
      '<div class="txchips"><button class="txchip" data-chip="from">🟢<div>Qayerdan<small data-t="from">Aniqlanmoqda…</small></div></button>'
    + '<button class="txchip on" data-chip="to">🏁<div>Qayerga <em style="font-weight:500">(ixtiyoriy)</em><small data-t="to">Belgilamasangiz ham bo\'ladi, haydovchiga o\'zingiz aytasiz</small></div><span data-clearto style="display:none;margin-left:auto;padding:4px 10px;font-size:18px">✕</span></button></div>'
    + '<div class="txtar"><button class="txt on" data-tar="start"><b>Start</b><small data-f="start">—</small></button><button class="txt" data-tar="komfort"><b>Komfort</b><small data-f="komfort">—</small></button></div>'
    + '<input class="txin" data-note placeholder="Izoh (mo\'ljal, kirish eshigi...) — ixtiyoriy" maxlength="150">'
    + '<div class="txp" data-price>Joylashuvingiz aniqlanmoqda…</div>'
    + '<button class="txb" data-go disabled>🚕 Taksi chaqirish · naqd</button>'
    + '<button class="txb g" data-me>📍 Mening joylashuvim</button>';
    var s = sheet();
    s.querySelectorAll('[data-chip]').forEach(function(b){ b.onclick = function(){ setActive(b.dataset.chip); }; });
    s.querySelectorAll('[data-tar]').forEach(function(b){ b.onclick = function(){ T.tariff = b.dataset.tar; paintTar(); }; });
    s.querySelector('[data-clearto]').onclick = function(ev){ ev.stopPropagation(); clearTo(); };
    s.querySelector('[data-me]').onclick = locate;
    s.querySelector('[data-go]').onclick = submit;
    T.map.on('click', function(e){ setPoint(T.active, e.latlng.lat, e.latlng.lng); });
    locate();
    var o = T.opts || {};
    if(o.to){
      setPoint('to', o.to.lat, o.to.lng);
      try { T.map.setView([o.to.lat, o.to.lng], 14); } catch(e){}
    } else if(o.saveAs){
      T.saveAs = o.saveAs;
      var el = s.querySelector('[data-t="to"]');
      if(el) el.textContent = (o.saveAs === 'home' ? 'Uyingizni' : 'Ish joyingizni') + ' xaritada bosib belgilang';
    }
    if(o.active) setActive(o.active);
    T.opts = {};
  }
  function clearTo(){
    if(T.mk.to){ try { T.map.removeLayer(T.mk.to); } catch(e){} delete T.mk.to; }
    T.to = null;
    var el = sheet().querySelector('[data-t="to"]'); if(el) el.textContent = 'Belgilamasangiz ham bo\'ladi, haydovchiga o\'zingiz aytasiz';
    var x = sheet().querySelector('[data-clearto]'); if(x) x.style.display = 'none';
    if(T.from) calc();
  }
  function paintTar(){
    var s = sheet();
    s.querySelectorAll('[data-tar]').forEach(function(b){ b.classList.toggle('on', b.dataset.tar === T.tariff); });
    var pr = s.querySelector('[data-price]'), go = s.querySelector('[data-go]');
    if(!T.quote) return;
    var f = T.quote.fees[T.tariff];
    if(f == null){ go.disabled = true; return; }
    if(T.quote.open) pr.innerHTML = 'Manzilsiz chaqiruv<br>Narx: <b>' + F(f) + '</b> dan · keyingi har km ' + F(T.quote.perKm[T.tariff]) + ' · naqd';
    else pr.innerHTML = 'Masofa: <b>' + T.quote.km + ' km</b><br>Narx: <b>' + F(f) + '</b> · naqd';
    go.disabled = false;
  }
  function setActive(k){ T.active = k; sheet().querySelectorAll('[data-chip]').forEach(function(b){ b.classList.toggle('on', b.dataset.chip === k); }); }
  function setPoint(k, lat, lng){
    var p = { lat: lat, lng: lng, address: '' };
    T[k] = p;
    if(T.mk[k]) T.mk[k].setLatLng([lat, lng]); else T.mk[k] = L.marker([lat, lng], { icon: icon(k === 'from' ? '🟢' : '🏁') }).addTo(T.map);
    var el = sheet().querySelector('[data-t="' + k + '"]'); if(el) el.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5) + ' ✓';
    if(k === 'to' && T.saveAs){
      lsSet(T.saveAs === 'home' ? 'taxiHome' : 'taxiWork', { lat: lat, lng: lng });
      say(T.saveAs === 'home' ? 'Uy manzili saqlandi 🏠' : 'Ish manzili saqlandi 💼');
      T.saveAs = null;
    }
    if(k === 'to'){ var cx = sheet().querySelector('[data-clearto]'); if(cx) cx.style.display = ''; }
    if(k === 'from' && !T.to) setActive('to');
    if(T.from) calc();
  }
  function locate(){
    if(!navigator.geolocation){ var el = sheet().querySelector('[data-t="from"]'); if(el) el.textContent = 'Xaritada bosib belgilang'; setActive('from'); return; }
    navigator.geolocation.getCurrentPosition(function(p){
      if(!T || T.mode !== 'order') return;
      setPoint('from', p.coords.latitude, p.coords.longitude);
      if(!T.to) T.map.setView([p.coords.latitude, p.coords.longitude], 15);
    }, function(){
      if(!T || T.mode !== 'order') return;
      var el = sheet().querySelector('[data-t="from"]'); if(el && !T.from) el.textContent = 'Xaritada bosib belgilang';
      if(!T.from) setActive('from');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
  }
  function calc(){
    var pr = sheet().querySelector('[data-price]'), go = sheet().querySelector('[data-go]');
    var f = { lat: T.from.lat, lng: T.from.lng }, t = T.to ? { lat: T.to.lat, lng: T.to.lng } : null;
    var my = ++T.q; go.disabled = true;
    if(t){ try { T.map.fitBounds(L.latLngBounds([[f.lat, f.lng], [t.lat, t.lng]]), { padding: [50, 50], maxZoom: 16 }); } catch(e){} }
    var body = { from: f }; if(t) body.to = t;
    tpost('/quote', body).then(function(r){
      if(!T || my !== T.q) return;
      if(r.fees.start === null){ pr.innerHTML = '<b style="color:#7a160d">Masofa ' + r.max + ' km dan oshib ketdi</b>'; return; }
      T.quote = r;
      ['start', 'komfort'].forEach(function(k){ var el = sheet().querySelector('[data-f="' + k + '"]'); if(el) el.textContent = F(r.fees[k]); });
      paintTar();
    }).catch(function(e){ if(T && my === T.q) pr.textContent = e.message; });
  }
  function submit(){
    var go = sheet().querySelector('[data-go]'); go.disabled = true;
    tpost('/order', { tariff: T.tariff, from: T.from, to: T.to, note: sheet().querySelector('[data-note]').value }).then(function(r){
      say('Buyurtma yuborildi 🚕'); trackView(r.order);
    }).catch(function(e){ say(e.message); go.disabled = false; });
  }

  // ---------- Kuzatuv ----------
  function trackView(o){
    clearInterval(T.tm); T.mode = 'track'; T.oid = o.id; T.fitted = false;
    T.el.querySelector('.txh span').textContent = 'Taksi';
    try { T.map.off('click'); } catch(e){}
    Object.keys(T.mk || {}).forEach(function(k){ T.map.removeLayer(T.mk[k]); }); T.mk = {};
    T.mk.from = L.marker([o.from.lat, o.from.lng], { icon: icon('🟢') }).addTo(T.map);
    var tp = [[o.from.lat, o.from.lng]];
    if(o.to){ T.mk.to = L.marker([o.to.lat, o.to.lng], { icon: icon('🏁') }).addTo(T.map); tp.push([o.to.lat, o.to.lng]); }
    if(tp.length > 1) T.map.fitBounds(L.latLngBounds(tp), { padding: [60, 60], maxZoom: 16 }); else T.map.setView(tp[0], 15);
    draw(o);
    T.tm = setInterval(function(){
      if(!T || document.hidden) return;
      tget('/o/' + T.oid).then(function(r){ if(T && r.order) draw(r.order); }).catch(function(){});
    }, 1000);
  }
  function draw(o){
    var d = o.driver, final = o.status === 'yetkazildi' || o.status === 'bekor';
    if(d && d.lat != null && !final){
      if(T.mk.drv) T.mk.drv.setLatLng([d.lat, d.lng]); else T.mk.drv = L.marker([d.lat, d.lng], { icon: icon('🚕'), zIndexOffset: 1000 }).addTo(T.map);
      if(!T.fitted){ T.fitted = true; var pts = [[d.lat, d.lng], [o.from.lat, o.from.lng]]; if(o.to) pts.push([o.to.lat, o.to.lng]); T.map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16 }); }
    } else if(T.mk.drv && final){ T.map.removeLayer(T.mk.drv); delete T.mk.drv; }
    var sig = o.status + '|' + (d ? d.name : '') + '|' + o.etaMin;
    var s = sheet();
    var st = STTXT[o.status] || '';
    if(o.status === 'bekor' && o.reason) st += ' (' + o.reason + ')';
    var h = '<div class="txst">' + E(st) + '</div>';
    if(o.status === 'yetkazildi') h += '<div class="txeta">Haydovchiga naqd to\'lang: <b>' + F(o.fee) + '</b></div>';
    else if(o.open && o.status === 'yolda') h += '<div class="txeta">Manzilni haydovchiga ayting · narx yo\'lga qarab, ' + F(o.fee) + ' dan</div>';
    else if(o.etaMin != null) h += '<div class="txeta">' + E(o.tariffName || '') + ' · taxminan ' + o.etaMin + ' daqiqada' + (o.status === 'yolda' ? ' manzilga yetamiz' : ' yetib keladi') + '</div>';
    else if(o.status === 'yangi') h += '<div class="txeta">' + E(o.tariffName || '') + ' · ' + (o.open ? F(o.fee) + ' dan · manzilsiz' : F(o.fee) + ' · ' + o.km + ' km') + ' · naqd</div>';
    if(d && !final){
      h += '<div class="txd"><div class="txav">' + E((d.name || 'H').charAt(0).toUpperCase()) + '</div><div><div class="n">' + E(d.name) + '</div><div class="s">' + E(d.car) + ' · <span class="txplate">' + E(d.plate) + '</span></div></div>'
        + '<a class="txcall" href="tel:' + E(d.phone) + '">📞 Qo\'ng\'iroq</a></div>';
    }
    if(['yangi', 'qabul', 'keldi'].indexOf(o.status) > -1) h += '<button class="txb r" data-cancel>Buyurtmani bekor qilish</button>';
    if(final){ h += '<button class="txb" data-new>Yangi taksi chaqirish</button><button class="txb g" data-close>Yopish</button>'; clearInterval(T.tm); }
    if(T.sig !== sig + h.length){ T.sig = sig + h.length; s.innerHTML = h; bindTrack(o); }
    if(o.status === 'keldi' && T.lastSt !== 'keldi'){ try { if(navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch(e){} }
    T.lastSt = o.status;
  }
  function bindTrack(o){
    var s = sheet(), c = s.querySelector('[data-cancel]'), n = s.querySelector('[data-new]'), x = s.querySelector('[data-close]');
    if(c) c.onclick = function(){ if(confirm('Taksi buyurtmasini bekor qilasizmi?')) tpost('/cancel', { id: o.id }).then(function(){ say('Bekor qilindi'); }).catch(function(e){ say(e.message); }); };
    if(n) n.onclick = function(){ Object.keys(T.mk).forEach(function(k){ T.map.removeLayer(T.mk[k]); }); T.mk = {}; T.sig = ''; T.opts = {}; orderView(); };
    if(x) x.onclick = closeMap;
  }

  function openMap(opts){
    if(T) return;
    opts = opts || {};
    var w = shell('Taksi');
    T = { el: w, q: 0, tm: null, mk: {}, mode: null, opts: opts };
    sheet().innerHTML = '<div class="txst">Yuklanmoqda…</div>';
    loadLeaflet().then(function(){
      if(!T || T.el !== w) return;
      initMap(NAM, 13);
      if(opts.track) trackView(opts.track); else orderView();
    }).catch(function(e){ if(T) sheet().innerHTML = '<div class="txst">' + E(e && e.message ? e.message : 'Xarita yuklanmadi, internetni tekshiring') + '</div>'; });
  }

  // ---------- Bosh sahifa (yangi dizayn) ----------
  function homeTab(){
    return '<div class="hmh"><div class="hmsky">' + SKY_SVG + '</div>'
      + '<div class="hmtop"><button class="hmx" data-close>✕</button><button class="hmbell" data-nav-go="orders">🔔' + (H.active ? '<i>1</i>' : '') + '</button></div>'
      + '<div class="hmlogo"><div class="hmpin"><span>🚕</span></div><div><div class="t1">Savdo<span>Uz</span></div><div class="t2">Taksi</div></div></div>'
      + '<div class="hmtag">Tez<i>•</i>Xavfsiz<i>•</i>Qulay</div>'
      + '<div class="hmcar">' + CAR_SVG + '</div></div>'
      + '<div class="hmcard"><div class="ic">🚕</div><div class="rows">'
      + '<button class="hmr" data-order="from"><span class="pi">🧭</span><div><b>Qayerdan?</b><small>Joylashuvingiz bo\'yicha chaqirish</small></div><span class="ch">›</span></button>'
      + '<button class="hmr" data-order="to"><span class="pi">📍</span><div><b>Qayerga?</b><small>Ixtiyoriy · yakuniy manzilni tanlang</small></div><span class="ch">›</span></button></div></div>'
      + '<div class="hmgrid">'
      + '<button class="hmtile" data-go="home"><span>🏠</span>Uyga<br>borish</button>'
      + '<button class="hmtile" data-go="work"><span>💼</span>Ishga<br>borish</button>'
      + '<button class="hmtile" data-go="air"><span>✈️</span>Aeroport</button>'
      + '<button class="hmtile" data-order><span>🗺️</span>Manzil<br>tanlash</button></div>'
      + '<div class="hmpromo"><div class="g">🎁</div><div class="tx"><b>SavdoUz Taksi</b><em>Har safar yanada qulay!</em></div><button data-info>Batafsil ›</button></div>'
      + '<div class="hmfeat"><div><span>🛡️</span>100%<br>Xavfsizlik</div><div><span>⚡</span>Tez<br>Yetkazish</div><div><span>👍</span>Qulay<br>Narxlar</div><div><span>🎧</span>24/7<br>Qo\'llab-quvvatlash</div></div>'
      + '<button class="hmcta" data-order>🚕 Buyurtma berish <span>›</span></button>';
  }
  function ordersTab(){
    return '<div class="hmpg"><h2>Buyurtmalar</h2><div data-list><div class="hmem">Yuklanmoqda…</div></div></div>';
  }
  function walletTab(){
    return '<div class="hmpg"><h2>Hamyon</h2>'
      + '<div class="hmbox"><div class="l">To\'lov usuli</div><div class="v">💵 Naqd pul</div><p>Safar tugagach haydovchiga naqd to\'laysiz. Elektron to\'lov hozircha mavjud emas.</p></div>'
      + '<div class="hm2" data-stats><div class="hmbox"><div class="l">Safarlar</div><div class="v">…</div></div><div class="hmbox"><div class="l">Jami sarflangan</div><div class="v">…</div></div></div></div>';
  }
  function profileTab(){
    var u = (typeof S !== 'undefined' && S.user) || {};
    return '<div class="hmpg"><h2>Profil</h2>'
      + '<div class="hmbox" style="display:flex;align-items:center;gap:14px"><div class="txav" style="width:58px;height:58px;font-size:26px">' + E(String(u.name || 'Y').charAt(0).toUpperCase()) + '</div>'
      + '<div><div class="v" style="margin:0;font-size:21px">' + E(u.name || "Yo'lovchi") + '</div><div class="l">' + E(u.phone || '') + '</div></div></div>'
      + '<button class="hmbtn" data-clear>🏠💼 Saqlangan manzillarni tozalash</button>'
      + '<button class="hmbtn y" data-close>Do\'konga qaytish</button></div>';
  }
  function fillOrders(){
    var box = H && H.el.querySelector('[data-list]'); if(!box) return;
    tget('/history').then(function(r){
      if(!H || H.tab !== 'orders') return;
      var b = H.el.querySelector('[data-list]'); if(!b) return;
      var L2 = r.orders || [];
      if(!L2.length){ b.innerHTML = '<div class="hmem">Hali taksi buyurtmalari yo\'q</div>'; return; }
      b.innerHTML = L2.map(function(o){
        var live = ['yangi', 'qabul', 'keldi', 'yolda'].indexOf(o.status) > -1;
        var cls = o.status === 'yetkazildi' ? 'ok' : (o.status === 'bekor' ? 'no' : 'go');
        var dt = ''; try { dt = new Date(o.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch(e){}
        return '<button class="hmo" ' + (live ? 'data-oid="' + o.id + '"' : '') + '><div><b>' + E(o.tariffName) + ' · ' + (o.open ? 'manzilsiz' : o.km + ' km') + '</b><small>' + E(dt) + ' · #' + o.id + '</small></div>'
          + '<div class="r"><b>' + F(o.fee) + '</b><span class="hmchip ' + cls + '">' + E(CHIP[o.status] || o.status) + '</span></div></button>';
      }).join('');
      b.querySelectorAll('[data-oid]').forEach(function(x){ x.onclick = function(){ tget('/o/' + x.dataset.oid).then(function(r2){ if(r2.order) openMap({ track: r2.order }); }).catch(function(e){ say(e.message); }); }; });
    }).catch(function(e){ var b = H && H.el.querySelector('[data-list]'); if(b) b.innerHTML = '<div class="hmem">' + E(e.message) + '</div>'; });
  }
  function fillStats(){
    tget('/history').then(function(r){
      if(!H || H.tab !== 'wallet') return;
      var done = (r.orders || []).filter(function(o){ return o.status === 'yetkazildi'; });
      var sum = done.reduce(function(a, o){ return a + (o.fee || 0); }, 0);
      var st = H.el.querySelector('[data-stats]');
      if(st) st.innerHTML = '<div class="hmbox"><div class="l">Tugagan safarlar</div><div class="v">' + done.length + '</div></div><div class="hmbox"><div class="l">Jami sarflangan</div><div class="v" style="font-size:19px">' + F(sum) + '</div></div>';
    }).catch(function(){});
  }
  function bindHome(){
    var w = H.el;
    w.querySelectorAll('[data-close]').forEach(function(b){ b.onclick = closeHome; });
    w.querySelectorAll('[data-nav-go]').forEach(function(b){ b.onclick = function(){ H.tab = b.dataset.navGo; paintHome(); }; });
    w.querySelectorAll('[data-order]').forEach(function(b){ b.onclick = function(){ openMap(b.dataset.order ? { active: b.dataset.order } : {}); }; });
    w.querySelectorAll('[data-go]').forEach(function(b){ b.onclick = function(){
      var k = b.dataset.go;
      if(k === 'air') return openMap({ to: AIRPORT });
      var key = k === 'home' ? 'taxiHome' : 'taxiWork', p = lsGet(key);
      if(p && p.lat != null) openMap({ to: p });
      else { say(k === 'home' ? "Uy manzilini xaritada belgilang (bir marta)" : "Ish manzilini xaritada belgilang (bir marta)"); openMap({ saveAs: k }); }
    }; });
    var inf = w.querySelector('[data-info]');
    if(inf) inf.onclick = function(){
      tget('/info').then(function(r){
        var t = r.cfg.tariffs, m = [];
        Object.keys(t).forEach(function(k){ m.push(t[k].name + ': ' + F(t[k].base) + " (1-km), keyingi har km " + F(t[k].km)); });
        alert(m.join('\n') + '\nEng ko\'pi ' + r.cfg.maxKm + ' km. To\'lov faqat naqd.');
      }).catch(function(e){ say(e.message); });
    };
    var cl = w.querySelector('[data-clear]');
    if(cl) cl.onclick = function(){ lsSet('taxiHome', null); lsSet('taxiWork', null); say('Saqlangan manzillar tozalandi'); };
  }
  function paintHome(){
    if(!H) return;
    var body = H.el.querySelector('[data-body]');
    body.innerHTML = H.tab === 'orders' ? ordersTab() : H.tab === 'wallet' ? walletTab() : H.tab === 'profile' ? profileTab() : homeTab();
    body.scrollTop = 0;
    H.el.querySelectorAll('.hmn button').forEach(function(b){ b.classList.toggle('on', b.dataset.nav === H.tab); });
    bindHome();
    if(H.tab === 'orders') fillOrders();
    if(H.tab === 'wallet') fillStats();
  }
  function openHome(){
    if(H) return;
    var w = document.createElement('div'); w.className = 'hm';
    w.innerHTML = '<div class="hms" data-body></div><nav class="hmn">'
      + '<button data-nav="home"><span>🏠</span>Bosh sahifa</button><button data-nav="orders"><span>🚖</span>Buyurtmalar</button>'
      + '<button data-nav="wallet"><span>👛</span>Hamyon</button><button data-nav="profile"><span>👤</span>Profil</button></nav>';
    document.body.appendChild(w);
    H = { el: w, tab: 'home', active: !!lastActive };
    w.querySelectorAll('.hmn button').forEach(function(b){ b.onclick = function(){ H.tab = b.dataset.nav; paintHome(); }; });
    paintHome();
    syncFab();
    // faol buyurtma bo'lsa, to'g'ridan-to'g'ri kuzatuvga o'tamiz
    tget('/my').then(function(r){
      if(!H) return;
      lastActive = r.order ? r.order.status : null; H.active = !!r.order;
      if(r.order && !T) openMap({ track: r.order });
      else if(H.tab === 'home') paintHome();
    }).catch(function(){});
  }
  function closeHome(){
    if(!H) return;
    closeMap();
    if(H.el.parentNode) H.el.parentNode.removeChild(H.el);
    H = null; syncFab();
  }

  // ---------- Pastdagi "Taksi" tugmasi ----------
  var fab = null, lastActive = null;
  function canUse(){ try { return typeof S !== 'undefined' && S.user && S.user.role !== 'admin' && S.token; } catch(e){ return false; } }
  function syncFab(){
    var show = canUse() && !T && !H;
    if(show && !fab){
      fab = document.createElement('button'); fab.id = 'taxiFab'; fab.textContent = '🚕 Taksi'; fab.onclick = openHome; document.body.appendChild(fab);
    } else if(!show && fab){ fab.parentNode.removeChild(fab); fab = null; }
    if(fab) fab.textContent = lastActive ? '🚕 ' + (FABTXT[lastActive] || 'Taksi') : '🚕 Taksi';
  }
  setInterval(syncFab, 1000);
  setInterval(function(){
    if(!canUse() || T || H || document.hidden) return;
    tget('/my').then(function(r){ lastActive = r.order ? r.order.status : null; syncFab(); }).catch(function(){});
  }, 8000);
  syncFab();
})();
