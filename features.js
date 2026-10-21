// SavdoUz — yangi imkoniyatlar: parolni tiklash, promokodlar, admin statistikasi, buyurtma tarixi
'use strict';
const crypto = require('crypto');
const TZ = 5 * 36e5; // Toshkent UTC+5
const dayKey = t => new Date(t + TZ).toISOString().slice(0, 10);
const monKey = t => dayKey(t).slice(0, 7);
let C = null; // server yordamchilari (har so'rovda yangilanadi)

function normPhone(p) {
  let s = String(p || '').replace(/[^\d+]/g, '');
  if (/^\d{9}$/.test(s)) s = '+998' + s;
  else if (s && s[0] !== '+') s = '+' + s;
  return s;
}
const hashCode = (id, code) => crypto.createHash('sha256').update(id + ':' + code).digest('hex');
const unitPrice = p => (p.salePrice > 0 && p.saleEndsAt && Date.now() < new Date(p.saleEndsAt).getTime()) ? p.salePrice : p.price;

// ---------- Promokod ----------
function checkPromo(db, u, code, total) {
  const E = C.UserErr;
  const c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  const p = (db.promos || []).find(x => x.code === c);
  if (!p || !p.active) throw new E("Promokod topilmadi");
  if (p.expiresAt && Date.now() > new Date(p.expiresAt).getTime()) throw new E("Promokod muddati tugagan");
  if (p.maxUses > 0 && (p.used || []).length >= p.maxUses) throw new E("Promokod limiti tugagan");
  if ((p.used || []).some(x => x.userId === u.id)) throw new E("Bu promokodni allaqachon ishlatgansiz");
  if (p.minTotal > 0 && total < p.minTotal) throw new E("Promokod uchun buyurtma kamida " + p.minTotal + " so'm bo'lishi kerak");
  if (p.firstOnly && db.orders.some(o => o.buyerId === u.id && o.status !== 'bekor qilindi')) throw new E("Bu promokod faqat birinchi buyurtma uchun");
  const disc = Math.min(total, p.type === 'percent' ? Math.floor(total * p.value / 100) : p.value);
  return { promo: p, disc };
}
function applyPromo(db, u, code, total) {
  const r = checkPromo(db, u, code, total);
  return r ? { disc: r.disc, pc: r.promo.code } : { disc: 0, pc: null };
}
function usePromo(db, u, pc, order) {
  if (!pc) return;
  const p = (db.promos || []).find(x => x.code === pc);
  if (p) (p.used = p.used || []).push({ userId: u.id, orderId: order.id, at: new Date().toISOString() });
}

// ---------- Statistika ----------
function stats(db) {
  const now = Date.now(), today = dayKey(now), live = db.orders.filter(o => o.status !== 'bekor qilindi');
  const sum = a => a.reduce((s, o) => s + (o.total || 0), 0);
  const byDay = [], byMonth = [];
  for (let i = 13; i >= 0; i--) { const k = dayKey(now - i * 864e5), a = live.filter(o => dayKey(new Date(o.createdAt).getTime()) === k); byDay.push({ d: k.slice(5), sales: sum(a), orders: a.length }); }
  const mk = new Set();
  for (let i = 5; i >= 0; i--) { const d = new Date(now + TZ); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); mk.add(d.toISOString().slice(0, 7)); }
  mk.forEach(k => { const a = live.filter(o => monKey(new Date(o.createdAt).getTime()) === k); byMonth.push({ d: k, sales: sum(a), orders: a.length }); });
  const prod = {}, sell = {};
  live.forEach(o => o.items.forEach(it => {
    const sub = it.subtotal || it.price * it.qty;
    const a = prod[it.productId] = prod[it.productId] || { name: it.name, qty: 0, sales: 0 }; a.qty += it.qty; a.sales += sub;
    const b = sell[it.sellerId] = sell[it.sellerId] || { sales: 0, orders: 0 }; b.sales += sub; b.orders++;
  }));
  const top = (o, n) => Object.entries(o).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.sales - a.sales).slice(0, n);
  const statuses = {}; db.orders.forEach(o => statuses[o.status] = (statuses[o.status] || 0) + 1);
  const inDays = n => live.filter(o => now - new Date(o.createdAt).getTime() < n * 864e5);
  return {
    today: { sales: sum(live.filter(o => dayKey(new Date(o.createdAt).getTime()) === today)), orders: live.filter(o => dayKey(new Date(o.createdAt).getTime()) === today).length },
    week: { sales: sum(inDays(7)), orders: inDays(7).length }, month: { sales: sum(inDays(30)), orders: inDays(30).length },
    total: { sales: sum(live), orders: live.length }, byDay, byMonth, statuses,
    topProducts: top(prod, 5),
    topSellers: top(sell, 5).map(s => { const u = db.users.find(x => x.id === Number(s.id)); return { name: u ? u.name : "Noma'lum", sales: s.sales, orders: s.orders }; }),
    users: { buyers: db.users.filter(u => u.role === 'buyer').length, sellers: db.users.filter(u => u.role === 'seller').length }
  };
}

