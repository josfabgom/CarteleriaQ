// Pruebas de integración de precios masivos, artículos con foto/unidad y estilos de menú.
// Uso: node scripts/test-pricing-api.js   (backend en http://localhost:3000, admin en ../.env)
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_URL || 'http://localhost:3000';
const env = {};
const envFile = path.join(__dirname, '../../.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
}
const ADMIN_USER = process.env.ADMIN_USERNAME || env.ADMIN_USERNAME;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || env.ADMIN_PASSWORD;

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, data };
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const uploadFile = (token, buf, name, type) => {
  const form = new FormData();
  form.append('file', new Blob([buf], { type }), name);
  return call('POST', '/api/media/upload', { token, form });
};
const byName = (list, name) => list.find((p) => p.name === name);

(async () => {
  const stamp = Date.now().toString(36);
  const admin = (await call('POST', '/api/auth/login', { body: { username: ADMIN_USER, password: ADMIN_PASS } })).data;
  const mk = async (tag, maxScreens = 3) => {
    const user = `carn_${tag}_${stamp}`;
    await call('POST', '/api/admin/businesses', { token: admin.token, body: { name: `Carnicería ${tag}`, username: user, password: 'clave-segura-123', maxScreens, storageLimitMb: 50 } });
    const login = (await call('POST', '/api/auth/login', { body: { username: user, password: 'clave-segura-123' } })).data;
    return { token: login.token, id: login.business.id };
  };
  const A = await mk('a');
  const B = await mk('b');

  console.log('Artículos: unidad, categoría, etiqueta, precio anterior, stock y foto');
  const img = (await uploadFile(A.token, PNG, 'corte.png', 'image/png')).data;
  const mp4 = (await uploadFile(A.token, Buffer.from('video-falso'), 'v.mp4', 'video/mp4')).data;
  const imgB = (await uploadFile(B.token, PNG, 'otro.png', 'image/png')).data;
  const mkProduct = (token, body) => call('POST', '/api/products', { token, body });

  const asado = await mkProduct(A.token, { internalCode: 'V1', name: 'Asado de tira', price: 12000, category: 'Vacuno', unit: 'kg', oldPrice: 13500, badge: 'OFERTA', imageId: img.id, description: 'Corte tradicional' });
  check('crea artículo con todos los campos', asado.status === 201 && asado.data.unit === 'kg' && asado.data.category === 'Vacuno' && asado.data.oldPrice === 13500 && asado.data.badge === 'OFERTA' && asado.data.image?.url === img.url, JSON.stringify(asado.data));
  const vacio = (await mkProduct(A.token, { internalCode: 'V2', name: 'Vacío', price: 15000, category: 'Vacuno', unit: 'kg' })).data;
  const pollo = (await mkProduct(A.token, { internalCode: 'P1', name: 'Pollo entero', price: 4000, category: 'Pollo', unit: 'kg' })).data;
  const sinCat = (await mkProduct(A.token, { internalCode: 'X1', name: 'Carbón 3 kg', price: 2500, unit: 'unidad' })).data;
  const chori = (await mkProduct(A.token, { internalCode: 'C1', name: 'Chorizo', price: 6000, category: 'Cerdo', unit: 'kg', available: false })).data;
  check('sin stock se guarda', chori.available === false);
  check('precio con formato local se interpreta', (await mkProduct(A.token, { name: 'Morcilla', price: '8.500,50', category: 'Cerdo', unit: 'kg' })).data.price === 8500.5);
  check('precio anterior inválido -> 400', (await mkProduct(A.token, { name: 'X', price: 1, oldPrice: 'mucho' })).status === 400);
  check('precio negativo -> 400', (await mkProduct(A.token, { name: 'X', price: -5 })).status === 400);
  check('sin nombre -> 400', (await mkProduct(A.token, { name: '', price: 5 })).status === 400);
  check('foto de otro negocio -> 400', (await mkProduct(A.token, { name: 'Robo', price: 1, imageId: imgB.id })).status === 400);
  check('un video no sirve como foto -> 400', (await mkProduct(A.token, { name: 'Video', price: 1, imageId: mp4.id || 'x' })).status === 400);
  check('B no ve las categorías de A', (await call('GET', '/api/pricing/meta', { token: B.token })).data.categories.length === 0);
  const meta = (await call('GET', '/api/pricing/meta', { token: A.token })).data;
  check('meta: categorías, unidades y sin categoría', meta.categories.length === 3 && meta.units.includes('kg') && meta.units.includes('unidad') && meta.withoutCategory === 1, JSON.stringify(meta));
  check('cambiar disponibilidad rápido', (await call('PATCH', `/api/products/${chori.id}/availability`, { token: A.token, body: { available: true } })).status === 200 && (await call('GET', '/api/products', { token: A.token })).data.find((p) => p.id === chori.id).available === true);
  await call('PATCH', `/api/products/${chori.id}/availability`, { token: A.token, body: { available: false } });
  check('B no puede cambiar la disponibilidad de A', (await call('PATCH', `/api/products/${asado.data.id}/availability`, { token: B.token, body: { available: false } })).status === 404);

  console.log('Listas: ítems enlazados al catálogo y manuales');
  const list = (await call('POST', '/api/pricelists', { token: A.token, body: { name: 'Mostrador' } })).data;
  const add = await call('POST', `/api/pricelists/${list.id}/items/from-catalog`, { token: A.token, body: { productIds: [asado.data.id, vacio.id, pollo.id, chori.id] } });
  check('agrega varios desde el catálogo', add.status === 201 && add.data.added === 4, JSON.stringify(add.data));
  const addAgain = await call('POST', `/api/pricelists/${list.id}/items/from-catalog`, { token: A.token, body: { productIds: [asado.data.id, sinCat.id] } });
  check('no duplica los que ya están', addAgain.data.added === 1 && addAgain.data.skipped === 1, JSON.stringify(addAgain.data));
  check('un artículo repetido (uno a uno) -> 409', (await call('POST', `/api/pricelists/${list.id}/items`, { token: A.token, body: { productId: vacio.id } })).status === 409);
  check('B no puede agregar artículos de A a su lista', (await call('POST', `/api/pricelists/${(await call('POST', '/api/pricelists', { token: B.token, body: { name: 'L' } })).data.id}/items/from-catalog`, { token: B.token, body: { productIds: [vacio.id] } })).data.added === 0);
  const manual = (await call('POST', `/api/pricelists/${list.id}/items`, { token: A.token, body: { productName: 'Combo parrillero', price: 30000, unit: 'combo', category: 'Combos', badge: 'NUEVO' } })).data;
  check('agrega un ítem manual', !!manual.id && manual.productId === null);

  let lists = (await call('GET', '/api/pricelists', { token: A.token })).data;
  let mine = lists.find((l) => l.id === list.id);
  check('la lista resuelve ítems enlazados con datos del catálogo', mine.items.filter((i) => i.linked).length === 5 && byName(mine.items, 'Asado de tira').unit === 'kg' && byName(mine.items, 'Asado de tira').imageUrl === img.url);
  check('el ítem manual no está enlazado', byName(mine.items, 'Combo parrillero').linked === false);
  check('editar un ítem enlazado -> 400 (se edita en el catálogo)', (await call('PUT', `/api/pricelists/items/${byName(mine.items, 'Vacío').id}`, { token: A.token, body: { price: 1 } })).status === 400);
  check('un ítem enlazado sí puede cambiar de posición', (await call('PUT', `/api/pricelists/items/${byName(mine.items, 'Vacío').id}`, { token: A.token, body: { order: 9 } })).status === 200);
  check('editar un ítem manual funciona', (await call('PUT', `/api/pricelists/items/${manual.id}`, { token: A.token, body: { price: 31000 } })).data.price === 31000);
  await call('PUT', `/api/products/${vacio.id}`, { token: A.token, body: { internalCode: 'V2', name: 'Vacío', price: 15500, category: 'Vacuno', unit: 'kg' } });
  lists = (await call('GET', '/api/pricelists', { token: A.token })).data;
  check('cambiar el precio en el catálogo se refleja en la lista (dato vivo)', byName(lists.find((l) => l.id === list.id).items, 'Vacío').price === 15500);
  await call('PUT', `/api/products/${vacio.id}`, { token: A.token, body: { internalCode: 'V2', name: 'Vacío', price: 15000, category: 'Vacuno', unit: 'kg' } });

  console.log('Opciones de la lista y estilos de menú (lo que recibe la TV)');
  check('opciones de la lista', (await call('PUT', `/api/pricelists/${list.id}`, { token: A.token, body: { groupByCategory: true } })).data.groupByCategory === true);
  const reg = (await call('POST', '/api/screens/register')).data;
  await call('POST', '/api/screens/link', { token: A.token, body: { code: reg.code, name: 'Mostrador' } });
  const tv = (await call('GET', `/api/screens/check-pairing/${reg.code}`)).data;
  const assign = (menuStyle) => call('POST', `/api/screens/${reg.id}/assign`, { token: A.token, body: { priceListId: list.id, mediaIds: [], menuStyle } });
  check('asigna estilo "cards"', (await assign('cards')).status === 200);
  let sync = (await call('GET', `/api/screens/${reg.id}/sync`, { token: tv.token })).data;
  check('la TV recibe el estilo de menú', sync.menuStyle === 'cards');
  let pl = sync.playlist.items.find((i) => i.priceList).priceList;
  const tvAsado = byName(pl.items, 'Asado de tira');
  check('la TV recibe unidad, foto, etiqueta y precio anterior', tvAsado.unit === 'kg' && tvAsado.imageUrl === img.url && tvAsado.badge === 'OFERTA' && tvAsado.oldPrice === 13500 && tvAsado.price === 12000, JSON.stringify(tvAsado));
  check('compatibilidad: sigue enviando productName/price/description', tvAsado.productName === 'Asado de tira' && tvAsado.description === 'Corte tradicional');
  check('la TV recibe groupByCategory', pl.groupByCategory === true);
  check('sin stock se envía marcado (no se oculta por defecto)', byName(pl.items, 'Chorizo').available === false);
  await call('PUT', `/api/pricelists/${list.id}`, { token: A.token, body: { hideUnavailable: true } });
  sync = (await call('GET', `/api/screens/${reg.id}/sync`, { token: tv.token })).data;
  check('con "ocultar sin stock" el artículo no llega a la TV', !byName(sync.playlist.items.find((i) => i.priceList).priceList.items, 'Chorizo'));
  await assign('lista-rara');
  sync = (await call('GET', `/api/screens/${reg.id}/sync`, { token: tv.token })).data;
  check('estilo inválido -> "list"', sync.menuStyle === 'list');
  check('la TV no recibe el token ni datos internos', sync.tokenHash === undefined && sync.businessId === undefined);

  console.log('Precios masivos: vista previa y validaciones');
  const preview = (body) => call('POST', '/api/pricing/preview', { token: A.token, body });
  const p1 = await preview({ operation: 'percent', value: 10, roundStep: 100, roundDirection: 'nearest', scope: { type: 'categories', categories: ['Vacuno'] } });
  check('vista previa por categoría', p1.status === 200 && p1.data.count === 2 && byName(p1.data.rows, 'Asado de tira').newPrice === 13200 && byName(p1.data.rows, 'Vacío').newPrice === 16500, JSON.stringify(p1.data.rows));
  check('la vista previa no cambia nada', (await call('GET', '/api/products', { token: A.token })).data.find((p) => p.id === vacio.id).price === 15000);
  const p2 = await preview({ operation: 'amount', value: 100, scope: { type: 'categories', categories: [''] } });
  check('categoría vacía = sin categoría', p2.data.count === 1 && p2.data.rows[0].name === 'Carbón 3 kg');
  const p3 = await preview({ operation: 'percent', value: 5, scope: { type: 'products', productIds: [pollo.id, imgB.id, 'no-existe'] } });
  check('solo toma artículos del propio negocio', p3.data.count === 1 && p3.data.rows[0].name === 'Pollo entero');
  const p4 = await preview({ operation: 'percent', value: 10, scope: { type: 'all', includeManual: true } });
  check('incluye ítems manuales si se pide', p4.data.rows.some((r) => r.type === 'priceItem' && r.name.startsWith('Combo parrillero')));
  check('sin includeManual no los toca', !(await preview({ operation: 'percent', value: 10, scope: { type: 'all' } })).data.rows.some((r) => r.type === 'priceItem'));
  for (const [label, body] of [
    ['porcentaje -95', { operation: 'percent', value: -95 }], ['valor 0', { operation: 'percent', value: 0 }],
    ['redondeo 7', { operation: 'percent', value: 5, roundStep: 7 }], ['operación inválida', { operation: 'x', value: 5 }],
    ['categorías vacías', { operation: 'percent', value: 5, scope: { type: 'categories', categories: [] } }]
  ]) check(`rechaza ${label}`, (await preview(body)).status === 400);
  check('B no ve ni afecta artículos de A', (await call('POST', '/api/pricing/preview', { token: B.token, body: { operation: 'percent', value: 10 } })).data.count === 0);

  console.log('Precios masivos: aplicar, historial y deshacer');
  const rule = { operation: 'percent', value: 10, roundStep: 100, roundDirection: 'nearest', scope: { type: 'categories', categories: ['Vacuno'] } };
  const applied = await call('POST', '/api/pricing/changes', { token: A.token, body: { ...rule, note: 'Suba semanal' } });
  check('aplica ahora', applied.status === 201 && applied.data.status === 'applied' && applied.data.affectedCount === 2 && applied.data.description.startsWith('Suba semanal'), JSON.stringify(applied.data));
  let products = (await call('GET', '/api/products', { token: A.token })).data;
  check('los precios del catálogo cambiaron', byName(products, 'Asado de tira').price === 13200 && byName(products, 'Vacío').price === 16500 && byName(products, 'Pollo entero').price === 4000);
  sync = (await call('GET', `/api/screens/${reg.id}/sync`, { token: tv.token })).data;
  check('la TV ve el precio nuevo sin tocar la lista', byName(sync.playlist.items.find((i) => i.priceList).priceList.items, 'Asado de tira').price === 13200);
  const history = (await call('GET', '/api/pricing/changes', { token: A.token })).data;
  check('queda en el historial', history.length === 1 && history[0].id === applied.data.id);
  const detail = (await call('GET', `/api/pricing/changes/${applied.data.id}`, { token: A.token })).data;
  check('el detalle guarda precio anterior y nuevo', detail.items.length === 2 && detail.items.some((i) => i.name === 'Vacío' && i.oldPrice === 15000 && i.newPrice === 16500));
  check('B no ve el historial de A', (await call('GET', '/api/pricing/changes', { token: B.token })).data.length === 0);
  check('B no ve el detalle de A', (await call('GET', `/api/pricing/changes/${applied.data.id}`, { token: B.token })).status === 404);
  check('B no puede deshacer cambios de A', (await call('POST', `/api/pricing/changes/${applied.data.id}/undo`, { token: B.token })).status === 404);

  // Alguien edita un artículo después del cambio: el deshacer no debe pisarlo
  await call('PUT', `/api/products/${vacio.id}`, { token: A.token, body: { internalCode: 'V2', name: 'Vacío', price: 17000, category: 'Vacuno', unit: 'kg' } });
  const undo = await call('POST', `/api/pricing/changes/${applied.data.id}/undo`, { token: A.token });
  check('deshacer restaura lo que sigue igual y respeta lo editado después', undo.status === 200 && undo.data.reverted === 1 && undo.data.skipped === 1, JSON.stringify(undo.data));
  products = (await call('GET', '/api/products', { token: A.token })).data;
  check('el artículo editado después conserva su precio', byName(products, 'Vacío').price === 17000 && byName(products, 'Asado de tira').price === 12000);
  check('no se puede deshacer dos veces', (await call('POST', `/api/pricing/changes/${applied.data.id}/undo`, { token: A.token })).status === 400);
  check('el estado queda "undone"', (await call('GET', `/api/pricing/changes/${applied.data.id}`, { token: A.token })).data.status === 'undone');
  await call('PUT', `/api/products/${vacio.id}`, { token: A.token, body: { internalCode: 'V2', name: 'Vacío', price: 15000, category: 'Vacuno', unit: 'kg' } });

  const incl = await call('POST', '/api/pricing/changes', { token: A.token, body: { operation: 'amount', value: -1000, scope: { type: 'all', includeManual: true } } });
  const listAfter = (await call('GET', '/api/pricelists', { token: A.token })).data.find((l) => l.id === list.id);
  check('"todo + manuales" ajusta catálogo y ítems manuales', incl.data.status === 'applied' && byName(listAfter.items, 'Combo parrillero').price === 30000 && byName(listAfter.items, 'Pollo entero').price === 3000, JSON.stringify(incl.data));
  await call('POST', `/api/pricing/changes/${incl.data.id}/undo`, { token: A.token });
  check('deshacer también restaura los manuales', byName((await call('GET', '/api/pricelists', { token: A.token })).data.find((l) => l.id === list.id).items, 'Combo parrillero').price === 31000);

  console.log('Precios masivos: programación');
  const future = (ms) => new Date(Date.now() + ms).toISOString();
  check('fecha pasada -> 400', (await call('POST', '/api/pricing/changes', { token: A.token, body: { ...rule, scheduledFor: future(-60000) } })).status === 400);
  check('fecha inválida -> 400', (await call('POST', '/api/pricing/changes', { token: A.token, body: { ...rule, scheduledFor: 'mañana' } })).status === 400);
  check('más de un año -> 400', (await call('POST', '/api/pricing/changes', { token: A.token, body: { ...rule, scheduledFor: future(400 * 24 * 3600 * 1000) } })).status === 400);
  const far = await call('POST', '/api/pricing/changes', { token: A.token, body: { ...rule, scheduledFor: future(24 * 3600 * 1000) } });
  check('programa un cambio a futuro (queda pendiente, no cambia precios)', far.status === 201 && far.data.status === 'pending' && byName((await call('GET', '/api/products', { token: A.token })).data, 'Vacío').price === 15000);
  check('B no puede cancelar el de A', (await call('POST', `/api/pricing/changes/${far.data.id}/cancel`, { token: B.token })).status === 400);
  check('cancela un cambio programado', (await call('POST', `/api/pricing/changes/${far.data.id}/cancel`, { token: A.token })).status === 200 && (await call('GET', `/api/pricing/changes/${far.data.id}`, { token: A.token })).data.status === 'cancelled');
  check('no se puede cancelar uno ya cancelado/aplicado', (await call('POST', `/api/pricing/changes/${applied.data.id}/cancel`, { token: A.token })).status === 400);
  check('no se puede deshacer uno que no se aplicó', (await call('POST', `/api/pricing/changes/${far.data.id}/undo`, { token: A.token })).status === 400);

  const soon = await call('POST', '/api/pricing/changes', { token: A.token, body: { operation: 'percent', value: 10, roundStep: 100, scope: { type: 'categories', categories: ['Pollo'] }, scheduledFor: future(35000) } });
  check('programa un cambio para dentro de ~35 s', soon.status === 201 && soon.data.status === 'pending');
  process.stdout.write('       esperando al programador (hasta 90 s)');
  let state = 'pending';
  for (let i = 0; i < 30 && state === 'pending'; i++) {
    await sleep(3000);
    process.stdout.write('.');
    state = (await call('GET', `/api/pricing/changes/${soon.data.id}`, { token: A.token })).data.status;
  }
  process.stdout.write('\n');
  check('el programador lo aplica solo a la hora indicada', state === 'applied');
  check('el precio programado quedó aplicado', byName((await call('GET', '/api/products', { token: A.token })).data, 'Pollo entero').price === 4400);

  console.log('Importación CSV con columnas nuevas');
  const csv = 'codigo_interno;nombre;precio;categoria;unidad;precio_anterior;etiqueta;disponible\r\nN1;Bife angosto;14.000;Vacuno;kg;15.500;OFERTA;si\r\nN2;Costilla;9.900;Cerdo;kg;;;no\r\nN3;Mal;abc;Cerdo;kg;;;\r\n';
  const form = new FormData();
  form.append('file', new Blob(['﻿' + csv], { type: 'text/csv' }), 'cat.csv');
  const imp = await call('POST', '/api/products/upload-csv', { token: A.token, form });
  check('importa categoría, unidad, precio anterior, etiqueta y stock', imp.status === 201 && imp.data.created === 2 && imp.data.errors.length === 1, JSON.stringify(imp.data));
  products = (await call('GET', '/api/products', { token: A.token })).data;
  const bife = byName(products, 'Bife angosto');
  check('los datos se guardaron bien', bife.price === 14000 && bife.category === 'Vacuno' && bife.unit === 'kg' && bife.oldPrice === 15500 && bife.badge === 'OFERTA' && bife.available === true && byName(products, 'Costilla').available === false);
  const form2 = new FormData();
  form2.append('file', new Blob(['codigo_interno,nombre,precio\nN1,Bife angosto,16000\n'], { type: 'text/csv' }), 'solo-precio.csv');
  await call('POST', '/api/products/upload-csv', { token: A.token, form: form2 });
  const bife2 = byName((await call('GET', '/api/products', { token: A.token })).data, 'Bife angosto');
  check('un CSV sin esas columnas actualiza el precio sin borrar categoría, unidad ni etiqueta', bife2.price === 16000 && bife2.category === 'Vacuno' && bife2.unit === 'kg' && bife2.badge === 'OFERTA' && bife2.oldPrice === 15500);

  console.log('Borrados en cascada');
  await call('DELETE', `/api/products/${pollo.id}`, { token: A.token });
  const afterDel = (await call('GET', '/api/pricelists', { token: A.token })).data.find((l) => l.id === list.id);
  check('al borrar un artículo del catálogo desaparece de las listas', !byName(afterDel.items, 'Pollo entero'));
  await call('DELETE', `/api/media/${img.id}`, { token: A.token });
  check('al borrar la foto el artículo queda sin foto (no se rompe)', (await call('GET', '/api/products', { token: A.token })).data.find((p) => p.id === asado.data.id).image === null);

  for (const b of [A, B]) await call('DELETE', `/api/admin/businesses/${b.id}`, { token: admin.token });
  console.log(`\n${passed} correctas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
