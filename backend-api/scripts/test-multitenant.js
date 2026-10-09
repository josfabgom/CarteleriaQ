// Pruebas de integración del multi-negocio. Uso: node scripts/test-multitenant.js
// Requiere el backend en http://localhost:3000 y ADMIN_USERNAME/ADMIN_PASSWORD (de ../.env o del entorno).
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

const login = async (username, password) => (await call('POST', '/api/auth/login', { body: { username, password } }));

// PNG 1x1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const upload = (token, buf, name = 'x.png', type = 'image/png') => {
  const form = new FormData();
  form.append('file', new Blob([buf], { type }), name);
  return call('POST', '/api/media/upload', { token, form });
};

(async () => {
  const stamp = Date.now().toString(36);
  const userA = `negocio_a_${stamp}`;
  const userB = `negocio_b_${stamp}`;

  console.log('Autenticación');
  check('login con clave incorrecta -> 401', (await login(ADMIN_USER, 'incorrecta')).status === 401);
  check('usuario inexistente -> 401', (await login('nadie', 'x'.repeat(10))).status === 401);
  check('GET /api/screens sin token -> 401', (await call('GET', '/api/screens')).status === 401);
  check('token falso -> 401', (await call('GET', '/api/screens', { token: 'abc.def.ghi' })).status === 401);
  const admin = await login(ADMIN_USER, ADMIN_PASS);
  check('login administrador', admin.status === 200 && admin.data.role === 'superadmin');
  const adminToken = admin.data.token;

  console.log('Administración de negocios');
  check('admin no puede usar rutas de negocio -> 403', (await call('GET', '/api/screens', { token: adminToken })).status === 403);
  check('contraseña corta rechazada', (await call('POST', '/api/admin/businesses', { token: adminToken, body: { name: 'X', username: 'x1', password: '123' } })).status === 400);
  const a = await call('POST', '/api/admin/businesses', { token: adminToken, body: { name: 'Negocio A', username: userA, password: 'clave-a-12345', maxScreens: 1, storageLimitMb: 1 } });
  const b = await call('POST', '/api/admin/businesses', { token: adminToken, body: { name: 'Negocio B', username: userB, password: 'clave-b-12345', maxScreens: 2, storageLimitMb: 50 } });
  check('crear negocios A y B', a.status === 201 && b.status === 201);
  check('usuario duplicado -> 409', (await call('POST', '/api/admin/businesses', { token: adminToken, body: { name: 'Dup', username: userA, password: 'clave-a-12345' } })).status === 409);
  const A = (await login(userA, 'clave-a-12345')).data;
  const B = (await login(userB, 'clave-b-12345')).data;
  check('login de negocios', !!A?.token && !!B?.token && A.business.usage.maxScreens === 1);
  check('negocio no puede usar rutas de admin -> 403', (await call('GET', '/api/admin/businesses', { token: A.token })).status === 403);

  console.log('Aislamiento de datos');
  const listA = (await call('POST', '/api/pricelists', { token: A.token, body: { name: 'Lista A' } })).data;
  const itemA = (await call('POST', `/api/pricelists/${listA.id}/items`, { token: A.token, body: { productName: 'Pizza', price: 100 } })).data;
  check('B no ve las listas de A', (await call('GET', '/api/pricelists', { token: B.token })).data.length === 0);
  check('B no puede agregar ítems a la lista de A', (await call('POST', `/api/pricelists/${listA.id}/items`, { token: B.token, body: { productName: 'X', price: 1 } })).status === 404);
  check('B no puede editar un ítem de A', (await call('PUT', `/api/pricelists/items/${itemA.id}`, { token: B.token, body: { productName: 'Hack', price: 1 } })).status === 404);
  check('B no puede borrar un ítem de A', (await call('DELETE', `/api/pricelists/items/${itemA.id}`, { token: B.token })).status === 404);
  check('B no puede borrar la lista de A', (await call('DELETE', `/api/pricelists/${listA.id}`, { token: B.token })).status === 404);
  const prodA = (await call('POST', '/api/products', { token: A.token, body: { internalCode: 'C1', name: 'Prod', price: 5 } })).data;
  const prodB = await call('POST', '/api/products', { token: B.token, body: { internalCode: 'C1', name: 'Prod B', price: 7 } });
  check('mismo código interno permitido en negocios distintos', prodB.status === 201);
  check('B no ve productos de A', (await call('GET', '/api/products', { token: B.token })).data.every((p) => p.name !== 'Prod'));
  check('B no puede editar un producto de A', (await call('PUT', `/api/products/${prodA.id}`, { token: B.token, body: { name: 'Hack', price: 1 } })).status === 404);
  check('B no puede borrar un producto de A', (await call('DELETE', `/api/products/${prodA.id}`, { token: B.token })).status === 404);

  console.log('Medios y cuota de espacio');
  const up = await upload(A.token, PNG);
  check('A sube una imagen', up.status === 201 && up.data.url.startsWith(`/uploads/${A.business.id}/`), JSON.stringify(up.data));
  const file = await fetch(BASE + up.data.url);
  check('la imagen se sirve', file.status === 200);
  check('B no ve los medios de A', (await call('GET', '/api/media', { token: B.token })).data.length === 0);
  check('B no puede borrar medios de A', (await call('DELETE', `/api/media/${up.data.id}`, { token: B.token })).status === 404);
  check('rechaza archivos que no son imagen/video', (await upload(A.token, Buffer.from('hola'), 'x.txt', 'text/plain')).status === 400);
  const big = await upload(A.token, Buffer.alloc(2 * 1024 * 1024, 1), 'grande.png');
  check('supera la cuota de 1 MB -> 413', big.status === 413, JSON.stringify(big.data));
  const me = (await call('GET', '/api/auth/me', { token: A.token })).data;
  check('uso de espacio reportado', me.business.usage.storageUsedBytes === PNG.length);

  console.log('Importación de catálogo (CSV)');
  const uploadCsv = (token, text, name = 'catalogo.csv') => {
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'text/csv' }), name);
    return call('POST', '/api/products/upload-csv', { token, form });
  };
  // Como lo guarda Excel en español: punto y coma, BOM, CRLF, precios con formato local
  const excelCsv = '﻿Código Interno;Nombre;Descripción;Precio\r\n' +
    'X1;Pizza Muzzarella;Salsa y muzzarella;9.500\r\n' +
    'X2;Empanada;Carne;$1.400\r\n' +
    'X3;Gaseosa;;2200,50\r\n' +
    'X4;;Sin nombre;100\r\n' +
    'X5;Plato raro;;gratis\r\n';
  const imp1 = await uploadCsv(A.token, excelCsv);
  check('importa CSV de Excel (; + BOM + CRLF)', imp1.status === 201 && imp1.data.created === 3 && imp1.data.updated === 0, JSON.stringify(imp1.data));
  check('informa las 2 filas rechazadas con motivo', imp1.data.errors?.length === 2 && /falta el nombre/.test(imp1.data.errors[0]) && /precio inválido/.test(imp1.data.errors[1]), JSON.stringify(imp1.data.errors));
  const prods = (await call('GET', '/api/products', { token: A.token })).data;
  const byCode = Object.fromEntries(prods.map((p) => [p.internalCode, p]));
  check('precios con formato local bien interpretados', byCode.X1?.price === 9500 && byCode.X2?.price === 1400 && byCode.X3?.price === 2200.5, JSON.stringify(prods.map((p) => [p.internalCode, p.price])));
  check('tildes y descripción conservadas', byCode.X1?.name === 'Pizza Muzzarella' && byCode.X1?.description === 'Salsa y muzzarella');
  const imp2 = await uploadCsv(A.token, 'codigo_interno,nombre,precio\nX1,Pizza Muzzarella,10500\nX9,Nuevo,300\n');
  const prods2 = (await call('GET', '/api/products', { token: A.token })).data;
  check('reimportar actualiza por código sin duplicar', imp2.data.updated === 1 && imp2.data.created === 1 && prods2.filter((p) => p.internalCode === 'X1').length === 1 && prods2.find((p) => p.internalCode === 'X1').price === 10500, JSON.stringify(imp2.data));
  const imp3 = await uploadCsv(A.token, 'articulo,valor\nPizza,100\n');
  check('sin columna nombre -> 400 con mensaje claro', imp3.status === 400 && /nombre/.test(imp3.data.error), JSON.stringify(imp3.data));
  check('archivo vacío -> 400', (await uploadCsv(A.token, 'nombre,precio\n')).status === 400);
  check('B no ve los artículos importados por A', (await call('GET', '/api/products', { token: B.token })).data.every((p) => !['X1', 'X2', 'X3', 'X9'].includes(p.internalCode)));
  check('importar sin sesión -> 401', (await uploadCsv(undefined, excelCsv)).status === 401);

  console.log('Pantallas y límite del plan');
  const reg1 = (await call('POST', '/api/screens/register')).data;
  const reg2 = (await call('POST', '/api/screens/register')).data;
  check('link sin login -> 401', (await call('POST', '/api/screens/link', { body: { code: reg1.code, name: 'T' } })).status === 401);
  check('código inválido -> 404', (await call('POST', '/api/screens/link', { token: A.token, body: { code: 'ZZZZZZ', name: 'T' } })).status === 404);
  const link1 = await call('POST', '/api/screens/link', { token: A.token, body: { code: reg1.code, name: 'TV 1' } });
  check('A vincula su primera pantalla', link1.status === 200 && !link1.data.tokenHash && !link1.data.pairingToken);
  const link2 = await call('POST', '/api/screens/link', { token: A.token, body: { code: reg2.code, name: 'TV 2' } });
  check('A supera su máximo de 1 pantalla -> 403', link2.status === 403, JSON.stringify(link2.data));
  const link2b = await call('POST', '/api/screens/link', { token: B.token, body: { code: reg2.code, name: 'TV B' } });
  check('B puede vincular esa otra pantalla', link2b.status === 200);
  check('un código ya usado no se puede reclamar de nuevo', (await call('POST', '/api/screens/link', { token: A.token, body: { code: reg1.code, name: 'Robo' } })).status === 404);

  const pair1 = (await call('GET', `/api/screens/check-pairing/${reg1.code}`)).data;
  const pair2 = (await call('GET', `/api/screens/check-pairing/${reg2.code}`)).data;
  check('la TV recibe su token al vincularse', pair1.linked && typeof pair1.token === 'string' && pair1.screenId === reg1.id);

  console.log('Sincronización de la TV');
  check('sync sin token -> 401', (await call('GET', `/api/screens/${reg1.id}/sync`)).status === 401);
  check('sync con token inválido -> 401', (await call('GET', `/api/screens/${reg1.id}/sync`, { token: 'x'.repeat(64) })).status === 401);
  check('token de la TV de B no sirve en la TV de A -> 401', (await call('GET', `/api/screens/${reg1.id}/sync`, { token: pair2.token })).status === 401);
  check('sync de pantalla inexistente -> 401', (await call('GET', '/api/screens/00000000-0000-0000-0000-000000000000/sync', { token: pair1.token })).status === 401);
  const sync = await call('GET', `/api/screens/${reg1.id}/sync`, { token: pair1.token });
  check('sync con su token', sync.status === 200 && sync.data.id === reg1.id && !sync.data.tokenHash && !sync.data.pairingToken);
  check('tras el primer sync ya no se entrega el token en claro', (await call('GET', `/api/screens/check-pairing/${reg1.code}`)).status === 404);
  check('token de pantalla no abre rutas del dashboard -> 401', (await call('GET', '/api/screens', { token: pair1.token })).status === 401);

  console.log('Asignación de contenido');
  const listB = (await call('POST', '/api/pricelists', { token: B.token, body: { name: 'Lista B' } })).data;
  check('A no puede asignar la lista de B -> 400', (await call('POST', `/api/screens/${reg1.id}/assign`, { token: A.token, body: { priceListId: listB.id, mediaIds: [] } })).status === 400);
  check('B no puede asignar contenido a la pantalla de A -> 404', (await call('POST', `/api/screens/${reg1.id}/assign`, { token: B.token, body: { priceListId: listB.id, mediaIds: [] } })).status === 404);
  const assign = await call('POST', `/api/screens/${reg1.id}/assign`, { token: A.token, body: { priceListId: listA.id, mediaIds: [up.data.id], layout: 'split' } });
  check('A asigna su lista y su imagen', assign.status === 200);
  const sync2 = (await call('GET', `/api/screens/${reg1.id}/sync`, { token: pair1.token })).data;
  check('la TV recibe el contenido asignado', sync2.playlist.items.length === 2);
  check('B no ve las pantallas de A', (await call('GET', '/api/screens', { token: B.token })).data.every((s) => s.id !== reg1.id));
  check('B no puede borrar la pantalla de A -> 404', (await call('DELETE', `/api/screens/${reg1.id}`, { token: B.token })).status === 404);

  console.log('Suspensión y borrado de un negocio');
  await call('PUT', `/api/admin/businesses/${a.data.id}`, { token: adminToken, body: { active: false } });
  check('negocio suspendido pierde el acceso -> 403', (await call('GET', '/api/pricelists', { token: A.token })).status === 403);
  check('negocio suspendido no puede iniciar sesión -> 403', (await login(userA, 'clave-a-12345')).status === 403);
  await call('PUT', `/api/admin/businesses/${a.data.id}`, { token: adminToken, body: { active: true, password: 'nueva-clave-99', storageLimitMb: 5 } });
  check('reactivar y cambiar contraseña', (await login(userA, 'nueva-clave-99')).status === 200 && (await login(userA, 'clave-a-12345')).status === 401);
  const del = await call('DELETE', `/api/admin/businesses/${a.data.id}`, { token: adminToken });
  check('el admin borra el negocio A', del.status === 200);
  check('tras borrar, la TV de A ya no puede sincronizar -> 401', (await call('GET', `/api/screens/${reg1.id}/sync`, { token: pair1.token })).status === 401);
  check('tras borrar, el usuario de A ya no existe', (await login(userA, 'nueva-clave-99')).status === 401);
  check('los datos de B siguen intactos', (await call('GET', '/api/pricelists', { token: B.token })).data.length === 1);
  await call('DELETE', `/api/admin/businesses/${b.data.id}`, { token: adminToken });

  console.log(`\n${passed} correctas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
