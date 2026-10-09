// Pruebas de integración de ciclos y escenas (precios, ofertas, media, texto).
// Uso: node scripts/test-cycles-api.js   (backend en http://localhost:3000, admin en ../.env)
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const upload = (token, name) => {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), name);
  return call('POST', '/api/media/upload', { token, form });
};

(async () => {
  const stamp = Date.now().toString(36);
  const admin = (await call('POST', '/api/auth/login', { body: { username: ADMIN_USER, password: ADMIN_PASS } })).data;
  const mkBusiness = async (tag) => {
    const user = `cyc_${tag}_${stamp}`;
    await call('POST', '/api/admin/businesses', { token: admin.token, body: { name: `Ciclos ${tag}`, username: user, password: 'clave-segura-123', maxScreens: 5, storageLimitMb: 50 } });
    const login = (await call('POST', '/api/auth/login', { body: { username: user, password: 'clave-segura-123' } })).data;
    return { token: login.token, id: login.business.id };
  };
  const A = await mkBusiness('a');
  const B = await mkBusiness('b');

  // Datos base
  const mkProduct = async (t, body) => (await call('POST', '/api/products', { token: t, body })).data;
  const asado = await mkProduct(A.token, { internalCode: 'V1', name: 'Asado de tira', price: 12000, oldPrice: 15000, category: 'Vacuno', unit: 'kg' }); // -20%
  const vacio = await mkProduct(A.token, { internalCode: 'V2', name: 'Vacío', price: 15000, oldPrice: 16000, category: 'Vacuno', unit: 'kg', badge: 'OFERTA' }); // -6%
  const pollo = await mkProduct(A.token, { internalCode: 'P1', name: 'Pollo entero', price: 4000, badge: 'Oferta', category: 'Pollo', unit: 'kg' }); // oferta por etiqueta
  const cerdo = await mkProduct(A.token, { internalCode: 'C1', name: 'Bondiola', price: 9000, category: 'Cerdo', unit: 'kg' }); // sin oferta
  const agotado = await mkProduct(A.token, { internalCode: 'X1', name: 'Costilla', price: 8000, oldPrice: 10000, category: 'Vacuno', available: false });
  const prodB = await mkProduct(B.token, { name: 'De otro negocio', price: 10 });
  const list = (await call('POST', '/api/pricelists', { token: A.token, body: { name: 'Mostrador' } })).data;
  await call('POST', `/api/pricelists/${list.id}/items/from-catalog`, { token: A.token, body: { productIds: [asado.id, vacio.id, pollo.id, cerdo.id] } });
  const listB = (await call('POST', '/api/pricelists', { token: B.token, body: { name: 'Lista B' } })).data;
  const img1 = (await upload(A.token, 'promo1.png')).data;
  const img2 = (await upload(A.token, 'promo2.png')).data;
  const imgB = (await upload(B.token, 'otro.png')).data;

  console.log('Crear ciclos y plantillas');
  const empty = await call('POST', '/api/cycles', { token: A.token, body: { name: 'Vacío' } });
  check('crea un ciclo vacío', empty.status === 201 && empty.data.scenes === 0);
  check('nombre obligatorio', (await call('POST', '/api/cycles', { token: A.token, body: { name: '  ' } })).status === 400);
  const tplPrices = await call('POST', '/api/cycles', { token: A.token, body: { name: 'Solo precios', template: 'prices' } });
  check('plantilla "prices": 1 escena', tplPrices.data.scenes === 1);
  const tplFull = await call('POST', '/api/cycles', { token: A.token, body: { name: 'Completo', template: 'full' } });
  check('plantilla "full": precios + ofertas + 2 imágenes', tplFull.data.scenes === 4, JSON.stringify(tplFull.data));
  const tplBadly = await call('POST', '/api/cycles', { token: A.token, body: { name: 'Plantilla inventada', template: 'otra' } });
  check('plantilla desconocida -> ciclo vacío', tplBadly.status === 201 && tplBadly.data.scenes === 0);
  const noList = await call('POST', '/api/cycles', { token: B.token, body: { name: 'B sin listas', template: 'prices' } });
  check('plantilla sin datos disponibles no falla', noList.status === 201);
  const tplDetail = (await call('GET', `/api/cycles/${tplFull.data.id}`, { token: A.token })).data;
  check('la plantilla trae precios, ofertas y medios en orden', tplDetail.scenes.map((s) => s.type).join(',') === 'prices,offers,media,media');

  console.log('Validación de escenas');
  const cycle = (await call('POST', '/api/cycles', { token: A.token, body: { name: 'Ciclo carnicería' } })).data;
  const put = (scenes, token = A.token, id = cycle.id) => call('PUT', `/api/cycles/${id}/scenes`, { token, body: { scenes } });
  const bad = async (label, scenes, token) => check(`rechaza ${label}`, (await put(scenes, token)).status === 400);
  await bad('tipo inválido', [{ type: 'cohete', duration: 10 }]);
  await bad('duración menor al mínimo', [{ type: 'text', duration: 1, config: { title: 'x' } }]);
  await bad('duración mayor al máximo', [{ type: 'text', duration: 9999, config: { title: 'x' } }]);
  await bad('duración no numérica', [{ type: 'text', duration: 'mucho', config: { title: 'x' } }]);
  await bad('precios sin lista', [{ type: 'prices', duration: 10 }]);
  await bad('lista de otro negocio', [{ type: 'prices', duration: 10, priceListId: listB.id }]);
  await bad('imagen de otro negocio', [{ type: 'media', duration: 10, mediaId: imgB.id }]);
  await bad('promo al costado de otro negocio', [{ type: 'prices', duration: 10, priceListId: list.id, config: { sideMediaIds: [imgB.id] } }]);
  await bad('media sin archivo', [{ type: 'media', duration: 10 }]);
  await bad('ofertas manuales sin artículos', [{ type: 'offers', duration: 10, config: { source: 'manual', productIds: [] } }]);
  await bad('ofertas con artículo de otro negocio', [{ type: 'offers', duration: 10, config: { source: 'manual', productIds: [prodB.id] } }]);
  await bad('texto sin título', [{ type: 'text', duration: 10, config: { title: '   ' } }]);
  await bad('más de 30 escenas', Array.from({ length: 31 }, () => ({ type: 'text', duration: 5, config: { title: 'x' } })));
  check('lo que no es una lista -> 400', (await call('PUT', `/api/cycles/${cycle.id}/scenes`, { token: A.token, body: { scenes: 'no' } })).status === 400);
  check('B no puede editar el ciclo de A', (await put([{ type: 'text', duration: 5, config: { title: 'x' } }], B.token)).status === 404);

  console.log('Guardar un ciclo completo y leerlo');
  const full = [
    { type: 'prices', name: 'Precios de Vacuno', duration: 20, priceListId: list.id, config: { style: 'cards', categories: ['Vacuno'], sideMediaIds: [img1.id, img2.id] } },
    { type: 'offers', duration: 12, config: { source: 'auto', design: 'hero', maxItems: 8, title: 'OFERTAS DE LA SEMANA' } },
    { type: 'media', duration: 8, mediaId: img1.id },
    { type: 'text', duration: 6, config: { title: 'Hoy 10% pagando en efectivo', subtitle: 'Solo por hoy', theme: 'green' } },
    { type: 'media', duration: 8, mediaId: img2.id, enabled: false }
  ];
  const saved = await put(full);
  check('guarda 5 escenas', saved.status === 200 && saved.data.scenes === 5, JSON.stringify(saved.data));
  const got = (await call('GET', `/api/cycles/${cycle.id}`, { token: A.token })).data;
  check('se leen en el mismo orden', got.scenes.map((s) => s.type).join(',') === 'prices,offers,media,text,media');
  check('la duración total cuenta solo las activas', got.totalSeconds === 46, String(got.totalSeconds));
  check('trae lo referenciado (lista y promos al costado)', got.scenes[0].refs.priceListName === 'Mostrador' && got.scenes[0].refs.sideMedia.length === 2);
  check('normaliza la configuración', got.scenes[0].config.style === 'cards' && got.scenes[1].config.title === 'OFERTAS DE LA SEMANA' && got.scenes[3].config.theme === 'green');
  const norm = await put([{ type: 'offers', duration: 10, config: { design: 'raro', maxItems: 999, source: 'x' } }]);
  const normGot = (await call('GET', `/api/cycles/${cycle.id}`, { token: A.token })).data;
  check('valores fuera de rango se corrigen (diseño, máximo, fuente)', norm.status === 200 && normGot.scenes[0].config.design === 'hero' && normGot.scenes[0].config.maxItems === 24 && normGot.scenes[0].config.source === 'auto', JSON.stringify(normGot.scenes[0].config));
  await put(full);
  const renamed = await call('PUT', `/api/cycles/${cycle.id}`, { token: A.token, body: { name: 'Ciclo carnicería v2' } });
  check('renombra', renamed.status === 200 && (await call('GET', `/api/cycles/${cycle.id}`, { token: A.token })).data.name === 'Ciclo carnicería v2');

  console.log('Lo que recibe la TV (varias pantallas con el mismo ciclo)');
  const mkScreen = async (name) => {
    const reg = (await call('POST', '/api/screens/register')).data;
    await call('POST', '/api/screens/link', { token: A.token, body: { code: reg.code, name } });
    const tv = (await call('GET', `/api/screens/check-pairing/${reg.code}`)).data;
    return { id: reg.id, token: tv.token };
  };
  const tv1 = await mkScreen('TV 1');
  const tv2 = await mkScreen('TV 2');
  check('asigna el ciclo a la pantalla 1', (await call('POST', `/api/screens/${tv1.id}/cycle`, { token: A.token, body: { playlistId: cycle.id, transition: 'slide' } })).status === 200);
  check('y a la pantalla 2 (compartido)', (await call('POST', `/api/screens/${tv2.id}/cycle`, { token: A.token, body: { playlistId: cycle.id } })).status === 200);
  const sync = async (tv) => (await call('GET', `/api/screens/${tv.id}/sync`, { token: tv.token })).data;
  let s1 = await sync(tv1);
  const s2 = await sync(tv2);
  check('la transición elegida llega a la TV', s1.transition === 'slide');
  check('las escenas llegan en orden (la pausada se omite)', s1.scenes.map((s) => s.type).join(',') === 'prices,offers,media,text', s1.scenes.map((s) => s.type).join(','));
  check('ambas pantallas reciben el mismo ciclo', JSON.stringify(s1.scenes) === JSON.stringify(s2.scenes));
  const sp = s1.scenes[0];
  check('precios: estilo, título, filtro por categoría y promos al costado', sp.style === 'cards' && sp.name === 'Precios de Vacuno' && sp.priceList.items.length === 2 && sp.priceList.items.every((i) => i.category === 'Vacuno') && sp.side.length === 2, JSON.stringify(sp.priceList.items.map((i) => i.name)));
  const so = s1.scenes[1];
  check('ofertas: diseño, título y solo artículos en oferta y con stock', so.design === 'hero' && so.name === 'OFERTAS DE LA SEMANA' && so.items.map((i) => i.name).join(',') === 'Asado de tira,Vacío,Pollo entero', so.items.map((i) => i.name).join(','));
  check('ofertas: descuento calculado y orden por descuento', so.items[0].discountPercent === 20 && so.items[1].discountPercent === 6 && so.items[2].discountPercent === null);
  check('ofertas: no incluye lo que no está en oferta ni lo agotado', !so.items.some((i) => i.name === 'Bondiola' || i.name === 'Costilla'));
  check('media y texto llegan completos', s1.scenes[2].media.url === img1.url && s1.scenes[3].title.startsWith('Hoy 10%') && s1.scenes[3].theme === 'green');
  check('compatibilidad: el formato anterior (playlist) sigue presente', Array.isArray(s1.playlist.items));

  console.log('Las ofertas se calculan en vivo');
  await call('PUT', `/api/products/${cerdo.id}`, { token: A.token, body: { internalCode: 'C1', name: 'Bondiola', price: 9000, oldPrice: 12000, category: 'Cerdo', unit: 'kg' } });
  s1 = await sync(tv1);
  check('un artículo con precio anterior entra solo a las ofertas', s1.scenes[1].items.some((i) => i.name === 'Bondiola' && i.discountPercent === 25) && s1.scenes[1].items[0].name === 'Bondiola');
  await call('PATCH', `/api/products/${asado.id}/availability`, { token: A.token, body: { available: false } });
  s1 = await sync(tv1);
  check('un artículo sin stock sale de las ofertas', !s1.scenes[1].items.some((i) => i.name === 'Asado de tira'));
  await call('PUT', `/api/products/${vacio.id}`, { token: A.token, body: { internalCode: 'V2', name: 'Vacío', price: 15000, category: 'Vacuno', unit: 'kg', badge: '' } });
  await call('PUT', `/api/products/${pollo.id}`, { token: A.token, body: { internalCode: 'P1', name: 'Pollo entero', price: 4000, category: 'Pollo', unit: 'kg' } });
  await call('PUT', `/api/products/${cerdo.id}`, { token: A.token, body: { internalCode: 'C1', name: 'Bondiola', price: 9000, category: 'Cerdo', unit: 'kg' } });
  s1 = await sync(tv1);
  check('sin ofertas vigentes la escena se omite (no queda vacía)', s1.scenes.map((s) => s.type).join(',') === 'prices,media,text', s1.scenes.map((s) => s.type).join(','));
  const prev = (await call('GET', `/api/cycles/${cycle.id}/preview`, { token: A.token })).data;
  check('la vista previa marca la escena sin ofertas', prev.scenes[1].shown === false && prev.scenes[1].count === 0 && prev.scenes[0].shown === true && prev.scenes[0].count === 2);
  check('la vista previa calcula la duración real del ciclo', prev.totalSeconds === 34, String(prev.totalSeconds));
  await call('PUT', `/api/products/${asado.id}`, { token: A.token, body: { internalCode: 'V1', name: 'Asado de tira', price: 12000, oldPrice: 15000, category: 'Vacuno', unit: 'kg', available: true } });
  s1 = await sync(tv1);
  check('al volver a haber ofertas la escena reaparece', s1.scenes.map((s) => s.type).join(',') === 'prices,offers,media,text');

  console.log('Ofertas elegidas a mano y filtros');
  await put([
    { type: 'offers', duration: 10, config: { source: 'manual', design: 'grid', productIds: [cerdo.id, pollo.id], title: 'Elegidos' } },
    { type: 'offers', duration: 10, config: { source: 'auto', categories: ['Pollo'] } },
    { type: 'prices', duration: 10, priceListId: list.id, config: { style: 'list', categories: [''] } }
  ]);
  s1 = await sync(tv1);
  check('manual: respeta el orden elegido aunque no estén "en oferta"', s1.scenes[0].items.map((i) => i.name).join(',') === 'Bondiola,Pollo entero' && s1.scenes[0].design === 'grid');
  check('auto con filtro de categoría (sin ofertas en Pollo -> se omite)', !s1.scenes.some((s) => s.name === 'OFERTAS' && s.type === 'offers'));
  check('precios: sin artículos que cumplan el filtro la escena se omite', !s1.scenes.some((s) => s.type === 'prices'));

  console.log('Aislamiento entre negocios');
  check('B no ve los ciclos de A', (await call('GET', '/api/cycles', { token: B.token })).data.every((c) => c.id !== cycle.id));
  check('B no puede leer el ciclo de A', (await call('GET', `/api/cycles/${cycle.id}`, { token: B.token })).status === 404);
  check('B no puede ver su vista previa', (await call('GET', `/api/cycles/${cycle.id}/preview`, { token: B.token })).status === 404);
  check('B no puede renombrarlo', (await call('PUT', `/api/cycles/${cycle.id}`, { token: B.token, body: { name: 'hack' } })).status === 404);
  check('B no puede duplicarlo', (await call('POST', `/api/cycles/${cycle.id}/duplicate`, { token: B.token })).status === 404);
  check('B no puede borrarlo', (await call('DELETE', `/api/cycles/${cycle.id}`, { token: B.token })).status === 404);
  const regB = (await call('POST', '/api/screens/register')).data;
  await call('POST', '/api/screens/link', { token: B.token, body: { code: regB.code, name: 'TV de B' } });
  check('B no puede asignar el ciclo de A a su pantalla', (await call('POST', `/api/screens/${regB.id}/cycle`, { token: B.token, body: { playlistId: cycle.id } })).status === 400);
  check('A no puede asignar su ciclo a la pantalla de B', (await call('POST', `/api/screens/${regB.id}/cycle`, { token: A.token, body: { playlistId: cycle.id } })).status === 404);
  check('sin sesión -> 401', (await call('GET', '/api/cycles')).status === 401);

  console.log('Configuración rápida (ciclo propio de la pantalla)');
  await put(full);
  const quick = await call('POST', `/api/screens/${tv2.id}/assign`, { token: A.token, body: { priceListId: list.id, mediaIds: [img1.id, img2.id], layout: 'split', menuStyle: 'photo-list' } });
  check('crea un ciclo propio sin tocar el compartido', quick.status === 200 && quick.data.playlistId !== cycle.id);
  const sharedAfter = (await call('GET', `/api/cycles/${cycle.id}`, { token: A.token })).data;
  check('el ciclo compartido sigue intacto', sharedAfter.scenes.length === 5);
  s1 = await sync(tv1);
  const q2 = await sync(tv2);
  check('la pantalla 1 sigue con el ciclo compartido', s1.scenes.length === 4);
  check('"split": una escena de precios con las promos al costado', q2.scenes.length === 1 && q2.scenes[0].type === 'prices' && q2.scenes[0].side.length === 2 && q2.scenes[0].style === 'photo-list');
  const cyclesList = (await call('GET', '/api/cycles', { token: A.token })).data;
  const priv = cyclesList.find((c) => c.id === quick.data.playlistId);
  check('el ciclo propio figura como privado y usado por 1 pantalla', priv.private === true && priv.screens.length === 1 && priv.name.startsWith('Ciclo de '));
  await call('POST', `/api/screens/${tv2.id}/assign`, { token: A.token, body: { priceListId: list.id, mediaIds: [img1.id], layout: 'full-media', mediaDuration: 7 } });
  const q3 = await sync(tv2);
  check('reutiliza su ciclo propio: "full-media" -> escenas de imagen', q3.scenes.length === 1 && q3.scenes[0].type === 'media' && q3.scenes[0].duration === 7);
  check('no acumula ciclos propios', (await call('GET', '/api/cycles', { token: A.token })).data.filter((c) => c.private).length === 1);

  console.log('Duplicar, quitar y borrar');
  const dup = await call('POST', `/api/cycles/${cycle.id}/duplicate`, { token: A.token });
  const dupGot = (await call('GET', `/api/cycles/${dup.data.id}`, { token: A.token })).data;
  check('duplica con todas sus escenas', dup.status === 201 && dupGot.scenes.length === 5 && dupGot.name.endsWith('(copia)') && dupGot.private === false);
  check('quita el ciclo de una pantalla', (await call('POST', `/api/screens/${tv1.id}/cycle`, { token: A.token, body: { playlistId: null } })).status === 200 && (await sync(tv1)).scenes.length === 0);
  await call('POST', `/api/screens/${tv1.id}/cycle`, { token: A.token, body: { playlistId: cycle.id } });
  const del = await call('DELETE', `/api/cycles/${cycle.id}`, { token: A.token });
  const tv1After = await sync(tv1);
  check('borrar el ciclo deja las pantallas sin escenas (no se rompen)', del.status === 200 && tv1After.scenes.length === 0);
  check('el duplicado sigue existiendo', (await call('GET', `/api/cycles/${dup.data.id}`, { token: A.token })).status === 200);
  await call('POST', `/api/screens/${tv1.id}/cycle`, { token: A.token, body: { playlistId: dup.data.id } });
  await call('DELETE', `/api/media/${img1.id}`, { token: A.token });
  const afterMedia = await sync(tv1);
  check('borrar un archivo quita solo las escenas que lo usan', afterMedia.scenes.every((s) => !s.media || s.media.url !== img1.url) && afterMedia.scenes.length >= 1);

  for (const b of [A, B]) await call('DELETE', `/api/admin/businesses/${b.id}`, { token: admin.token });
  console.log(`\n${passed} correctas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
