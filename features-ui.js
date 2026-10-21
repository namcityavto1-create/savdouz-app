(function () {
  if (window.__svf) return; window.__svf = 1;
  var $q = function (s, r) { return (r || document).querySelector(s); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var F = function (n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm"; };
  var tok = function () { try { return S.token; } catch (e) { return null; } };
  var usr = function () { try { return S.user; } catch (e) { return null; } };
  var T = function (m) { try { toast(m); } catch (e) { alert(m); } };
  function call(method, path, body, auth) {
    var h = { 'Content-Type': 'application/json' }; if (auth !== false && tok()) h.Authorization = 'Bearer ' + tok();
    return fetch(path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Xato'); return d; }); });
  }
  var CSS = 'width:100%;padding:12px 14px;border-radius:14px;border:1.5px solid #ECE9F5;font-size:14px;margin-bottom:10px;box-sizing:border-box;background:#fff;color:#150F2E;';
  var BTN = 'border:none;border-radius:14px;padding:12px;background:#4E2FD9;color:#fff;font-weight:800;font-size:14px;width:100%;';
  function modal(html) {
    var o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(21,15,46,.55);display:flex;align-items:center;justify-content:center;padding:14px;';
    o.innerHTML = '<div style="background:#fff;color:#150F2E;border-radius:22px;padding:18px;width:100%;max-width:420px;max-height:90vh;overflow:auto;font-family:-apple-system,Segoe UI,sans-serif;">' + html + '<button data-x style="' + BTN + 'background:#F1EDFE;color:#4E2FD9;margin-top:8px">Yopish</button></div>';
    o.querySelector('[data-x]').onclick = function () { o.remove(); };
    document.body.appendChild(o); return o;
  }

  /* ---------- 1) Parolni unutdim ---------- */
  function forgot() {
    var o = modal('<div style="font-size:17px;font-weight:800;margin-bottom:6px">Parolni tiklash</div>' +
      '<div id="f1"><div style="font-size:12.5px;opacity:.7;margin-bottom:10px">Telefon raqamingizni kiriting. Admin sizga 6 xonali kod beradi (Telegram: @Savol_24bot).</div>' +
      '<input id="fp" placeholder="+998901234567" inputmode="tel" style="' + CSS + '"><button id="fb1" style="' + BTN + '">So\'rov yuborish</button></div>' +
      '<div id="f2" style="display:none"><div style="font-size:12.5px;opacity:.7;margin-bottom:10px">So\'rov yuborildi. Admin bergan kodni va yangi parolni kiriting.</div>' +
      '<input id="fc" placeholder="6 xonali kod" inputmode="numeric" style="' + CSS + '"><input id="fn" type="password" placeholder="Yangi parol (kamida 6 ta belgi)" style="' + CSS + '"><button id="fb2" style="' + BTN + '">Parolni almashtirish</button></div>' +
      '<div id="fm" style="font-size:12.5px;font-weight:700;margin:8px 0;min-height:16px"></div>');
    var say = function (t, ok) { var m = o.querySelector('#fm'); m.textContent = t; m.style.color = ok ? '#1E7E34' : '#F23557'; };
    o.querySelector('#fb1').onclick = function () {
      call('POST', '/api/reset/request', { phone: o.querySelector('#fp').value }, false).then(function () { o.querySelector('#f1').style.display = 'none'; o.querySelector('#f2').style.display = 'block'; say('', true); }).catch(function (e) { say(e.message); });
    };
    o.querySelector('#fb2').onclick = function () {
      call('POST', '/api/reset/confirm', { phone: o.querySelector('#fp').value, code: o.querySelector('#fc').value, password: o.querySelector('#fn').value }, false)
        .then(function () { say("Parol almashdi ✅ Endi yangi parol bilan kiring", true); }).catch(function (e) { say(e.message); });
    };
  }
  function authLink() {
    var b = $q('#submitBtn'); if (!b || $q('#svfg')) return;
    if (!/Kirish/.test(b.textContent)) return;
    var a = document.createElement('div'); a.id = 'svfg';
    a.style.cssText = 'text-align:center;margin-top:12px;font-size:13px;font-weight:800;color:#4E2FD9;cursor:pointer;';
    a.textContent = 'Parolni unutdingizmi?'; a.onclick = forgot; b.insertAdjacentElement('afterend', a);
  }

  /* ---------- 2) Promokod (savatda) ---------- */
  window._svPromo = null;
  function cartPromo() {
    var btn = $q('#checkoutBtn'); if (!btn || $q('#svpr')) return;
    var w = document.createElement('div'); w.id = 'svpr'; w.style.cssText = 'margin:10px 0';
    w.innerHTML = '<div style="display:flex;gap:8px"><input id="svpc" placeholder="🎟 Promokod" autocapitalize="characters" style="flex:1;min-width:0;padding:11px 13px;border-radius:14px;border:1.5px solid #ECE9F5;font-size:14px;text-transform:uppercase">' +
      '<button id="svpa" style="border:none;border-radius:14px;padding:0 16px;background:#4E2FD9;color:#fff;font-weight:800;font-size:13px">Qo\'llash</button></div><div id="svpm" style="font-size:12.5px;font-weight:700;margin-top:6px"></div>';
    btn.insertAdjacentElement('beforebegin', w);
    var inp = w.querySelector('#svpc'), msg = w.querySelector('#svpm');
    var items = function () { var r = []; try { Object.keys(S.cart).forEach(function (id) { if (S.cart[id] > 0) r.push({ productId: Number(id), qty: S.cart[id] }); }); } catch (e) {} return r; };
    var run = function (silent) {
      var code = inp.value.trim(); if (!code) { window._svPromo = null; msg.textContent = ''; return; }
      call('POST', '/api/promo/check', { code: code, items: items() }).then(function (d) {
        window._svPromo = d.code; msg.style.color = '#1E7E34'; msg.textContent = '✅ ' + d.code + ': −' + F(d.discount) + ' chegirma (to\'lovda hisoblanadi)';
      }).catch(function (e) { window._svPromo = null; msg.style.color = '#F23557'; if (!silent) msg.textContent = e.message; else msg.textContent = ''; });
    };
    w.querySelector('#svpa').onclick = function () { run(false); };
    if (window._svPromoTxt) { inp.value = window._svPromoTxt; run(true); }
    inp.oninput = function () { window._svPromoTxt = inp.value; window._svPromo = null; msg.textContent = ''; };
  }
  var of = window.fetch;
  window.fetch = function (input, init) {
    try {
      if (init && init.method === 'POST' && String(input) === '/api/orders' && window._svPromo && init.body) {
        var b = JSON.parse(init.body); b.promo = window._svPromo; init = Object.assign({}, init, { body: JSON.stringify(b) });
        window._svPromo = null; window._svPromoTxt = '';
      }
    } catch (e) {}
    return of.call(this, input, init);
  };

  /* ---------- 3) Buyurtma tarixi (xaridor "Buyurtmalarim") ---------- */
  var oc = { t: 0, map: null }, LBL = { 'yangi': 'Buyurtma qabul qilindi', 'tasdiqlandi': 'Sotuvchi tasdiqladi', 'kuryerga topshirildi': 'Kuryerga topshirildi', 'yetkazildi': 'Yetkazildi', 'bekor qilindi': 'Bekor qilindi' };
  function history() {
    var items = document.querySelectorAll('.oitem:not([data-svh])'); if (!items.length || !tok() || !usr() || usr().role !== 'buyer') return;
    var go = function () {
      items.forEach(function (it) {
        var mm = (it.querySelector('.top') || {}).textContent; mm = mm && mm.match(/№(\d+)/); if (!mm) return;
        var o = oc.map[mm[1]]; if (!o) return; it.setAttribute('data-svh', '1');
        var h = [{ status: 'yangi', at: o.createdAt }].concat(o.history || []), ex = '';
        if (o.discount) ex = '<div style="font-size:12px;color:#1E7E34;font-weight:700;margin-top:6px">🎟 Promokod ' + E(o.promoCode) + ': −' + F(o.discount) + '</div>';
        var html = '<details style="margin:8px 0 0;font-size:12px"><summary style="font-weight:800;color:#4E2FD9;cursor:pointer">📍 Buyurtma kuzatuvi</summary>' +
          h.map(function (x) { var d = new Date(x.at); return '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px dashed #ECE9F5"><span>' + E(LBL[x.status] || x.status) + '</span><span style="opacity:.6">' + d.toLocaleDateString('uz') + ' ' + d.toTimeString().slice(0, 5) + '</span></div>'; }).join('') + '</details>' + ex;
        var st = it.querySelector('.stp'); (st || it.querySelector('.top')).insertAdjacentHTML('afterend', html);
      });
    };
    if (oc.map && Date.now() - oc.t < 8000) return go();
    call('GET', '/api/orders/mine').then(function (d) { oc.map = {}; (d.orders || []).forEach(function (o) { oc.map[o.id] = o; }); oc.t = Date.now(); go(); }).catch(function () {});
  }

  /* ---------- 4) Admin: statistika, promokodlar, parol so'rovlari ---------- */
  var fab = document.createElement('button');
  fab.textContent = '📊'; fab.style.cssText = 'position:fixed;right:14px;bottom:162px;width:52px;height:52px;border-radius:50%;border:none;background:#4E2FD9;color:#fff;font-size:24px;box-shadow:0 8px 20px -6px rgba(78,47,217,.6);z-index:50;display:none;';
  document.body.appendChild(fab);
  function bars(a) {
    var mx = Math.max.apply(null, a.map(function (x) { return x.sales; }).concat([1]));
    return '<div style="display:flex;align-items:flex-end;gap:3px;height:90px;margin:8px 0 2px">' + a.map(function (x) { return '<div title="' + E(x.d) + ': ' + F(x.sales) + '" style="flex:1;background:#4E2FD9;border-radius:4px 4px 0 0;min-height:2px;height:' + Math.max(2, Math.round(x.sales / mx * 90)) + 'px"></div>'; }).join('') + '</div>' +
      '<div style="display:flex;gap:3px;font-size:8.5px;opacity:.6">' + a.map(function (x) { return '<div style="flex:1;text-align:center;overflow:hidden">' + E(x.d.slice(-2)) + '</div>'; }).join('') + '</div>';
  }
  function tabStats(box) {
    box.innerHTML = 'Yuklanmoqda...';
    call('GET', '/api/admin/stats').then(function (s) {
      var card = function (t, v) { return '<div style="flex:1;min-width:46%;background:#F1EDFE;border-radius:14px;padding:10px"><div style="font-size:11px;opacity:.7">' + t + '</div><div style="font-weight:800;font-size:14px">' + F(v.sales) + '</div><div style="font-size:11px;opacity:.7">' + v.orders + ' ta buyurtma</div></div>'; };
      var list = function (a, f) { return a.length ? a.map(function (x, i) { return '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:13px;border-bottom:1px dashed #ECE9F5"><span>' + (i + 1) + '. ' + E(x.name) + '</span><span style="font-weight:700">' + f(x) + '</span></div>'; }).join('') : '<div style="font-size:12px;opacity:.6">Ma\'lumot yo\'q</div>'; };
      box.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px">' + card('Bugun', s.today) + card('7 kun', s.week) + card('30 kun', s.month) + card('Jami', s.total) + '</div>' +
        '<div style="font-weight:800;margin:14px 0 0;font-size:14px">Kunlik savdo (14 kun)</div>' + bars(s.byDay) +
        '<div style="font-weight:800;margin:14px 0 0;font-size:14px">Oylik savdo (6 oy)</div>' + bars(s.byMonth) +
        '<div style="font-weight:800;margin:14px 0 4px;font-size:14px">🔥 Eng ko\'p sotilgan</div>' + list(s.topProducts, function (x) { return x.qty + ' dona · ' + F(x.sales); }) +
        '<div style="font-weight:800;margin:14px 0 4px;font-size:14px">🏆 Faol sotuvchilar</div>' + list(s.topSellers, function (x) { return x.orders + ' ta · ' + F(x.sales); }) +
        '<div style="font-size:12px;opacity:.7;margin-top:12px">Xaridorlar: ' + s.users.buyers + ' · Sotuvchilar: ' + s.users.sellers + '</div>';
    }).catch(function (e) { box.textContent = e.message; });
  }
  function tabPromo(box) {
    var load = function () {
      call('GET', '/api/admin/promos').then(function (d) {
        box.innerHTML = '<div style="font-weight:800;font-size:14px;margin-bottom:8px">Yangi promokod</div>' +
          '<input id="pk" placeholder="Kod (masalan YANGI10)" style="' + CSS + 'text-transform:uppercase">' +
          '<div style="display:flex;gap:8px"><select id="pt" style="' + CSS + '"><option value="percent">Foiz (%)</option><option value="sum">Summa (so\'m)</option></select><input id="pv" placeholder="Qiymat" inputmode="numeric" style="' + CSS + '"></div>' +
          '<div style="display:flex;gap:8px"><input id="pm" placeholder="Min. summa" inputmode="numeric" style="' + CSS + '"><input id="pu" placeholder="Limit (0=cheksiz)" inputmode="numeric" style="' + CSS + '"></div>' +
          '<div style="display:flex;gap:8px;align-items:center"><input id="pd" placeholder="Necha kun (bo\'sh=cheksiz)" inputmode="numeric" style="' + CSS + '"><label style="font-size:12.5px;white-space:nowrap;margin-bottom:10px"><input id="pf" type="checkbox"> 1-buyurtma</label></div>' +
          '<button id="pa" style="' + BTN + '">Qo\'shish</button><div id="pmsg" style="font-size:12.5px;font-weight:700;margin:6px 0;color:#F23557"></div>' +
          '<div style="font-weight:800;font-size:14px;margin:12px 0 6px">Promokodlar</div>' +
          (d.promos.length ? d.promos.map(function (p) {
            return '<div style="padding:8px 0;border-bottom:1px dashed #ECE9F5;font-size:13px"><b>' + E(p.code) + '</b> — ' + (p.type === 'percent' ? p.value + '%' : F(p.value)) + (p.minTotal ? ' · min ' + F(p.minTotal) : '') + (p.firstOnly ? ' · 1-buyurtma' : '') +
              '<div style="font-size:11.5px;opacity:.7">Ishlatilgan: ' + p.usedCount + (p.maxUses ? '/' + p.maxUses : '') + (p.expiresAt ? ' · ' + new Date(p.expiresAt).toLocaleDateString('uz') + 'gacha' : '') + (p.active ? '' : ' · O\'chirilgan') + '</div>' +
              '<div style="display:flex;gap:6px;margin-top:6px"><button data-tg="' + E(p.code) + '" data-on="' + (p.active ? 0 : 1) + '" style="flex:1;border:none;border-radius:10px;padding:8px;background:#F1EDFE;color:#4E2FD9;font-weight:700;font-size:12px">' + (p.active ? "O'chirish" : 'Yoqish') + '</button><button data-dl="' + E(p.code) + '" style="flex:1;border:none;border-radius:10px;padding:8px;background:#FDE7EB;color:#F23557;font-weight:700;font-size:12px">O\'chirib tashlash</button></div></div>';
          }).join('') : '<div style="font-size:12px;opacity:.6">Hali yo\'q</div>');
        var v = function (id) { return box.querySelector(id).value; };
        box.querySelector('#pa').onclick = function () {
          call('POST', '/api/admin/promos', { code: v('#pk'), type: v('#pt'), value: v('#pv'), minTotal: v('#pm'), maxUses: v('#pu'), days: v('#pd'), firstOnly: box.querySelector('#pf').checked }).then(load).catch(function (e) { box.querySelector('#pmsg').textContent = e.message; });
        };
        box.querySelectorAll('[data-tg]').forEach(function (b) { b.onclick = function () { call('PATCH', '/api/admin/promos/' + b.dataset.tg, { active: b.dataset.on === '1' }).then(load); }; });
        box.querySelectorAll('[data-dl]').forEach(function (b) { b.onclick = function () { if (confirm(b.dataset.dl + ' o\'chirilsinmi?')) call('DELETE', '/api/admin/promos/' + b.dataset.dl).then(load); }; });
      }).catch(function (e) { box.textContent = e.message; });
    };
    load();
  }
  function tabReset(box) {
    var load = function () {
      call('GET', '/api/admin/resets').then(function (d) {
        box.innerHTML = '<div style="font-size:12px;opacity:.7;margin-bottom:8px">Foydalanuvchi bilan bog\'laning, shaxsini tasdiqlang va kodni unga ayting. Kod 30 daqiqa amal qiladi.</div>' +
          (d.resets.length ? d.resets.map(function (r) {
            return '<div style="padding:9px 0;border-bottom:1px dashed #ECE9F5;font-size:13px"><b>' + E(r.name) + '</b> (' + (r.role === 'seller' ? 'sotuvchi' : 'xaridor') + ')<div style="font-size:12px;opacity:.7">' + E(r.phone) + ' · ' + new Date(r.createdAt).toLocaleString('uz') + '</div>' +
              '<div style="display:flex;gap:6px;margin-top:6px"><button data-cd="' + r.id + '" style="flex:2;border:none;border-radius:10px;padding:9px;background:#4E2FD9;color:#fff;font-weight:700;font-size:12px">' + (r.status === 'kod berildi' ? 'Yangi kod yaratish' : 'Kod yaratish') + '</button><button data-rm="' + r.id + '" style="flex:1;border:none;border-radius:10px;padding:9px;background:#FDE7EB;color:#F23557;font-weight:700;font-size:12px">Rad</button></div><div data-o="' + r.id + '" style="font-size:20px;font-weight:800;letter-spacing:3px;margin-top:6px"></div></div>';
          }).join('') : '<div style="font-size:13px;opacity:.6;padding:14px 0">So\'rovlar yo\'q</div>');
        box.querySelectorAll('[data-cd]').forEach(function (b) { b.onclick = function () { call('POST', '/api/admin/resets/' + b.dataset.cd + '/code').then(function (x) { box.querySelector('[data-o="' + b.dataset.cd + '"]').textContent = 'Kod: ' + x.code; }).catch(function (e) { T(e.message); }); }; });
        box.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { call('DELETE', '/api/admin/resets/' + b.dataset.rm).then(load); }; });
      }).catch(function (e) { box.textContent = e.message; });
    };
    load();
  }
  fab.onclick = function () {
    var tabs = [['Statistika', tabStats], ['Promokod', tabPromo], ['Parol', tabReset]];
    var o = modal('<div style="display:flex;gap:6px;margin-bottom:12px">' + tabs.map(function (t, i) { return '<button data-t="' + i + '" style="flex:1;border:none;border-radius:12px;padding:10px 4px;font-weight:800;font-size:13px;background:#F1EDFE;color:#4E2FD9">' + t[0] + '</button>'; }).join('') + '</div><div id="svbody"></div>');
    var sel = function (i) { o.querySelectorAll('[data-t]').forEach(function (b) { var on = b.dataset.t == i; b.style.background = on ? '#4E2FD9' : '#F1EDFE'; b.style.color = on ? '#fff' : '#4E2FD9'; }); tabs[i][1](o.querySelector('#svbody')); };
    o.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { sel(b.dataset.t); }; });
    sel(0);
  };

  /* ---------- 5) Profilda parol almashtirish ---------- */
  function profilePw() {
    var u = usr(); if (!u || !tok() || $q('#svcp')) return;
    var anchor = $q('#subBack') ? null : null; // faqat Sozlamalar sahifasida
    var st = Array.prototype.find.call(document.querySelectorAll('.sectitle'), function (x) { return /Sozlamalar/i.test(x.textContent); });
    if (!st) return;
    var b = document.createElement('button'); b.id = 'svcp'; b.textContent = '🔑 Parolni almashtirish';
    b.style.cssText = 'display:block;width:100%;margin:12px 0;border:none;border-radius:14px;padding:13px;background:#F1EDFE;color:#4E2FD9;font-weight:800;font-size:14px;';
    st.parentNode.appendChild(b);
    b.onclick = function () {
      var o = modal('<div style="font-size:17px;font-weight:800;margin-bottom:10px">Parolni almashtirish</div><input id="op" type="password" placeholder="Eski parol" style="' + CSS + '"><input id="np" type="password" placeholder="Yangi parol (kamida 6 ta belgi)" style="' + CSS + '"><button id="sp" style="' + BTN + '">Saqlash</button><div id="pm2" style="font-size:12.5px;font-weight:700;margin:8px 0;min-height:16px"></div>');
      o.querySelector('#sp').onclick = function () {
        call('POST', '/api/me/password', { oldPassword: o.querySelector('#op').value, newPassword: o.querySelector('#np').value }).then(function () { var m = o.querySelector('#pm2'); m.style.color = '#1E7E34'; m.textContent = 'Parol almashdi ✅'; }).catch(function (e) { var m = o.querySelector('#pm2'); m.style.color = '#F23557'; m.textContent = e.message; });
      };
    };
  }

  var tm = null;
  function scan() {
    tm = null;
    try {
      authLink(); cartPromo(); history(); profilePw();
      var u = usr(), adm = u && tok() && u.role === 'admin' && !$q('.authwrap');
      var ok = adm && (typeof can !== 'function' || can('orders') || can('sellers') || can('buyers'));
      fab.style.display = ok ? 'block' : 'none';
    } catch (e) {}
  }
  new MutationObserver(function () { if (!tm) tm = setTimeout(scan, 250); }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
