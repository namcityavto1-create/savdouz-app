// ===== SavdoUz Taksi: yo'lovchi ekrani (rasmdagi dizayn v3). index.html ga <script src="/taxi-ui.js?v=3"></script> bilan ulanadi =====
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

  // ---- SVG ikonkalar (rasmdagi dizayn uchun) ----
  function carIco(c, k){ return '<svg viewBox="0 0 48 48"><rect x="19" y="4" width="10" height="4.5" rx="1.6" fill="' + c + '"/><path d="M13.5 24.5 16.8 12.6Q17.4 10 20 10H28Q30.6 10 31.2 12.6L34.5 24.5Z" fill="' + c + '"/><path d="M17.6 22.6 19.6 13.6H28.4L30.4 22.6Z" fill="' + k + '"/><rect x="6.5" y="22" width="35" height="15" rx="5.5" fill="' + c + '"/><rect x="9" y="35" width="6.5" height="6" rx="2.4" fill="' + c + '"/><rect x="32.5" y="35" width="6.5" height="6" rx="2.4" fill="' + c + '"/><circle cx="13.5" cy="29" r="2.5" fill="' + k + '"/><circle cx="34.5" cy="29" r="2.5" fill="' + k + '"/><rect x="20" y="30.2" width="8" height="2.4" rx="1.2" fill="' + k + '"/></svg>'; }
  var IC = {
    home: '<svg viewBox="0 0 48 48"><path d="M24 5 3 24h6v17h10V30h10v11h10V24h6z"/></svg>',
    work: '<svg viewBox="0 0 48 48"><rect x="4" y="14" width="40" height="27" rx="5"/><path d="M17 14v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" fill="none" stroke="currentColor" stroke-width="4"/><rect x="4" y="25" width="40" height="3.5" fill="#1f2d5e"/><rect x="20.5" y="22.5" width="7" height="9" rx="1.8" fill="#ffc400" stroke="#1f2d5e" stroke-width="2"/></svg>',
    air: '<svg viewBox="-3 -3 30 30"><g transform="rotate(45 12 12)"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></g></svg>',
    route: '<svg viewBox="0 0 52 48"><path d="M18 3a10 10 0 0 0-10 10c0 8 10 19 10 19s10-11 10-19A10 10 0 0 0 18 3zm0 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/><path d="M10 43h18q9 0 9-7t8-7h3" fill="none" stroke="#ffc400" stroke-width="3.6" stroke-dasharray="4.5 4.5" stroke-linecap="round"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 1.5 3.5 5v6.2c0 5.2 3.6 9.9 8.5 11.3 4.9-1.4 8.5-6.1 8.5-11.3V5z"/><path d="M8 11.8l3 3 5-5.6" fill="none" stroke="#121e34" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13.5 1 5 13.2h5.7L9.5 23 19 10.2h-5.8z"/></svg>',
    like: '<svg viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>',
    head: '<svg viewBox="0 0 24 24"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M9 4.5l7.5 7.5L9 19.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    from: '<svg viewBox="0 0 24 24"><path fill="#2f80ed" d="M21.5 2.5 3 10.6l7.2 2.2 2.2 7.2z"/><path fill="#1c5fc4" d="M21.5 2.5 10.2 12.8l2.2 7.2z"/></svg>',
    to: '<svg viewBox="0 0 24 24"><path fill="#e53935" d="M12 1.5C8.13 1.5 5 4.63 5 8.5c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="8.5" r="2.7" fill="#fff"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>',
    navHome: '<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    wallet: '<svg viewBox="0 0 24 24"><path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
  };

  var css = document.createElement('style');
  css.textContent =
    '#taxiFab{position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 92px);z-index:9000;border:0;border-radius:26px;padding:12px 16px;font-weight:800;font-size:14px;line-height:1;font-family:inherit;background:#FFC529;color:#1b1b1b;box-shadow:0 4px 14px rgba(0,0,0,.28)}'
  // ---- xarita ekrani ----
  + '.txo{position:fixed;inset:0;z-index:99996;background:var(--bg,#f3f5f2);display:flex;flex-direction:column;color:var(--ink,#14201b)}'
  + '.txh{display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;font-weight:800;font-size:17px;background:var(--card,#fff)}'
  + '.txh button{width:42px;height:42px;border-radius:50%;border:0;background:var(--vl,#e8eef9);font-size:22px;color:inherit}'
  + '.txmap{flex:1;min-height:0}'
  + '.txs{background:var(--card,#fff);border-radius:22px 22px 0 0;margin-top:-18px;position:relative;z-index:1000;padding:14px 16px calc(env(safe-area-inset-bottom,0px) + 16px);box-shadow:0 -4px 18px rgba(0,0,0,.15)}'
  + '.txchips{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}'
  + '.txchip{display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:14px;border:2px solid var(--line,#e1e7e3);background:var(--card,#fff);font-weight:700;font-size:14px;line-height:1.2;font-family:inherit;text-align:left;color:inherit}'
  + '.txchip.on{border-color:#FFC529;background:#FFF6D6;color:#1b1b1b}'
  + '.txchip small{display:block;font-weight:500;color:var(--mut,#667);font-size:12px}'
  + '.txchip.on small{color:#665}'
  + '.txin{width:100%;padding:11px 12px;border:1.5px solid var(--line,#e1e7e3);border-radius:12px;font:inherit;background:var(--card,#fff);color:inherit;margin-bottom:8px}'
  + '.txb{display:block;width:100%;border:0;border-radius:14px;padding:15px 0;font-weight:800;font-size:15px;line-height:1;font-family:inherit;background:#FFC529;color:#1b1b1b;margin-top:6px}'
  + '.txb:disabled{opacity:.45}.txb.g{background:var(--vl,#eef3ff);color:var(--vt,#2a4fd0)}.txb.r{background:#fadbd8;color:#7a160d}'
  + '.txtar{display:flex;gap:8px;margin-bottom:8px}.txt{flex:1;border:2px solid var(--line,#e1e7e3);background:var(--card,#fff);border-radius:14px;padding:10px 6px;font:inherit;color:inherit;text-align:center}.txt.on{border-color:#FFC529;background:#FFF6D6;color:#1b1b1b}.txt b{display:block;font-size:15px}.txt small{display:block;font-size:12.5px;color:inherit;opacity:.75;margin-top:2px}'
  + '.txp{font-size:15px;margin:2px 0 8px}.txp b{font-size:22px}'
  + '.txst{font-weight:800;font-size:18px;text-align:center}.txeta{text-align:center;color:var(--mut,#667);margin:4px 0 8px}'
  + '.txw{margin:6px 0 8px;padding:9px 12px;border-radius:12px;background:#fff3cd;color:#6b4e00;font-weight:700;font-size:14px;text-align:center}.txw small{display:block;font-weight:500;opacity:.85;margin-top:2px}'
  + '.txd{display:flex;align-items:center;gap:12px;margin-top:6px}.txav{width:50px;height:50px;border-radius:50%;background:#FFC529;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;color:#1b1b1b}'
  + '.txd .n{font-weight:800;font-size:17px}.txd .s{color:var(--mut,#667);font-size:13px}'
  + '.txcall{margin-left:auto;background:var(--vl,#eef3ff);color:inherit;border-radius:28px;padding:13px 18px;font-weight:700;text-decoration:none;white-space:nowrap}'
  + '.txm{font-size:26px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}'
  + '.txplate{display:inline-block;background:#fff;border:2px solid #222;border-radius:6px;padding:1px 8px;font-weight:800;color:#222;font-size:13px}'
  // ---- bosh sahifa (rasmdagi dizayn) ----
  + ".hm{--u:calc(min(100vw,480px) / 1080);position:fixed;inset:0;z-index:99990;background:#080f1f;color:#fff;display:flex;flex-direction:column;font-family:inherit;-webkit-tap-highlight-color:transparent}"
  + ".hm *{box-sizing:border-box}"
  + ".hm button{font-family:inherit;cursor:pointer}"
  + ".hms{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column}"
  + ".hmw{width:min(100vw,480px);margin:0 auto;padding-bottom:calc(var(--u)*24);flex:1 0 auto;display:flex;flex-direction:column}"
  + ".hmsp{flex:1 1 0;min-height:0;max-height:calc(var(--u)*62)}"
  + ".hmh{position:relative;background:#02102f;padding-top:env(safe-area-inset-top,0px);overflow:hidden}"
  + ".hmh img{display:block;width:100%;height:auto;-webkit-user-drag:none;user-select:none}"
  + ".hmfb{display:none;padding:calc(var(--u)*70) calc(var(--u)*50) calc(var(--u)*60);font-size:calc(var(--u)*90);font-weight:900;font-style:italic;line-height:1.05}"
  + ".hmfb span{color:#ffc400}.hmfb small{display:block;margin-top:calc(var(--u)*30);font-size:calc(var(--u)*44);font-weight:700}"
  + ".hmh.nof .hmfb{display:block}.hmh.nof img{display:none}"
  + ".hmbell{position:absolute;right:calc(var(--u)*41);top:calc(env(safe-area-inset-top,0px) + calc(var(--u)*28));width:calc(var(--u)*88);height:calc(var(--u)*88);border-radius:50%;border:0;padding:0;background:rgba(8,15,38,.94);box-shadow:0 0 0 calc(var(--u)*2) rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center}"
  + ".hmbell svg{width:calc(var(--u)*44);height:calc(var(--u)*44);fill:#fff}"
  + ".hmbell i{position:absolute;left:calc(var(--u)*50);top:calc(var(--u)*-8);min-width:calc(var(--u)*40);height:calc(var(--u)*40);padding:0 calc(var(--u)*8);border-radius:calc(var(--u)*20);background:#ff3b30;color:#fff;font-size:calc(var(--u)*27);font-weight:700;line-height:calc(var(--u)*40);font-style:normal;text-align:center}"
  + ".hmcard{position:relative;margin:calc(var(--u)*5) calc(var(--u)*36) 0;height:calc(var(--u)*257);background:#edf1fd;color:#0d1633;border-radius:calc(var(--u)*52);display:flex;align-items:center;box-shadow:0 calc(var(--u)*10) calc(var(--u)*30) rgba(0,0,0,.4)}"
  + ".hmcard .ic{flex:none;position:relative;width:calc(var(--u)*120);height:calc(var(--u)*120);margin-left:calc(var(--u)*36);border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffd83a,#ffbe00);display:flex;align-items:center;justify-content:center;box-shadow:0 calc(var(--u)*4) calc(var(--u)*12) rgba(255,180,0,.35)}"
  + ".hmcard .ic svg{width:calc(var(--u)*74);height:calc(var(--u)*74)}"
  + ".hmcard .ic:after{content:\"\";position:absolute;left:50%;top:100%;height:calc(var(--u)*62);border-left:calc(var(--u)*4) dotted #b8c2e2;transform:translateX(-50%)}"
  + ".hmrows{flex:1;min-width:0;height:100%;margin:0 calc(var(--u)*30) 0 calc(var(--u)*34);display:flex;flex-direction:column}"
  + ".hmr{flex:1;display:flex;align-items:center;gap:calc(var(--u)*22);width:100%;padding:0;border:0;background:none;text-align:left;color:#0d1633}"
  + ".hmr+.hmr{border-top:calc(var(--u)*2) solid #d7dcee}"
  + ".hmr .pi{position:relative;flex:none;width:calc(var(--u)*52);height:calc(var(--u)*52);display:flex;align-items:center;justify-content:center}"
  + ".hmr .pi svg{width:calc(var(--u)*50);height:calc(var(--u)*50)}"
  + ".hmr:first-child .pi:after{content:\"\";position:absolute;left:50%;top:calc(var(--u)*64);height:calc(var(--u)*46);border-left:calc(var(--u)*4) dotted #b8c2e2;transform:translateX(-50%)}"
  + ".hmr .tt{flex:1;min-width:0}"
  + ".hmr b{display:block;font-size:calc(var(--u)*42);font-weight:700;line-height:1.15;color:#0d1633}"
  + ".hmr small{display:block;margin-top:calc(var(--u)*3);font-size:calc(var(--u)*30);font-weight:400;line-height:1.2;color:#4a5578}"
  + ".hmr .ch{flex:none;width:calc(var(--u)*34);height:calc(var(--u)*34);color:#0d1633}.hmr .ch svg{width:100%;height:100%}"
  + ".hmgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:calc(var(--u)*17);margin:calc(var(--u)*24) calc(var(--u)*29) 0}"
  + ".hmtile{height:calc(var(--u)*176);padding:0 calc(var(--u)*4);border:0;border-radius:calc(var(--u)*42);background:linear-gradient(180deg,#26376d,#1b2955);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*12);box-shadow:inset 0 0 0 calc(var(--u)*2) rgba(255,255,255,.07),0 calc(var(--u)*6) calc(var(--u)*14) rgba(0,0,0,.35)}"
  + ".hmtile svg{width:calc(var(--u)*70);height:calc(var(--u)*62);flex:none;fill:#ffc400;color:#ffc400}"
  + ".hmtile span{font-size:calc(var(--u)*29);font-weight:700;line-height:1.1;text-align:center}"
  + ".hmpromo{position:relative;margin:calc(var(--u)*22) calc(var(--u)*29) 0;height:calc(var(--u)*157);border-radius:calc(var(--u)*46);background:linear-gradient(90deg,#fed10a,#fdbd0b 55%,#feb20c);color:#111;display:flex;align-items:center;overflow:hidden}"
  + ".hmpromo .g{position:absolute;left:calc(var(--u)*38);top:calc(var(--u)*9);width:calc(var(--u)*265);height:calc(var(--u)*138);background:url(/taxi-gift.png?v=1) center/100% 100% no-repeat;-webkit-mask-image:radial-gradient(ellipse at center,#000 55%,transparent 100%);mask-image:radial-gradient(ellipse at center,#000 55%,transparent 100%)}"
  + ".hmpromo .tx{flex:1;min-width:0;padding-left:calc(var(--u)*300)}"
  + ".hmpromo b{display:block;font-size:calc(var(--u)*44);font-weight:800;line-height:1.1;color:#0f172a}"
  + ".hmpromo em{display:block;margin-top:calc(var(--u)*2);font-size:calc(var(--u)*33);font-weight:600;font-style:italic;line-height:1.2;color:#1d1d1d}"
  + ".hmpromo button{flex:none;display:flex;align-items:center;gap:calc(var(--u)*10);height:calc(var(--u)*80);margin-right:calc(var(--u)*23);padding:0 calc(var(--u)*24) 0 calc(var(--u)*32);border:0;border-radius:calc(var(--u)*40);background:#0b1020;color:#fff;font-size:calc(var(--u)*31);font-weight:700;white-space:nowrap}"
  + ".hmpromo button svg{width:calc(var(--u)*26);height:calc(var(--u)*26)}"
  + ".hmfeat{margin:calc(var(--u)*16) calc(var(--u)*29) 0;height:calc(var(--u)*145);background:#121e34;border-radius:calc(var(--u)*40);display:grid;grid-template-columns:repeat(4,1fr);align-items:center}"
  + ".hmfeat div{height:calc(var(--u)*100);padding:0 calc(var(--u)*4);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*7);border-left:calc(var(--u)*2) solid rgba(255,255,255,.14);text-align:center;font-size:calc(var(--u)*25);font-weight:600;line-height:1.15}"
  + ".hmfeat div:first-child{border-left:0}"
  + ".hmfeat svg{width:calc(var(--u)*46);height:calc(var(--u)*46);flex:none;fill:#ffc400}"
  + ".hmcta{position:relative;display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*30);width:calc(100% - calc(var(--u)*58));height:calc(var(--u)*123);margin:calc(var(--u)*20) calc(var(--u)*29) 0;border:0;border-radius:calc(var(--u)*62);background:linear-gradient(90deg,#fed004,#fdc200);color:#101010;font-size:calc(var(--u)*44);font-weight:800;box-shadow:0 calc(var(--u)*8) calc(var(--u)*24) rgba(255,190,0,.25)}"
  + ".hmcta .car svg{width:calc(var(--u)*76);height:calc(var(--u)*58);display:block}"
  + ".hmcta .ch{position:absolute;right:calc(var(--u)*40);width:calc(var(--u)*36);height:calc(var(--u)*36)}.hmcta .ch svg{width:100%;height:100%}"
  + ".hmn{width:100%;max-width:480px;margin:0 auto;display:flex;background:#0c172d;border-radius:calc(var(--u)*56) calc(var(--u)*56) 0 0;padding:calc(var(--u)*20) 0 calc(env(safe-area-inset-bottom,0px) + calc(var(--u)*12));box-shadow:0 calc(var(--u)*-4) calc(var(--u)*22) rgba(0,0,0,.55)}"
  + ".hmn button{flex:1;position:relative;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*8);padding:0 0 calc(var(--u)*18);border:0;background:none;color:#fff;font-size:calc(var(--u)*29);font-weight:500}"
  + ".hmn button svg{width:calc(var(--u)*58);height:calc(var(--u)*58);fill:currentColor}"
  + ".hmn button.on{color:#ffc400;font-weight:600}"
  + ".hmn button.on:after{content:\"\";position:absolute;bottom:0;width:calc(var(--u)*160);height:calc(var(--u)*6);border-radius:calc(var(--u)*3);background:#ffc400}"
  + ".hmpg{padding:calc(env(safe-area-inset-top,0px) + 18px) 14px 8px}.hmpg h2{font-size:26px;font-weight:900;line-height:1.1;margin:4px 2px 14px}"
  + ".hmo{display:flex;align-items:center;gap:10px;background:#121e34;border-radius:16px;padding:13px 14px;margin-bottom:10px;width:100%;border:0;color:#fff;text-align:left;font-size:14px}.hmo b{display:block;font-size:16px}.hmo small{display:block;color:#aab3d6;font-size:13px;margin-top:2px}.hmo .r{margin-left:auto;text-align:right}"
  + ".hmchip{display:inline-block;border-radius:10px;padding:3px 9px;font-size:12px;font-weight:700;line-height:1.3;background:#2a3a73;color:#fff;margin-top:4px}.hmchip.ok{background:#1f7a46}.hmchip.no{background:#7a2a2a}.hmchip.go{background:#FFC529;color:#111}"
  + ".hmbox{background:#121e34;border-radius:18px;padding:16px;margin-bottom:12px}.hmbox .l{color:#aab3d6;font-size:14px}.hmbox .v{font-size:26px;font-weight:900;line-height:1.2;margin-top:4px}.hmbox p{color:#c9d0ee;font-size:14px;margin:8px 0 0}"
  + ".hm2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.hm2 .hmbox{margin:0}"
  + ".hmbtn{display:block;width:100%;border:0;border-radius:14px;padding:14px 0;background:#121e34;color:#fff;font-size:15px;font-weight:700;line-height:1;margin-bottom:10px}.hmbtn.y{background:#FFC529;color:#111}"
  + ".hmem{text-align:center;color:#aab3d6;padding:30px 10px}"
  + ".hmov{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}"
  + ".hmsh{width:100%;max-width:480px;background:#0c172d;color:#fff;border-radius:24px 24px 0 0;padding:20px 18px calc(env(safe-area-inset-bottom,0px) + 18px)}"
  + ".hmsh h3{font-size:20px;font-weight:900;margin:0 0 12px}"
  + ".hminf{background:#121e34;border-radius:14px;padding:12px 14px;margin-bottom:8px}.hminf b{display:block;font-size:16px}.hminf span{display:block;color:#c9d0ee;font-size:14px;margin-top:3px}"
  + ".hmsh p{color:#aab3d6;font-size:13.5px;margin:10px 2px 14px}";
  document.head.appendChild(css);

  var css2 = document.createElement('style');
  css2.textContent =
    '.txo .txh{margin:0;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 12px;background:linear-gradient(180deg,#1f63e6,#3b82f6 55%,#dbe8ff);border-radius:0 0 26px 26px;color:#0b1b3a;font-size:19px}'
  + '.txo .txh button{background:rgba(255,255,255,.85);color:#1a5bff;box-shadow:0 2px 8px rgba(20,60,160,.2)}'
  + '.txo .txh span{flex:1;font-weight:900;color:#0b1b3a}'
  + '.txs{background:#eef3fd;border-radius:28px 28px 0 0;margin-top:-22px;padding:16px 14px calc(env(safe-area-inset-bottom,0px) + 0px);max-height:72vh;overflow:auto}'
  + '.txchips{gap:12px;margin-bottom:12px}'
  + '.txchip{gap:12px;padding:13px 14px;border-radius:20px;border:2px solid #fff;background:#fff;box-shadow:0 3px 12px rgba(30,70,170,.12);color:#0b1b3a}'
  + '.txchip b{display:block;font-size:17px;font-weight:800}.txchip b em{font-weight:500;font-style:italic}'
  + '.txchip small{font-size:14px;color:#4a5578;margin-top:2px}'
  + '.txchip>div{flex:1;min-width:0}'
  + '.txchip.on{border-color:#f5b400;background:#fff3c4;box-shadow:0 3px 12px rgba(245,180,0,.3)}'
  + '.txchip .txch{flex:none;width:22px;height:22px;color:#0b1b3a}.txchip .txch svg{width:100%;height:100%}'
  + '.txpin{flex:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:14px}'
  + '.txpin svg{width:30px;height:30px}.txpin.g svg{fill:#2fb24c}.txpin.b svg{fill:#1a5bff;width:26px;height:26px}.txpin.f{background:#ffe08a}.txpin.f svg{width:28px;height:28px}'
  + '.txtar{gap:12px;margin-bottom:12px}'
  + '.txt{position:relative;display:flex;align-items:center;gap:6px;padding:12px 10px;border:2px solid #fff;border-radius:20px;background:#fff;color:#0b1b3a;text-align:left;box-shadow:0 3px 12px rgba(30,70,170,.12);min-height:74px}'
  + '.txt img{flex:none;width:62px;height:auto;max-height:46px;object-fit:contain}'
  + '.txt b{font-size:17px;font-weight:800}.txt small{font-size:15px;opacity:1;color:#4a5578;margin-top:3px}'
  + '.txt.on{background:linear-gradient(135deg,#1558f0,#2f8bff);border-color:#cfe0ff;color:#fff;box-shadow:0 6px 16px rgba(26,91,255,.4)}.txt.on small{color:#fff}'
  + '.txck{position:absolute;right:8px;top:6px;width:24px;height:24px;border-radius:50%;border:2px solid #cfd6ea;background:#fff;display:flex;align-items:center;justify-content:center;font-style:normal}'
  + '.txck svg{width:16px;height:16px;display:none}.txt.on .txck{border-color:#fff}.txt.on .txck svg{display:block}'
  + '.txnote{display:flex;align-items:center;gap:8px;padding:0 12px;border-radius:18px;background:#e2ebfb;margin-bottom:12px}'
  + '.txnote .txpin{width:30px;height:30px;background:none}'
  + '.txnote .txin{flex:1;margin:0;border:0;background:none;padding:15px 0;font-size:15px;color:#0b1b3a}'
  + '.txpr{display:flex;align-items:center;gap:12px;padding:14px;border-radius:20px;background:#fff;box-shadow:0 3px 12px rgba(30,70,170,.1);margin-bottom:12px}'
  + '.txpr .coin{flex:none;width:44px;height:44px}'
  + '.txpr .txp{margin:0;font-size:14px;color:#4a5578;line-height:1.35}.txpr .txp b{font-size:24px;color:#0b1b3a}'
  + '.txb{display:flex;align-items:center;justify-content:center;gap:10px;border-radius:30px;padding:0;height:60px;font-size:18px;font-weight:800;margin-top:0}'
  + '.txb:not(.g){background:linear-gradient(90deg,#ffd60a,#ffb800);color:#111;box-shadow:0 6px 16px rgba(245,170,0,.45)}'
  + '.txb .tc{width:30px;height:30px;fill:#111}.txb .tg{position:absolute;right:20px;width:22px;height:22px}.txb[data-go]{position:relative}'
  + '.txb.g{background:transparent;color:#1a5bff;height:50px;font-size:17px;font-weight:700;margin-top:6px}.txb .tm{width:24px;height:24px;fill:#ff3b30}'
  + '.txfoot{display:block;width:calc(100% + 28px);margin:6px -14px 0;height:auto}';
  document.head.appendChild(css2);

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

  // Android "orqaga" tugmasi: taksi ekranlarini yopadi
  var hist = 0, skipPop = 0;
  function hPush(){ try { history.pushState({ tx: 1 }, ''); hist++; } catch(e){} }
  function hPopN(n){ n = Math.min(n, hist); if(n <= 0) return; hist -= n; skipPop++; try { history.go(-n); } catch(e){ skipPop--; } }
  window.addEventListener('popstate', function(){
    if(skipPop > 0){ skipPop--; return; }
    if(hist > 0) hist--;
    if(T) closeMap(true); else if(H) closeHome(true);
  });

  function closeMap(fromPop){
    if(!T) return;
    clearInterval(T.tm); T.dead = true;
    try { if(T.map) T.map.remove(); } catch(e){}
    if(T.el && T.el.parentNode) T.el.parentNode.removeChild(T.el);
    T = null;
    if(H && H.tab === 'orders') paintHome();
    syncFab();
    if(fromPop !== true) hPopN(1);
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
      '<div class="txchips">'
    + '<button class="txchip" data-chip="from"><span class="txpin g"><svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.500a2.5 2.5 0 0 1 0 5z"/></svg></span><div><b>Qayerdan</b><small data-t="from">Aniqlanmoqda…</small></div><span class="txch"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>'
    + '<button class="txchip on" data-chip="to"><span class="txpin f"><svg viewBox="0 0 24 24"><path d="M5 3v18M5 4h13l-2.500 4L18 12H5" fill="none" stroke="#111" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div><b>Qayerga <em>(ixtiyoriy)</em></b><small data-t="to">Belgilamasangiz ham bo\'ladi, haydovchiga o\'zingiz aytasiz</small></div><span data-clearto style="display:none;margin-left:auto;padding:4px 10px;font-size:18px">✕</span><span class="txch"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button></div>'
    + '<div class="txtar"><button class="txt on" data-tar="start"><img src="/taxi-car-start.png?v=1" alt="" onerror="this.style.display=\'none\'"><div><b>Start</b><small data-f="start">—</small></div><i class="txck"><svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7" fill="none" stroke="#1a5bff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></i></button>'
    + '<button class="txt" data-tar="komfort"><img src="/taxi-car-komfort.png?v=1" alt="" onerror="this.style.display=\'none\'"><div><b>Komfort</b><small data-f="komfort">—</small></div><i class="txck"></i></button></div>'
    + '<label class="txnote"><span class="txpin b"><svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.200 7 13 7 13s7-7.800 7-13a7 7 0 0 0-7-7zm0 9.500A2.500 2.500 0 1 1 12 6.500a2.500 2.500 0 0 1 0 5z"/></svg></span><input class="txin" data-note placeholder="Izoh (mo\'ljal, kirish eshigi...) — ixtiyoriy" maxlength="150"></label>'
    + '<div class="txpr"><svg class="coin" viewBox="0 0 40 40"><ellipse cx="14" cy="28" rx="11" ry="5" fill="#f5a000"/><ellipse cx="14" cy="24" rx="11" ry="5" fill="#ffc933"/><ellipse cx="26" cy="19" rx="11" ry="5" fill="#f5a000"/><ellipse cx="26" cy="15" rx="11" ry="5" fill="#ffd84a"/></svg><div class="txp" data-price>Joylashuvingiz aniqlanmoqda…</div></div>'
    + '<button class="txb" data-go disabled><svg viewBox="0 0 24 24" class="tc"><path d="M7 4h10l1.500 4H21v8h-1.500v2h-3v-2h-9v2h-3v-2H3V8h2.500L7 4zm1.200 1.800L7.300 8h9.400l-.9-2.200H8.200zM6 11.500a1.300 1.300 0 1 0 0 2.600 1.300 1.300 0 0 0 0-2.600zm12 0a1.300 1.300 0 1 0 0 2.600 1.300 1.300 0 0 0 0-2.600z"/></svg><span>Taksi chaqirish · naqd</span><svg viewBox="0 0 24 24" class="tg"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.800" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
    + '<button class="txb g" data-me><svg viewBox="0 0 24 24" class="tm"><path d="M12 2a7 7 0 0 0-7 7c0 5.200 7 13 7 13s7-7.800 7-13a7 7 0 0 0-7-7zm0 9.500A2.500 2.500 0 1 1 12 6.500a2.500 2.500 0 0 1 0 5z"/></svg>Mening joylashuvim</button>'
    + '<img class="txfoot" src="/taxi-order-footer.jpg?v=1" alt="" draggable="false" onerror="this.style.display=\'none\'">';
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
    var el = sheet().querySelector('[data-t="' + k + '"]'); if(el) el.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
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
    if(o.status === 'yetkazildi') h += '<div class="txeta">Haydovchiga naqd to\'lang: <b>' + F(o.fee) + '</b>' + (o.wait && o.wait.fee > 0 ? '<br><small>shu jumladan kutish haqi ' + F(o.wait.fee) + '</small>' : '') + '</div>';
    else if(o.open && o.status === 'yolda') h += '<div class="txeta">Manzilni haydovchiga ayting · narx yo\'lga qarab, ' + F(o.fee) + ' dan</div>';
    else if(o.etaMin != null) h += '<div class="txeta">' + E(o.tariffName || '') + ' · taxminan ' + o.etaMin + ' daqiqada' + (o.status === 'yolda' ? ' manzilga yetamiz' : ' yetib keladi') + '</div>';
    else if(o.status === 'yangi') h += '<div class="txeta">' + E(o.tariffName || '') + ' · ' + (o.open ? F(o.fee) + ' dan · manzilsiz' : F(o.fee) + ' · ' + o.km + ' km') + ' · naqd</div>';
    if(o.status === 'qabul') h += '<div class="txeta" style="font-size:13px">Haydovchi kelgach ' + Math.round((o.waitFreeSec || 60) / 60) + ' daqiqa bepul kutiladi, keyin har daqiqa ' + F(o.waitPerMin || 1000) + '</div>';
    if(o.status === 'keldi' || o.status === 'yolda') h += '<div class="txw" data-w></div>';
    if(d && !final){
      h += '<div class="txd"><div class="txav">' + E((d.name || 'H').charAt(0).toUpperCase()) + '</div><div><div class="n">' + E(d.name) + '</div><div class="s">' + E(d.car) + ' · <span class="txplate">' + E(d.plate) + '</span></div></div>'
        + '<a class="txcall" href="tel:' + E(d.phone) + '">📞 Qo\'ng\'iroq</a></div>';
    }
    if(['yangi', 'qabul', 'keldi'].indexOf(o.status) > -1) h += '<button class="txb r" data-cancel>Buyurtmani bekor qilish</button>';
    if(final){ h += '<button class="txb" data-new>Yangi taksi chaqirish</button><button class="txb g" data-close>Yopish</button>'; clearInterval(T.tm); }
    if(T.sig !== sig + h.length){ T.sig = sig + h.length; s.innerHTML = h; bindTrack(o); }
    updWait(o, s);
    if(o.status === 'keldi' && T.lastSt !== 'keldi'){ try { if(navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch(e){} }
    T.lastSt = o.status;
  }
  function mmss(sec){ sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function updWait(o, s){
    var el = s.querySelector('[data-w]'), w = o.wait;
    if(!el || !w) return;
    var per = F(o.waitPerMin || 1000), h = '';
    if(o.status === 'keldi'){
      if(w.freeLeft > 0) h = '⏱ Bepul kutish: ' + mmss(w.freeLeft) + ' qoldi<small>Keyin har daqiqa ' + per + '</small>';
      else h = '⏱ Kutish: ' + mmss(w.arrSec) + ' · +' + F(w.fee) + '<small>Har boshlangan daqiqa ' + per + '</small>';
    } else if(o.status === 'yolda'){
      if(w.fee > 0 || w.stopping){
        h = '⏸ Kutish haqi: ' + F(w.fee) + (w.stopping ? ' · to\'xtab turibsiz' : '') + '<small>Safar narxi: ' + F(o.fee) + (o.open ? ' dan' : '') + ' + kutish = ' + F(o.fee + w.fee) + (o.open ? ' dan' : '') + '</small>';
      } else h = 'To\'xtab qolsangiz, ' + (o.stopFreeSec || 10) + ' soniyadan keyin kutish haqi yoziladi (' + per + '/daq)';
    }
    if(el.innerHTML !== h) el.innerHTML = h;
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
    hPush();
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
    return '<div class="hmh"><img src="/taxi-hero.jpg?v=1" alt="SavdoUz Taksi" draggable="false" onerror="this.parentNode.classList.add(\'nof\')">'
      + '<div class="hmfb">Savdo<span>Uz</span><br>Taksi<small>Tez • Xavfsiz • Qulay</small></div>'
      + '<button class="hmbell" data-nav-go="orders" aria-label="Buyurtmalar">' + IC.bell + (H.active ? '<i>1</i>' : '') + '</button></div>'
      + '<div class="hmcard"><div class="ic">' + carIco('#16171c', '#ffc400') + '</div><div class="hmrows">'
      + '<button class="hmr" data-order="from"><span class="pi">' + IC.from + '</span><div class="tt"><b>Qayerdan?</b><small>Boshlang\'ich manzilni tanlang</small></div><span class="ch">' + IC.chev + '</span></button>'
      + '<button class="hmr" data-order="to"><span class="pi">' + IC.to + '</span><div class="tt"><b>Qayerga?</b><small>Yakuniy manzilni tanlang</small></div><span class="ch">' + IC.chev + '</span></button></div></div>'
      + '<i class="hmsp"></i><div class="hmgrid">'
      + '<button class="hmtile" data-go="home">' + IC.home + '<span>Uyga<br>borish</span></button>'
      + '<button class="hmtile" data-go="work">' + IC.work + '<span>Ishga<br>borish</span></button>'
      + '<button class="hmtile" data-go="air">' + IC.air + '<span>Aeroport</span></button>'
      + '<button class="hmtile" data-order="to">' + IC.route + '<span>Manzil tanlash</span></button></div>'
      + '<i class="hmsp"></i><div class="hmpromo"><div class="g"></div><div class="tx"><b>SavdoUz Taksi</b><em>Har safar yanada qulay!</em></div><button data-info>Batafsil ' + IC.chev + '</button></div>'
      + '<i class="hmsp"></i><div class="hmfeat"><div>' + IC.shield + '<span>100%<br>Xavfsizlik</span></div><div>' + IC.bolt + '<span>Tez<br>Yetkazish</span></div><div>' + IC.like + '<span>Qulay<br>Narxlar</span></div><div>' + IC.head + '<span>24/7<br>Qo\'llab-quvvatlash</span></div></div>'
      + '<i class="hmsp"></i><button class="hmcta" data-order><span class="car">' + carIco('#16171c', '#fdc200') + '</span>Buyurtma berish<span class="ch">' + IC.chev + '</span></button>';
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
  function showInfo(){
    tget('/info').then(function(r){
      var tf = r.cfg.tariffs, rows = Object.keys(tf).map(function(k){ return '<div class="hminf"><b>' + E(tf[k].name) + '</b><span>' + F(tf[k].base) + " (1-km), keyingi har km " + F(tf[k].km) + '</span></div>'; }).join('');
      var ov = document.createElement('div'); ov.className = 'hmov';
      ov.innerHTML = '<div class="hmsh"><h3>🚕 SavdoUz Taksi tariflari</h3>' + rows + '<p>Eng ko\'pi ' + E(r.cfg.maxKm) + ' km. To\'lov faqat naqd.</p><button class="hmbtn y" data-x>Yopish</button></div>';
      ov.onclick = function(ev){ if(ev.target === ov || ev.target.hasAttribute('data-x')) ov.parentNode && ov.parentNode.removeChild(ov); };
      document.body.appendChild(ov);
    }).catch(function(e){ say(e.message); });
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
    if(inf) inf.onclick = showInfo;
    var cl = w.querySelector('[data-clear]');
    if(cl) cl.onclick = function(){ lsSet('taxiHome', null); lsSet('taxiWork', null); say('Saqlangan manzillar tozalandi'); };
  }
  function paintHome(){
    if(!H) return;
    var body = H.el.querySelector('[data-body]');
    body.innerHTML = '<div class="hmw">' + (H.tab === 'orders' ? ordersTab() : H.tab === 'wallet' ? walletTab() : H.tab === 'profile' ? profileTab() : homeTab()) + '</div>';
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
      + '<button data-nav="home">' + IC.navHome + 'Bosh sahifa</button><button data-nav="orders">' + carIco('currentColor', '#0c172d') + 'Buyurtmalar</button>'
      + '<button data-nav="wallet">' + IC.wallet + 'Hamyon</button><button data-nav="profile">' + IC.user + 'Profil</button></nav>';
    document.body.appendChild(w);
    hPush();
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
  function closeHome(fromPop){
    if(!H) return;
    var n = 1 + (T ? 1 : 0);
    closeMap(true);
    if(H.el.parentNode) H.el.parentNode.removeChild(H.el);
    H = null; syncFab();
    if(fromPop !== true) hPopN(n);
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
