/* SavdoUz — docs.js
   1) Ro'yxatdan o'tishda "Familiya" maydoni (xaridor va sotuvchi)
   2) Admin: sotuvchi kartasida pasport/ID va selfi rasmlari yonma-yon ko'rinadi, bosilsa kattalashadi
   3) Admin: "Yuzlarni solishtirish" tugmasi — yuz tahlili admin telefonining o'zida bajariladi,
      rasmlar uchinchi tomon serveriga yuborilmaydi. Natija faqat yordamchi, qarorni admin qabul qiladi. */
(function () {
  'use strict';

  // ---------- 1) Familiya ----------
  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var u = typeof input === 'string' ? input : (input && input.url) || '';
      if (/\/api\/register(\?|$)/.test(u) && init && typeof init.body === 'string') {
        var el = document.getElementById('fsurname');
        var sn = el ? el.value.trim() : '';
        if (!sn) {
          return Promise.resolve(new Response(JSON.stringify({ error: 'Familiyangizni kiriting' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }));
        }
        var b = JSON.parse(init.body);
        b.surname = sn;
        b.name = String(b.name || '').trim() + ' ' + sn;
        init = Object.assign({}, init, { body: JSON.stringify(b) });
        return _fetch.call(this, input, init);
      }
    } catch (e) {}
    return _fetch.apply(this, arguments);
  };

  function addSurname() {
    var n = document.getElementById('fname');
    if (!n || document.getElementById('fsurname')) return;
    var box = n.closest('.field');
    if (!box || !box.parentNode) return;
    var d = document.createElement('div');
    d.className = 'field';
    d.innerHTML = '<label>Familiya</label><input id="fsurname" placeholder="Familiyangiz">';
    box.parentNode.insertBefore(d, box.nextSibling);
  }

  // ---------- 2) Admin: hujjat rasmlari kartaning ichida ----------
  function fig(url, label) {
    return '<div style="flex:1;text-align:center"><img src="' + url + '" data-full="' + url +
      '" style="width:100%;height:150px;object-fit:cover;border-radius:12px;background:#F1EDFE;cursor:zoom-in">' +
      '<div style="font-size:11px;color:#8A8497;margin-top:3px">' + label + '</div></div>';
  }
  function enhanceDocs() {
    var links = document.querySelectorAll('a[href*="/doc/id?"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var row = a.closest('.oline');
      if (!row || !row.parentNode) continue;
      var m = (a.getAttribute('href') || '').match(/\/api\/admin\/sellers\/(\d+)\/doc\/id\?t=(.*)$/);
      if (!m) continue;
      var base = '/api/admin/sellers/' + m[1] + '/doc/', t = '?t=' + m[2];
      var box = document.createElement('div');
      box.setAttribute('data-svdocs', '1');
      box.style.cssText = 'margin:8px 0';
      box.innerHTML =
        '<div style="font-size:12.5px;margin-bottom:6px">Hujjatlar</div>' +
        '<div style="display:flex;gap:8px">' + fig(base + 'id' + t, 'Pasport / ID') + fig(base + 'selfie' + t, 'Selfi') + '</div>' +
        '<button class="addbtn" data-cmp="1" style="margin-top:8px;background:#4E2FD9">🔍 Yuzlarni solishtirish</button>' +
        '<div data-res="1" style="margin-top:8px;font-size:12px"></div>';
      row.parentNode.replaceChild(box, row);
    }
  }

  function zoom(src) {
    var o = document.createElement('div');
    o.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(0,0,0,.92);z-index:100;display:flex;align-items:center;justify-content:center;padding:10px';
    var i = document.createElement('img');
    i.src = src; i.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
    o.appendChild(i);
    o.onclick = function () { o.parentNode && o.parentNode.removeChild(o); };
    document.body.appendChild(o);
  }

  // ---------- 3) Yuzni solishtirish (face-api, brauzerda) ----------
  var BASES = [
    'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13',
    'https://cdn.jsdelivr.net/npm/@vladmandic/face-api',
    'https://unpkg.com/@vladmandic/face-api@1.7.13'
  ];
  var ready = null;
  function loadScript(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { no(new Error('script')); };
      document.head.appendChild(s);
    });
  }
  function loadFace(say) {
    if (ready) return ready;
    ready = (async function () {
      for (var i = 0; i < BASES.length; i++) {
        try {
          if (!window.faceapi) await loadScript(BASES[i] + '/dist/face-api.js');
          if (!window.faceapi) continue;
          say('Modellar yuklanmoqda (birinchi marta ~12 MB)...');
          var M = BASES[i] + '/model/', n = window.faceapi.nets;
          await Promise.all([n.ssdMobilenetv1.loadFromUri(M), n.faceLandmark68Net.loadFromUri(M), n.faceRecognitionNet.loadFromUri(M)]);
          return;
        } catch (e) {}
      }
      throw new Error("Yuz tahlili kutubxonasi yuklanmadi. Internetni tekshirib, qayta urinib ko'ring.");
    })();
    ready.catch(function () { ready = null; });
    return ready;
  }
  function loadImg(src) {
    return new Promise(function (ok, no) {
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { no(new Error('Rasm yuklanmadi')); };
      im.src = src;
    });
  }
  async function compare(btn) {
    var box = btn.closest('[data-svdocs]');
    var res = box.querySelector('[data-res]');
    var imgs = box.querySelectorAll('img[data-full]');
    var say = function (t) { res.style.color = '#8A8497'; res.textContent = t; };
    btn.disabled = true;
    say('Tayyorlanmoqda...');
    try {
      await loadFace(say);
      say('Yuzlar tahlil qilinmoqda...');
      var A = await loadImg(imgs[0].src), B = await loadImg(imgs[1].src);
      var f = window.faceapi, opt = new f.SsdMobilenetv1Options({ minConfidence: 0.4 });
      var a = await f.detectSingleFace(A, opt).withFaceLandmarks().withFaceDescriptor();
      if (!a) throw new Error('Pasport/ID rasmida yuz topilmadi. Rasm aniq emas bo\u2018lishi mumkin.');
      var s = await f.detectSingleFace(B, opt).withFaceLandmarks().withFaceDescriptor();
      if (!s) throw new Error('Selfi rasmida yuz topilmadi. Rasm aniq emas bo\u2018lishi mumkin.');
      var d = f.euclideanDistance(a.descriptor, s.descriptor);
      var pct = Math.max(0, Math.min(99, Math.round((1.1 - d) / 0.8 * 100)));
      var v = d <= 0.45 ? ['#1E7E34', '\u2705 Juda o\u2018xshash']
            : d <= 0.6 ? ['#FF6B35', '\u26A0\uFE0F O\u2018xshash, e\u2019tibor bilan qarab chiqing']
            : ['#F23557', '\u274C O\u2018xshash emas, ehtiyot bo\u2018ling'];
      res.style.color = '#150F2E';
      res.innerHTML = '<div style="font-weight:800;color:' + v[0] + '">' + v[1] + '</div>' +
        '<div style="margin-top:2px">Taxminiy o\u2018xshashlik: <b>' + pct + '%</b> <span style="color:#8A8497">(masofa ' + d.toFixed(2) + ')</span></div>' +
        '<div style="font-size:10.5px;color:#8A8497;margin-top:3px">Bu faqat yordamchi natija. Yakuniy qarorni o\u2018zingiz qabul qiling.</div>';
    } catch (e) {
      res.style.color = '#F23557';
      res.textContent = e && e.message ? e.message : 'Xato yuz berdi';
    }
    btn.disabled = false;
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var z = t.closest('img[data-full]');
    if (z) { zoom(z.getAttribute('data-full')); return; }
    var b = t.closest('button[data-cmp]');
    if (b) compare(b);
  });

  function run() { try { addSurname(); enhanceDocs(); } catch (e) {} }
  try { new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  run();
})();