// ---------- Asosiy ishlovchi: true qaytarsa so'rov bajarilgan ----------
async function handle(req, res, pathname, M, db, ctx) {
  C = ctx; const J = (s, d) => { ctx.sendJSON(res, s, d); return true; };
  let m;
  // Buyurtma holati tarixi (status o'zgarganda vaqt yoziladi)
  if ((M === 'PATCH' && (m = pathname.match(/^\/api\/orders\/(\d+)\/status$/))) || (M === 'POST' && (m = pathname.match(/^\/api\/orders\/(\d+)\/received$/)))) {
    const oid = Number(m[1]);
    res.on('finish', () => {
      if (res.statusCode !== 200) return;
      const o = db.orders.find(x => x.id === oid); if (!o) return;
      o.history = o.history || [];
      const last = o.history[o.history.length - 1];
      if (last && last.status === o.status) return;
      o.history.push({ status: o.status, at: new Date().toISOString() });
      ctx.saveDB(db).catch(() => {});
    });
    return false;
  }

  // ---- Parolni tiklash (admin kod beradi) ----
  if (pathname === '/api/reset/request' && M === 'POST') {
    const b = await ctx.readBody(req), ph = normPhone(b.phone);
    const u = db.users.find(x => normPhone(x.phone) === ph && x.role !== 'admin');
    if (u) {
      db.resets = db.resets || [];
      const open = db.resets.find(r => r.userId === u.id && r.status !== 'bajarildi');
      if (!open || Date.now() - new Date(open.createdAt).getTime() > 60000) {
        if (open) db.resets.splice(db.resets.indexOf(open), 1);
        db.resets.push({ id: crypto.randomBytes(5).toString('hex'), userId: u.id, name: u.name, phone: u.phone, role: u.role, status: 'kutilmoqda', createdAt: new Date().toISOString() });
        if (db.resets.length > 200) db.resets = db.resets.slice(-200);
        await ctx.saveDB(db);
        ctx.pushAdmins(db, { title: "Parol tiklash so'rovi", body: u.name + ' (' + u.phone + ')', tag: 'reset' });
      }
    }
    return J(200, { ok: true }); // raqam bor-yo'qligi ochiq aytilmaydi
  }
  if (pathname === '/api/reset/confirm' && M === 'POST') {
    const b = await ctx.readBody(req), ph = normPhone(b.phone), code = String(b.code || '').trim();
    if (String(b.password || '').length < 6) return J(400, { error: "Parol kamida 6 ta belgi bo'lsin" });
    const r = (db.resets || []).find(x => normPhone(x.phone) === ph && x.status === 'kod berildi');
    if (!r || Date.now() > new Date(r.codeExp).getTime()) return J(400, { error: "Kod topilmadi yoki muddati tugagan. Qaytadan so'rang" });
    if ((r.tries = (r.tries || 0) + 1) > 5) { r.status = 'bekor'; await ctx.saveDB(db); return J(400, { error: "Juda ko'p urinish. Qaytadan so'rang" }); }
    if (hashCode(r.id, code) !== r.codeHash) { await ctx.saveDB(db); return J(400, { error: "Kod noto'g'ri" }); }
    const u = db.users.find(x => x.id === r.userId); if (!u) return J(404, { error: "Foydalanuvchi topilmadi" });
    const h = ctx.hashPassword(String(b.password)); u.salt = h.salt; u.hash = h.hash;
    r.status = 'bajarildi'; delete r.codeHash; await ctx.saveDB(db);
    return J(200, { ok: true });
  }
  if (pathname === '/api/me/password' && M === 'POST') {
    const u = ctx.me(); if (!u) return J(401, { error: "Tizimga kirilmagan" });
    const b = await ctx.readBody(req);
    if (!ctx.verifyPassword(String(b.oldPassword || ''), u.salt, u.hash)) return J(400, { error: "Eski parol noto'g'ri" });
    if (String(b.newPassword || '').length < 6) return J(400, { error: "Yangi parol kamida 6 ta belgi bo'lsin" });
    const h = ctx.hashPassword(String(b.newPassword)); u.salt = h.salt; u.hash = h.hash; await ctx.saveDB(db);
    return J(200, { ok: true });
  }

  // ---- Promokodni tekshirish (xaridor, savat uchun) ----
  if (pathname === '/api/promo/check' && M === 'POST') {
    const u = ctx.me(); if (!u || u.role !== 'buyer') return J(403, { error: "Faqat xaridorlar uchun" });
    const b = await ctx.readBody(req);
    let total = 0;
    for (const it of (b.items || [])) { const p = db.products.find(x => x.id === Number(it.productId)); if (p) total += unitPrice(p) * Math.max(1, Math.floor(Number(it.qty) || 1)); }
    try { const r = checkPromo(db, u, b.code, total); if (!r) return J(400, { error: "Promokodni kiriting" }); return J(200, { code: r.promo.code, discount: r.disc }); }
    catch (e) { if (e instanceof ctx.UserErr) return J(400, { error: e.message }); throw e; }
  }

  // ---- Admin qismi ----
  if (!pathname.startsWith('/api/admin/')) return false;
  const a = ctx.me();
  const guard = need => { if (!a || a.role !== 'admin') { J(403, { error: "Faqat admin uchun" }); return false; } if (!ctx.hasPerm(a, need)) { J(403, { error: "Bu bo'lim uchun huquqingiz yo'q" }); return false; } return true; };

  if (pathname === '/api/admin/stats' && M === 'GET') { if (!guard('orders')) return true; return J(200, stats(db)); }

  if (pathname === '/api/admin/promos' && M === 'GET') {
    if (!guard('orders')) return true;
    return J(200, { promos: (db.promos || []).map(p => ({ ...p, used: undefined, usedCount: (p.used || []).length })).reverse() });
  }
  if (pathname === '/api/admin/promos' && M === 'POST') {
    if (!guard('orders')) return true;
    const b = await ctx.readBody(req), code = String(b.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return J(400, { error: "Kod 3-20 ta harf/raqam bo'lsin (masalan YANGI10)" });
    const type = b.type === 'sum' ? 'sum' : 'percent', value = Math.round(Number(b.value));
    if (!(value > 0) || (type === 'percent' && value > 90)) return J(400, { error: type === 'percent' ? "Foiz 1 dan 90 gacha bo'lsin" : "Summani to'g'ri kiriting" });
    db.promos = db.promos || [];
    if (db.promos.some(p => p.code === code)) return J(400, { error: "Bu kod mavjud" });
    const days = Math.floor(Number(b.days));
    db.promos.push({ code, type, value, minTotal: Math.max(0, Math.round(Number(b.minTotal) || 0)), maxUses: Math.max(0, Math.floor(Number(b.maxUses) || 0)), firstOnly: !!b.firstOnly, active: true, expiresAt: days > 0 ? new Date(Date.now() + Math.min(days, 3650) * 864e5).toISOString() : null, used: [], createdAt: new Date().toISOString() });
    await ctx.saveDB(db); return J(200, { ok: true });
  }
  if ((m = pathname.match(/^\/api\/admin\/promos\/([A-Za-z0-9_-]+)$/)) && (M === 'PATCH' || M === 'DELETE')) {
    if (!guard('orders')) return true;
    const i = (db.promos || []).findIndex(p => p.code === m[1].toUpperCase());
    if (i === -1) return J(404, { error: "Promokod topilmadi" });
    if (M === 'DELETE') db.promos.splice(i, 1); else db.promos[i].active = !!(await ctx.readBody(req)).active;
    await ctx.saveDB(db); return J(200, { ok: true });
  }

  // Parol tiklash so'rovlari
  if (pathname === '/api/admin/resets' && M === 'GET') {
    if (!guard(['sellers', 'buyers'])) return true;
    return J(200, { resets: (db.resets || []).filter(r => r.status === 'kutilmoqda' || r.status === 'kod berildi').map(r => ({ id: r.id, name: r.name, phone: r.phone, role: r.role, status: r.status, createdAt: r.createdAt })).reverse() });
  }
  if ((m = pathname.match(/^\/api\/admin\/resets\/([a-f0-9]+)\/code$/)) && M === 'POST') {
    if (!guard(['sellers', 'buyers'])) return true;
    const r = (db.resets || []).find(x => x.id === m[1] && x.status !== 'bajarildi');
    if (!r) return J(404, { error: "So'rov topilmadi" });
    const code = String(crypto.randomInt(100000, 1000000));
    r.codeHash = hashCode(r.id, code); r.codeExp = new Date(Date.now() + 30 * 60000).toISOString(); r.tries = 0; r.status = 'kod berildi';
    await ctx.saveDB(db);
    return J(200, { code, minutes: 30 }); // kod faqat shu yerda bir marta ko'rsatiladi
  }
  if ((m = pathname.match(/^\/api\/admin\/resets\/([a-f0-9]+)$/)) && M === 'DELETE') {
    if (!guard(['sellers', 'buyers'])) return true;
    db.resets = (db.resets || []).filter(x => x.id !== m[1]); await ctx.saveDB(db); return J(200, { ok: true });
  }
  return false;
}
global.SVF = { handle, applyPromo, usePromo, _stats: stats, _norm: normPhone };
