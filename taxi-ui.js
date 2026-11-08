// ===== SavdoUz: Taksi chaqirish (yo'lovchi ekrani). index.html ga <script src="/taxi-ui.js"></script> bilan ulanadi =====
(function(){
  'use strict';
  if(window.__taxiUI) return; window.__taxiUI = 1;
  var NAM = [40.9983, 71.6726];
  var E = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var F = function(n){ return Number(n || 0).toLocaleString('ru-RU') + " so'm"; };
  var say = function(m){ try { toast(m); } catch(e){ alert(m); } };
  var tget = function(p){ return api('/api/taxi' + p); };
  var tpost = function(p, b){ return api('/api/taxi' + p, { method: 'POST', body: JSON.stringify(b || {}) }); };
  var STTXT = {
    yangi: 'Haydovchi qidirilmoqda…',
    qabul: "Haydovchi sizga qarab yo'lga chiqdi",
    keldi: 'Haydovchi yetib keldi, chiqing!',
    yolda: 'Safar boshlandi',
    yetkazildi: 'Safar tugadi',
    bekor: 'Buyurtma bekor qilindi'
  };
  var FABTXT = { yangi: 'Haydovchi qidirilmoqda', qabul: "Taksi yo'lda", keldi: 'Taksi keldi!', yolda: 'Safarda' };

  var css = document.createElement('style');
  css.textContent =
    '#taxiFab{position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 92px);z-index:9000;border:0;border-radius:26px;padding:12px 16px;font:800 14px/1 inherit;background:#FFC529;color:#1b1b1b;box-shadow:0 4px 14px rgba(0,0,0,.28)}'
  + '.txo{position:fixed;inset:0;z-index:99996;background:var(--bg,#f3f5f2);display:flex;flex-direction:column;color:var(--ink,#14201b)}'
  + '.txh{display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;font-weight:800;font-size:17px;background:var(--card,#fff)}'
  + '.txh button{width:42px;height:42px;border-radius:50%;border:0;background:var(--vl,#e8eef9);font-size:22px;color:inherit}'
  + '.txmap{flex:1;min-height:0}'
  + '.txs{background:var(--card,#fff);border-radius:22px 22px 0 0;margin-top:-18px;position:relative;z-index:1000;padding:14px 16px calc(env(safe-area-inset-bottom,0px) + 16px);box-shadow:0 -4px 18px rgba(0,0,0,.15)}'
  + '.txchips{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}'
  + '.txchip{display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:14px;border:2px solid var(--line,#e1e7e3);background:var(--card,#fff);font:700 14px/1.2 inherit;text-align:left;color:inherit}'
  + '.txchip.on{border-color:var(--v,#3b6ef5);background:var(--vl,#eef3ff)}'
  + '.txchip small{display:block;font-weight:500;color:var(--mut,#667);font-size:12px}'
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
  + '.txplate{display:inline-block;background:#fff;border:2px solid #222;border-radius:6px;padding:1px 8px;font-weight:800;color:#222;font-size:13px}';
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

  var T = null; // ochiq ekran holati
  function close(){
    if(!T) return;
    clearInterval(T.tm); T.dead = true;
    try { if(T.map) T.map.remove(); } catch(e){}
    if(T.el && T.el.parentNode) T.el.parentNode.removeChild(T.el);
    T = null; syncFab();
  }

  function shell(title){
    var w = document.createElement('div'); w.className = 'txo';
    w.innerHTML = '<div class="txh"><button data-x>←</button><span>' + E(title) + '</span></div><div class="txmap"></div><div class="txs"></div>';
    document.body.appendChild(w);
    w.querySelector('[data-x]').onclick = close;
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
    + '<button class="txchip on" data-chip="to">🏁<div>Qayerga<small data-t="to">Xaritada bosib belgilang</small></div></button></div>'
    + '<div class="txtar"><button class="txt on" data-tar="start"><b>Start</b><small data-f="start">—</small></button><button class="txt" data-tar="komfort"><b>Komfort</b><small data-f="komfort">—</small></button></div>'
    + '<input class="txin" data-note placeholder="Izoh (mo\'ljal, kirish eshigi...) — ixtiyoriy" maxlength="150">'
    + '<div class="txp" data-price>Manzilni xaritada belgilang</div>'
    + '<button class="txb" data-go disabled>🚕 Taksi chaqirish · naqd</button>'
    + '<button class="txb g" data-me>📍 Mening joylashuvim</button>';
    var s = sheet();
    s.querySelectorAll('[data-chip]').forEach(function(b){ b.onclick = function(){ setActive(b.dataset.chip); }; });
    s.querySelectorAll('[data-tar]').forEach(function(b){ b.onclick = function(){ T.tariff = b.dataset.tar; paintTar(); }; });
    s.querySelector('[data-me]').onclick = locate;
    s.querySelector('[data-go]').onclick = submit;
    T.map.on('click', function(e){ setPoint(T.active, e.latlng.lat, e.latlng.lng); });
    locate();
  }
  function paintTar(){
    var s = sheet();
    s.querySelectorAll('[data-tar]').forEach(function(b){ b.classList.toggle('on', b.dataset.tar === T.tariff); });
    var pr = s.querySelector('[data-price]'), go = s.querySelector('[data-go]');
    if(!T.quote) return;
    var f = T.quote.fees[T.tariff];
    if(f == null){ go.disabled = true; return; }
    pr.innerHTML = 'Masofa: <b>' + T.quote.km + ' km</b><br>Narx: <b>' + F(f) + '</b> · naqd';
    go.disabled = false;
  }
  function setActive(k){ T.active = k; sheet().querySelectorAll('[data-chip]').forEach(function(b){ b.classList.toggle('on', b.dataset.chip === k); }); }
  function setPoint(k, lat, lng){
    var p = { lat: lat, lng: lng, address: '' };
    T[k] = p;
    if(T.mk[k]) T.mk[k].setLatLng([lat, lng]); else T.mk[k] = L.marker([lat, lng], { icon: icon(k === 'from' ? '🟢' : '🏁') }).addTo(T.map);
    var el = sheet().querySelector('[data-t="' + k + '"]'); if(el) el.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5) + ' ✓';
    if(k === 'from' && !T.to) setActive('to');
    if(T.from && T.to) calc();
  }
  function locate(){
    if(!navigator.geolocation){ var el = sheet().querySelector('[data-t="from"]'); if(el) el.textContent = 'Xaritada bosib belgilang'; setActive('from'); return; }
    navigator.geolocation.getCurrentPosition(function(p){
      if(!T || T.mode !== 'order') return;
      setPoint('from', p.coords.latitude, p.coords.longitude);
      T.map.setView([p.coords.latitude, p.coords.longitude], 15);
    }, function(){
      if(!T || T.mode !== 'order') return;
      var el = sheet().querySelector('[data-t="from"]'); if(el && !T.from) el.textContent = 'Xaritada bosib belgilang';
      if(!T.from) setActive('from');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
  }
  function calc(){
    var pr = sheet().querySelector('[data-price]'), go = sheet().querySelector('[data-go]');
    var f = { lat: T.from.lat, lng: T.from.lng }, t = { lat: T.to.lat, lng: T.to.lng };
    var my = ++T.q; go.disabled = true;
    tpost('/quote', { from: f, to: t }).then(function(r){
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
    T.mk.to = L.marker([o.to.lat, o.to.lng], { icon: icon('🏁') }).addTo(T.map);
    T.map.fitBounds(L.latLngBounds([[o.from.lat, o.from.lng], [o.to.lat, o.to.lng]]), { padding: [60, 60], maxZoom: 16 });
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
      if(!T.fitted){ T.fitted = true; var pts = [[d.lat, d.lng], [o.from.lat, o.from.lng], [o.to.lat, o.to.lng]]; T.map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16 }); }
    } else if(T.mk.drv && final){ T.map.removeLayer(T.mk.drv); delete T.mk.drv; }
    var sig = o.status + '|' + (d ? d.name : '') + '|' + o.etaMin;
    var s = sheet();
    var st = STTXT[o.status] || '';
    if(o.status === 'bekor' && o.reason) st += ' (' + o.reason + ')';
    var h = '<div class="txst">' + E(st) + '</div>';
    if(o.status === 'yetkazildi') h += '<div class="txeta">Haydovchiga naqd to\'lang: <b>' + F(o.fee) + '</b></div>';
    else if(o.etaMin != null) h += '<div class="txeta">' + E(o.tariffName || '') + ' · taxminan ' + o.etaMin + ' daqiqada' + (o.status === 'yolda' ? ' manzilga yetamiz' : ' yetib keladi') + '</div>';
    else if(o.status === 'yangi') h += '<div class="txeta">' + E(o.tariffName || '') + ' · ' + F(o.fee) + ' · ' + o.km + ' km · naqd</div>';
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
    if(n) n.onclick = function(){ Object.keys(T.mk).forEach(function(k){ T.map.removeLayer(T.mk[k]); }); T.mk = {}; T.sig = ''; orderView(); };
    if(x) x.onclick = close;
  }

  // ---------- Ochish ----------
  function open(){
    if(T) return;
    var w = shell('Taksi');
    T = { el: w, q: 0, tm: null, mk: {}, mode: null };
    sheet().innerHTML = '<div class="txst">Yuklanmoqda…</div>';
    loadLeaflet().then(function(){ if(!T || T.el !== w) return; initMap(NAM, 13); return tget('/my'); }).then(function(r){
      if(!T || !r) return;
      if(r.order){ trackView(r.order); } else orderView();
    }).catch(function(e){ if(T) sheet().innerHTML = '<div class="txst">' + E(e && e.message ? e.message : 'Xarita yuklanmadi, internetni tekshiring') + '</div>'; });
  }

  // ---------- Pastdagi "Taksi" tugmasi ----------
  var fab = null, lastActive = null;
  function canUse(){ try { return typeof S !== 'undefined' && S.user && S.user.role !== 'admin' && S.token; } catch(e){ return false; } }
  function syncFab(){
    var show = canUse() && !T;
    if(show && !fab){
      fab = document.createElement('button'); fab.id = 'taxiFab'; fab.textContent = '🚕 Taksi'; fab.onclick = open; document.body.appendChild(fab);
    } else if(!show && fab){ fab.parentNode.removeChild(fab); fab = null; }
    if(fab) fab.textContent = lastActive ? '🚕 ' + (FABTXT[lastActive] || 'Taksi') : '🚕 Taksi';
  }
  setInterval(syncFab, 1000);
  setInterval(function(){
    if(!canUse() || T || document.hidden) return;
    tget('/my').then(function(r){ lastActive = r.order ? r.order.status : null; syncFab(); }).catch(function(){});
  }, 8000);
  syncFab();
})();
