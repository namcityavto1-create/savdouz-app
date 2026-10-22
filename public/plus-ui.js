// SavdoUz plus-ui.js — sotuvchi uchun "Pulni yechish", admin uchun "So'rovlar va jurnal" oynasi.
// index.html oxiriga (</body> dan oldin) ulanadi:  <script src="/plus-ui.js?v=1"></script>
(function () {
  var tok = null, role = null, perms = [], busy = false;

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
  }
  function fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm"; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dt(iso) { var d = new Date(iso); return isNaN(d) ? '' : pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }

  var STATUS = { 'kutilmoqda': ['Kutilmoqda', '#FF6B35'], 'tasdiqlandi': ["O'tkazildi", '#1E7E34'], 'rad etildi': ['Rad etildi', '#F23557'] };

  // ---- Suzuvchi tugma ----
  var fab = el('button', 'position:fixed;right:14px;bottom:164px;width:48px;height:48px;border-radius:50%;border:none;background:var(--v,#6C4BF4);color:#fff;font-size:22px;box-shadow:0 8px 20px -6px rgba(108,75,244,.6);z-index:50;display:none;', '💸');
  var badge = el('span', 'position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:#F23557;color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center;display:none;padding:0 4px;box-sizing:border-box;', '');
  fab.appendChild(badge);
  document.body.appendChild(fab);

  // ---- Oyna ----
  var overlay = el('div', 'position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(21,15,46,.55);z-index:70;display:none;align-items:center;justify-content:center;padding:16px;');
  var box = el('div', 'background:var(--card,#fff);color:var(--ink,#150F2E);border-radius:22px;padding:18px;width:100%;max-width:400px;max-height:88vh;overflow:auto;font-family:-apple-system,Segoe UI,sans-serif;');
  overlay.appendChild(box); document.body.appendChild(overlay);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.style.display = 'none'; });

  var inputCss = 'width:100%;padding:12px 14px;border-radius:14px;border:1.5px solid var(--line,#ECE9F5);background:transparent;color:inherit;font-size:14px;margin-bottom:10px;box-sizing:border-box;';
  function btn(text, bg, fg) { return el('button', 'border:none;border-radius:14px;padding:12px;background:' + bg + ';color:' + fg + ';font-weight:800;font-size:13.5px;', text); }
  function closeBtn() { var b = btn('Yopish', 'var(--vl,#F1EDFE)', 'var(--vt,#4E2FD9)'); b.style.width = '100%'; b.style.marginTop = '12px'; b.onclick = function () { overlay.style.display = 'none'; }; return b; }
  function msgEl() { return el('div', 'font-size:12.5px;font-weight:700;min-height:16px;margin:4px 0 8px;'); }
  function say(m, text, good) { m.textContent = text; m.style.color = good ? '#1E7E34' : '#F23557'; }
  function title(t) { return el('div', 'font-size:17px;font-weight:800;margin-bottom:12px;', t); }
  function muted(t) { return el('div', 'font-size:12.5px;color:var(--mut,#8A8497);margin-bottom:8px;', t); }
  function pill(status) { var s = STATUS[status] || [status, '#8A8497']; return el('span', 'font-size:11px;font-weight:800;color:' + s[1] + ';', s[0]); }

  // ================= SOTUVCHI =================
  function openSeller() {
    box.innerHTML = ''; overlay.style.display = 'flex';
    box.appendChild(title('Pulni yechish'));
    var info = muted('Yuklanmoqda…'); box.appendChild(info);
    var amt = el('input', inputCss); amt.setAttribute('inputmode', 'numeric'); amt.placeholder = "Summa (so'm), eng kami 10 000";
    var m = msgEl(), send = btn("So'rov yuborish", 'var(--v,#6C4BF4)', '#fff'); send.style.width = '100%';
    var list = el('div', 'margin-top:14px;');
    box.appendChild(amt); box.appendChild(m); box.appendChild(send); box.appendChild(list); box.appendChild(closeBtn());

    function load() {
      api('GET', '/api/account').then(function (r) {
        if (!r.ok) return;
        info.textContent = 'Balans: ' + fmt(r.data.balance) + '  •  Karta: ' + (r.data.card ? r.data.card.number : "kiritilmagan (profilda kiriting)");
      });
      api('GET', '/api/withdrawals/mine').then(function (r) {
        list.innerHTML = '';
        if (!r.ok || !r.data.withdrawals.length) return;
        list.appendChild(el('div', 'font-size:13px;font-weight:800;margin-bottom:6px;', "So'rovlarim"));
        r.data.withdrawals.forEach(function (w) {
          var row = el('div', 'display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--line,#ECE9F5);font-size:13px;');
          var l = el('div', ''); l.appendChild(el('div', 'font-weight:700;', '#' + w.id + ' • ' + fmt(w.amount))); l.appendChild(el('div', 'font-size:11.5px;color:var(--mut,#8A8497);', dt(w.createdAt) + (w.adminNote ? ' • ' + w.adminNote : '')));
          row.appendChild(l); row.appendChild(pill(w.status)); list.appendChild(row);
        });
      });
    }
    send.onclick = function () {
      var a = parseInt(String(amt.value).replace(/\D/g, ''), 10);
      if (!a) return say(m, "Summani kiriting", false);
      if (!window.confirm(fmt(a) + " yechib olish so'rovi yuborilsinmi?")) return;
      send.disabled = true;
      api('POST', '/api/withdrawals', { amount: a }).then(function (r) {
        send.disabled = false;
        if (!r.ok) return say(m, r.data.error || 'Xato', false);
        amt.value = ''; say(m, "So'rov yuborildi. Admin tasdiqlagach pul kartangizga o'tkaziladi", true); load();
      }).catch(function () { send.disabled = false; say(m, 'Tarmoq xatosi', false); });
    };
    load();
  }

  // ================= ADMIN =================
  function openAdmin() {
    box.innerHTML = ''; overlay.style.display = 'flex';
    var canBal = perms.indexOf('balance') !== -1, canAudit = perms.indexOf('admins') !== -1;
    box.appendChild(title(canBal ? "Pul yechish so'rovlari" : 'Admin jurnali'));
    var tabs = el('div', 'display:flex;gap:8px;margin-bottom:12px;'), body = el('div', '');
    var t1 = btn("So'rovlar", 'var(--v,#6C4BF4)', '#fff'), t2 = btn('Jurnal', 'var(--vl,#F1EDFE)', 'var(--vt,#4E2FD9)');
    t1.style.flex = t2.style.flex = '1';
    if (canBal) tabs.appendChild(t1); if (canAudit) tabs.appendChild(t2);
    if (canBal && canAudit) box.appendChild(tabs);
    box.appendChild(body); box.appendChild(closeBtn());
    function pick(which) {
      t1.style.background = which === 'wd' ? 'var(--v,#6C4BF4)' : 'var(--vl,#F1EDFE)'; t1.style.color = which === 'wd' ? '#fff' : 'var(--vt,#4E2FD9)';
      t2.style.background = which === 'log' ? 'var(--v,#6C4BF4)' : 'var(--vl,#F1EDFE)'; t2.style.color = which === 'log' ? '#fff' : 'var(--vt,#4E2FD9)';
      if (which === 'wd') loadWd(); else loadLog();
    }
    t1.onclick = function () { pick('wd'); }; t2.onclick = function () { pick('log'); };

    function loadWd() {
      body.innerHTML = ''; body.appendChild(muted('Yuklanmoqda…'));
      api('GET', '/api/admin/withdrawals').then(function (r) {
        body.innerHTML = '';
        if (!r.ok) return body.appendChild(muted(r.data.error || 'Xato'));
        refreshBadge(r.data.pending);
        if (!r.data.withdrawals.length) return body.appendChild(muted("So'rovlar yo'q"));
        r.data.withdrawals.forEach(function (w) {
          var c = el('div', 'border:1.5px solid var(--line,#ECE9F5);border-radius:16px;padding:12px;margin-bottom:10px;');
          var top = el('div', 'display:flex;justify-content:space-between;gap:8px;');
          top.appendChild(el('div', 'font-weight:800;', '#' + w.id + ' ' + w.sellerName)); top.appendChild(pill(w.status)); c.appendChild(top);
          c.appendChild(el('div', 'font-size:18px;font-weight:800;margin:4px 0;', fmt(w.amount)));
          c.appendChild(el('div', 'font-size:12.5px;', 'Karta: ' + w.card.number + ' (' + w.card.holder + ')'));
          c.appendChild(el('div', 'font-size:12px;color:var(--mut,#8A8497);', 'Tel: ' + w.sellerPhone + '  •  Balans: ' + fmt(w.sellerBalance) + '  •  ' + dt(w.createdAt)));
          if (w.adminNote) c.appendChild(el('div', 'font-size:12px;color:var(--mut,#8A8497);', 'Izoh: ' + w.adminNote));
          if (w.status === 'kutilmoqda') {
            var row = el('div', 'display:flex;gap:8px;margin-top:10px;');
            var ok = btn("✅ O'tkazdim", '#1E7E34', '#fff'), no = btn('❌ Rad etish', '#F23557', '#fff'); ok.style.flex = no.style.flex = '1';
            ok.onclick = function () {
              if (!window.confirm(w.sellerName + ' kartasiga ' + fmt(w.amount) + " o'tkazdingizmi? Balansdan shu summa yechiladi.")) return;
              act(w.id, 'tasdiqlandi', '');
            };
            no.onclick = function () { var n = window.prompt('Rad etish sababi (ixtiyoriy):', ''); if (n === null) return; act(w.id, 'rad etildi', n); };
            row.appendChild(ok); row.appendChild(no); c.appendChild(row);
          }
          body.appendChild(c);
        });
      });
    }
    function act(id, status, note) {
      api('PATCH', '/api/admin/withdrawals/' + id, { status: status, note: note }).then(function (r) {
        if (!r.ok) window.alert(r.data.error || 'Xato');
        loadWd();
      }).catch(function () { window.alert('Tarmoq xatosi'); });
    }
    function loadLog() {
      body.innerHTML = ''; body.appendChild(muted('Yuklanmoqda…'));
      api('GET', '/api/admin/audit').then(function (r) {
        body.innerHTML = '';
        if (!r.ok) return body.appendChild(muted(r.data.error || 'Xato'));
        if (!r.data.log.length) return body.appendChild(muted("Hozircha yozuv yo'q"));
        r.data.log.forEach(function (x) {
          var row = el('div', 'padding:8px 0;border-top:1px solid var(--line,#ECE9F5);font-size:13px;');
          row.appendChild(el('div', 'font-weight:700;', x.text));
          row.appendChild(el('div', 'font-size:11.5px;color:var(--mut,#8A8497);', x.adminName + ' • ' + dt(x.at)));
          body.appendChild(row);
        });
      });
    }
    pick(canBal ? 'wd' : 'log');
  }

  function refreshBadge(n) { badge.textContent = n > 9 ? '9+' : String(n || ''); badge.style.display = n > 0 ? 'block' : 'none'; }
  fab.onclick = function () { if (role === 'seller') openSeller(); else if (role === 'admin') openAdmin(); };

  function syncRole() {
    if (document.querySelector('.authwrap')) { fab.style.display = 'none'; overlay.style.display = 'none'; return; }
    var t = null; try { t = localStorage.getItem('savdouz_token'); } catch (e) {}
    if (!t) { tok = null; role = null; fab.style.display = 'none'; return; }
    if (t !== tok) {
      tok = t; role = null; fab.style.display = 'none';
      if (busy) return; busy = true;
      api('GET', '/api/me').then(function (r) {
        busy = false; if (!r.ok) return;
        role = r.data.user.role; perms = r.data.user.perms || [];
        var show = role === 'seller' || (role === 'admin' && (perms.indexOf('balance') !== -1 || perms.indexOf('admins') !== -1));
        fab.style.display = show ? 'block' : 'none';
        fab.firstChild.nodeValue = role === 'admin' ? '📋' : '💸';
      }).catch(function () { busy = false; });
    }
  }
  setInterval(syncRole, 1500);
  // Admin uchun: kutilayotgan so'rovlar sonini belgi sifatida ko'rsatadi
  setInterval(function () {
    if (role !== 'admin' || !tok || perms.indexOf('balance') === -1 || overlay.style.display === 'flex') return;
    api('GET', '/api/admin/withdrawals').then(function (r) { if (r.ok) refreshBadge(r.data.pending); }).catch(function () {});
  }, 30000);
})();
