// Ishga tushirish: server.js ni o'zgartirmasdan unga yangi imkoniyatlarni ulaydi.
// Agar biror joy topilmasa, ogohlantirish chiqadi va server baribir ishlayveradi.
const fs = require('fs'), path = require('path'), Module = require('module');
require('./features.js');
const file = path.join(__dirname, 'server.js');
let src = fs.readFileSync(file, 'utf8');
const uiJs = fs.readFileSync(path.join(__dirname, 'features-ui.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const P = [
  ["    if (pathname === '/api/kurs' && M === 'GET') {",
   "    if (global.SVF && await global.SVF.handle(req, res, pathname, M, db, { me, saveDB, sendJSON, readBody, hashPassword, verifyPassword, pushNotify, pushAdmins, hasPerm, UserErr })) return;\n    if (pathname === '/api/kurs' && M === 'GET') {"],
  ["const { items, address, phone, region, paymentMethod } = await readBody(req);",
   "const { items, address, phone, region, paymentMethod, promo } = await readBody(req);"],
  ["orderItems.forEach(it => { const p = db.products.find(x => x.id === it.productId); if (p) p.stock -= it.qty; });",
   "const { disc, pc } = global.SVF.applyPromo(db, u, promo, total);\n      orderItems.forEach(it => { const p = db.products.find(x => x.id === it.productId); if (p) p.stock -= it.qty; });"],
  ["total: total + deliveryTotal, itemsTotal: total, deliveryTotal,",
   "total: total + deliveryTotal - disc, itemsTotal: total, discount: disc, promoCode: pc, deliveryTotal,"],
  ["db.orders.push(order); await saveDB(db);",
   "global.SVF.usePromo(db, u, pc, order); db.orders.push(order); await saveDB(db);"],
  ["const extra = EXTRA_HTML.split('__LOGO__').join(LOGO_DATA);",
   "const extra = EXTRA_HTML.split('__LOGO__').join(LOGO_DATA) + '<script>' + global.__SV_UI + '</script>';"]
];
global.__SV_UI = uiJs;
let patched = src, bad = 0;
for (const [a, b] of P) {
  if (patched.split(a).length !== 2) { console.error('START.JS: topilmadi yoki takror:', a.slice(0, 60)); bad++; continue; }
  patched = patched.replace(a, () => b);
}
if (bad) { console.error("START.JS: server.js mos kelmadi — YANGI IMKONIYATLARSIZ, eski holatda ishga tushmoqda"); global.SVF = null; }
else src = patched;
const mod = new Module(file, module); mod.filename = file; mod.paths = Module._nodeModulePaths(__dirname);
mod._compile(src, file);
