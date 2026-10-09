// Prueba de humo de las funciones de precios contra un servidor real, con un negocio temporal.
// Uso: SMOKE_USER=... SMOKE_PASS=... API_URL=https://servidor node scripts/smoke-prod.js
// Crea y borra solo sus propios datos (artículos, lista y pantalla temporales).
const BASE = process.env.API_URL || 'http://localhost:3000';
const USER = process.env.SMOKE_USER;
const PASS = process.env.SMOKE_PASS;

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
};

async function call(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, data };
}

(async () => {
  const { data: login } = await call('POST', '/api/auth/login', { body: { username: USER, password: PASS } });
  const t = login.token;
  check('login del negocio temporal', !!t);

  console.log('Artículos y listas');
  const mk = (b) => call('POST', '/api/products', { token: t, body: b });
  const a = (await mk({ internalCode: 'S1', name: 'Asado de tira', price: 12900, category: 'Vacuno', unit: 'kg', oldPrice: 14500, badge: 'OFERTA' })).data;
  const b = (await mk({ internalCode: 'S2', name: 'Pollo entero', price: 4600, category: 'Pollo', unit: 'kg', available: false })).data;
  check('crea artículos con unidad, categoría, etiqueta y stock', a.unit === 'kg' && a.category === 'Vacuno' && b.available === false);
  const list = (await call('POST', '/api/pricelists', { token: t, body: { name: 'Prueba' } })).data;
  const add = await call('POST', `/api/pricelists/${list.id}/items/from-catalog`, { token: t, body: { productIds: [a.id, b.id] } });
  check('agrega artículos del catálogo a una lista', add.data.added === 2);
  await call('PUT', `/api/pricelists/${list.id}`, { token: t, body: { groupByCategory: true } });

  console.log('Pantalla y reproductor');
  const reg = (await call('POST', '/api/screens/register')).data;
  const link = await call('POST', '/api/screens/link', { token: t, body: { code: reg.code, name: 'Pantalla temporal' } });
  check('vincula una pantalla', link.status === 200);
  const tv = (await call('GET', `/api/screens/check-pairing/${reg.code}`)).data;
  const assign = await call('POST', `/api/screens/${reg.id}/assign`, { token: t, body: { priceListId: list.id, mediaIds: [], menuStyle: 'cards' } });
  check('asigna lista con estilo "cards"', assign.status === 200);
  const sync = (await call('GET', `/api/screens/${reg.id}/sync`, { token: tv.token })).data;
  const items = sync.playlist.items.find((i) => i.priceList).priceList;
  const ta = items.items.find((i) => i.name === 'Asado de tira');
  check('la TV recibe estilo, unidad, etiqueta y precio anterior', sync.menuStyle === 'cards' && ta.unit === 'kg' && ta.badge === 'OFERTA' && ta.oldPrice === 14500 && items.groupByCategory === true);
  check('mantiene los campos de siempre (compatibilidad)', ta.productName === 'Asado de tira' && ta.price === 12900);
  check('el artículo sin stock llega marcado', items.items.find((i) => i.name === 'Pollo entero').available === false);

  console.log('Ajuste masivo de precios');
  const scope = { type: 'products', productIds: [a.id, b.id] };
  const pv = await call('POST', '/api/pricing/preview', { token: t, body: { operation: 'percent', value: 10, roundStep: 100, scope } });
  check('vista previa: 12900 -> 14200 y 4600 -> 5100', pv.status === 200 && pv.data.count === 2 && pv.data.rows.some((r) => r.newPrice === 14200) && pv.data.rows.some((r) => r.newPrice === 5100), JSON.stringify(pv.data.rows));
  const applied = await call('POST', '/api/pricing/changes', { token: t, body: { operation: 'percent', value: 10, roundStep: 100, scope } });
  check('aplica el cambio', applied.status === 201 && applied.data.status === 'applied' && applied.data.affectedCount === 2);
  const sync2 = (await call('GET', `/api/screens/${reg.id}/sync`, { token: tv.token })).data;
  check('la TV ve el precio nuevo sin tocar la lista', sync2.playlist.items.find((i) => i.priceList).priceList.items.find((i) => i.name === 'Asado de tira').price === 14200);
  const undo = await call('POST', `/api/pricing/changes/${applied.data.id}/undo`, { token: t });
  check('deshacer restaura los precios', undo.status === 200 && undo.data.reverted === 2 && (await call('GET', '/api/products', { token: t })).data.find((p) => p.id === a.id).price === 12900);
  const future = await call('POST', '/api/pricing/changes', { token: t, body: { operation: 'amount', value: 100, scope, scheduledFor: new Date(Date.now() + 86400000).toISOString() } });
  check('programa un cambio a futuro', future.status === 201 && future.data.status === 'pending');
  check('y lo cancela', (await call('POST', `/api/pricing/changes/${future.data.id}/cancel`, { token: t })).status === 200);
  check('sin sesión no se puede usar el ajuste', (await call('POST', '/api/pricing/preview', { body: { operation: 'percent', value: 5 } })).status === 401);

  console.log('Limpieza');
  await call('DELETE', `/api/screens/${reg.id}`, { token: t });
  await call('DELETE', `/api/pricelists/${list.id}`, { token: t });
  await call('DELETE', `/api/products/${a.id}`, { token: t });
  await call('DELETE', `/api/products/${b.id}`, { token: t });

  console.log(`\n${passed} correctas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
