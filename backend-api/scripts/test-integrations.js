// Pruebas de integración de la sincronización con Itegra (claves, vista previa, aplicar, seguridad) y del worker real.
// Uso: node scripts/test-integrations.js   (backend en http://localhost:3000, admin en ../.env)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  FAIL ${name} ${extra}`); }
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
  const stamp = Date.now().toString(36);
  const admin = (await call('POST', '/api/auth/login', { body: { username: ADMIN_USER, password: ADMIN_PASS } })).data;
  const mkBusiness = async (tag) => {
    const user = `itg_${tag}_${stamp}`;
    const created = await call('POST', '/api/admin/businesses', { token: admin.token, body: { name: `Itegra ${tag}`, username: user, password: 'clave-segura-123', maxScreens: 3, storageLimitMb: 50 } });
    const login = (await call('POST', '/api/auth/login', { body: { username: user, password: 'clave-segura-123' } })).data;
    return { token: login.token, id: login.business.id, admin: created.data };
  };
  const A = await mkBusiness('a');
  const B = await mkBusiness('b');

  const FP = 'HSQLDBTEST' + stamp;
  const sync = (key, body) => call('POST', '/api/integrations/itegra/sync', { token: key, body });
  const products = async (t) => (await call('GET', '/api/products', { token: t })).data;
  const byCode = (list, code) => list.find((p) => p.internalCode === code);

  const items1 = [
    { code: '1', name: 'ASADO DE TIRA', price: 12900, unit: 'kg' },
    { code: '2', name: 'CHORIZO COFRA X KG', price: 7200.5, unit: 'kg' },
    { code: '3', name: 'QUESO CREMOSO TREGAR', price: 9800, unit: 'kg' },
    { code: '4', name: 'MANZANA JAULA X KG', price: 2499.99, unit: 'kg' },
    { code: '5', name: 'EMPANADA DE POLLO', price: 1600, unit: 'unidad' }
  ];

  console.log('Claves de integración');
  const k1 = await call('POST', '/api/integrations/keys', { token: A.token, body: { name: 'PC del mostrador' } });
  const KEY = k1.data.key;
  check('crea la clave y la muestra una vez', k1.status === 201 && /^itg_[0-9a-f]{48}$/.test(KEY) && k1.data.prefix === KEY.slice(0, 8));
  const list1 = (await call('GET', '/api/integrations/keys', { token: A.token })).data;
  check('el listado no muestra la clave completa', list1.length === 1 && !JSON.stringify(list1).includes(KEY.slice(12)) && list1[0].linked === false);
  check('otro negocio no ve las claves', (await call('GET', '/api/integrations/keys', { token: B.token })).data.length === 0);
  check('pide nombre', (await call('POST', '/api/integrations/keys', { token: A.token, body: { name: ' ' } })).status === 400);
  check('sin sesión no se puede gestionar', (await call('GET', '/api/integrations/keys')).status === 401);

  console.log('Autenticación del worker');
  check('sin clave: 401', (await call('POST', '/api/integrations/itegra/sync', { body: { mode: 'ping', fingerprint: FP } })).status === 401);
  check('clave falsa: 401', (await sync('itg_' + '0'.repeat(48), { mode: 'ping', fingerprint: FP })).status === 401);
  check('el token de sesión no sirve como clave', (await sync(A.token, { mode: 'ping', fingerprint: FP })).status === 401);
  const ping = await sync(KEY, { mode: 'ping', fingerprint: FP });
  check('ping correcto devuelve el negocio', ping.status === 200 && ping.data.business === 'Itegra a');
  check('modo inválido: 400', (await sync(KEY, { mode: 'borrar', fingerprint: FP })).status === 400);
  check('sin identidad de base: 400', (await sync(KEY, { mode: 'preview', items: items1 })).status === 400);

  console.log('Vista previa');
  const prev = await sync(KEY, { mode: 'preview', fingerprint: FP, full: true, items: items1 });
  check('la vista previa cuenta lo que haría', prev.status === 200 && prev.data.created === 5 && prev.data.updated === 0 && prev.data.hidden === 0);
  check('muestra ejemplos con su categoría', prev.data.sampleCreated.length === 5 && prev.data.sampleCreated.find((s) => s.code === '3').category === 'Quesos');
  check('la vista previa no escribe nada', (await products(A.token)).length === 0);
  check('ni ata la clave a la base', (await call('GET', '/api/integrations/keys', { token: A.token })).data[0].linked === false);

  console.log('Aplicar');
  const ap = await sync(KEY, { mode: 'apply', fingerprint: FP, full: true, items: items1 });
  check('crea los artículos', ap.status === 200 && ap.data.created === 5);
  const p1 = await products(A.token);
  check('quedan en el negocio correcto y no en otro', p1.length === 5 && (await products(B.token)).length === 0);
  check('nombre prolijo, unidad y precio', byCode(p1, '2').name === 'Chorizo Cofra x kg' && byCode(p1, '2').unit === 'kg' && byCode(p1, '2').price === 7200.5 && byCode(p1, '5').unit === 'unidad');
  check('categoría automática', byCode(p1, '1').category === 'Carnes vacunas' && byCode(p1, '2').category === 'Embutidos y fiambres' && byCode(p1, '3').category === 'Quesos' && byCode(p1, '4').category === 'Frutas' && byCode(p1, '5').category === 'Comidas elaboradas');
  const keyAfter = (await call('GET', '/api/integrations/keys', { token: A.token })).data[0];
  check('la clave queda atada a la base y registra la sincronización', keyAfter.linked === true && keyAfter.fingerprint === FP && !!keyAfter.lastSyncAt && keyAfter.lastSummary.created === 5 && keyAfter.online === true);

  console.log('Atada a una sola base');
  const other = await sync(KEY, { mode: 'apply', fingerprint: 'OTRA_BASE', items: items1 });
  check('otra base con la misma clave: 409', other.status === 409 && other.data.code === 'fingerprint_mismatch');
  check('y no cambió nada', (await products(A.token)).length === 5);
  const key2 = (await call('POST', '/api/integrations/keys', { token: A.token, body: { name: 'Otra PC' } })).data;
  check('otra clave del mismo negocio puede atarse a otra base', (await sync(key2.key, { mode: 'preview', fingerprint: 'OTRA_BASE', items: items1 })).status === 200);
  await call('POST', `/api/integrations/keys/${key2.id}/unbind`, { token: A.token });
  check('desvincular permite re-atar', (await call('POST', `/api/integrations/keys/${keyAfter.id}/unbind`, { token: A.token })).status === 200 && (await sync(KEY, { mode: 'ping', fingerprint: 'BASE_NUEVA' })).status === 200);
  check('B no puede desvincular ni revocar la clave de A', (await call('POST', `/api/integrations/keys/${keyAfter.id}/unbind`, { token: B.token })).status === 404 && (await call('DELETE', `/api/integrations/keys/${keyAfter.id}`, { token: B.token })).status === 404);
  await sync(KEY, { mode: 'apply', fingerprint: FP, items: items1 }); // vuelve a atarse a FP (la ata el primer apply)
  const relinked = (await call('GET', '/api/integrations/keys', { token: A.token })).data.find((k) => k.id === keyAfter.id);
  check('re-atada a la base original', relinked.fingerprint === FP);

  console.log('Sincronizaciones siguientes');
  const again = await sync(KEY, { mode: 'apply', fingerprint: FP, items: items1 });
  check('sin cambios no toca nada', again.data.created === 0 && again.data.updated === 0 && again.data.unchanged === 5);

  // El negocio edita lo suyo en el panel
  const pa = byCode(await products(A.token), '1');
  await call('PUT', `/api/products/${pa.id}`, { token: A.token, body: { internalCode: '1', name: 'Asado de tira', price: 12900, category: 'Parrilla', unit: 'kg', oldPrice: 14500, badge: 'OFERTA' } });
  const items2 = items1.map((i) => (i.code === '1' ? { ...i, price: 13500 } : i));
  const upd = await sync(KEY, { mode: 'apply', fingerprint: FP, items: items2 });
  const p2 = byCode(await products(A.token), '1');
  check('cambia solo el precio que cambió en Itegra', upd.data.updated === 1 && p2.price === 13500);
  check('no pisa categoría, precio anterior ni etiqueta del panel', p2.category === 'Parrilla' && p2.oldPrice === 14500 && p2.badge === 'OFERTA');

  // Artículo cargado a mano con el mismo código: no se toca
  const manual = (await call('POST', '/api/products', { token: A.token, body: { internalCode: '77', name: 'Mi artículo propio', price: 100, category: 'Propios' } })).data;
  const conf = await sync(KEY, { mode: 'apply', fingerprint: FP, items: [...items2, { code: '77', name: 'ALGO DE ITEGRA', price: 5, unit: 'kg' }] });
  const pm = byCode(await products(A.token), '77');
  check('un artículo cargado a mano no se pisa y se avisa', conf.data.conflicts === 1 && conf.data.conflictList[0].code === '77' && pm.name === 'Mi artículo propio' && pm.price === 100 && manual.id === pm.id);

  console.log('Adoptar artículos ya cargados a mano');
  // 25 artículos cargados a mano (como un catálogo importado antes de usar el worker)
  for (let i = 0; i < 25; i++) await call('POST', '/api/products', { token: A.token, body: { internalCode: `M${i}`, name: `Manual ${i}`, price: 10 + i, category: 'Mi categoría', oldPrice: 50 + i, badge: 'NUEVO' } });
  const manualItems = Array.from({ length: 25 }, (_, i) => ({ code: `M${i}`, name: `ARTICULO ITEGRA ${i}`, price: 100 + i, unit: 'kg' }));
  const noAdopt = await sync(KEY, { mode: 'apply', fingerprint: FP, items: [...items2, ...manualItems] });
  check('sin adoptar: los 25 quedan como conflicto', noAdopt.data.conflicts === 25 && noAdopt.data.adopted === 0);
  check('el servidor devuelve TODOS los códigos en conflicto (no solo 20)', noAdopt.data.conflictCodes.length === 25 && noAdopt.data.conflictList.length === 20);
  check('y no cambió ninguno', byCode(await products(A.token), 'M3').price === 13 && byCode(await products(A.token), 'M3').name === 'Manual 3');
  const adoptPrev = await sync(KEY, { mode: 'preview', fingerprint: FP, adopt: true, items: [...items2, ...manualItems] });
  check('la vista previa cuenta cuántos adoptaría, sin escribir', adoptPrev.data.adopted === 25 && adoptPrev.data.conflicts === 0 && adoptPrev.data.adoptedSample.length === 8 && byCode(await products(A.token), 'M3').price === 13);
  const adoptNow = await sync(KEY, { mode: 'apply', fingerprint: FP, adopt: true, items: [...items2, ...manualItems] });
  const m3 = byCode(await products(A.token), 'M3');
  check('con adopt:true los adopta', adoptNow.data.adopted === 25 && adoptNow.data.conflicts === 0);
  check('Itegra pasa a mandar sobre nombre, precio y unidad', m3.name === 'Articulo Itegra 3' && m3.price === 103 && m3.unit === 'kg');
  check('la categoría, el precio anterior y la etiqueta del negocio se conservan', m3.category === 'Mi categoría' && m3.oldPrice === 53 && m3.badge === 'NUEVO');
  const afterAdopt = await sync(KEY, { mode: 'apply', fingerprint: FP, items: [...items2, ...manualItems.map((i) => (i.code === 'M3' ? { ...i, price: 999 } : i))] });
  check('después de adoptados se actualizan solos, sin pedir adopt de nuevo', afterAdopt.data.updated === 1 && afterAdopt.data.conflicts === 0 && byCode(await products(A.token), 'M3').price === 999);
  check('el artículo manual que no se adoptó (77) sigue intacto', byCode(await products(A.token), '77').name === 'Mi artículo propio');
  for (const p of (await products(A.token)).filter((x) => /^M[0-9]+$/.test(x.internalCode))) await call('DELETE', `/api/products/${p.id}`, { token: A.token });

  console.log('Artículos que desaparecen');
  const gone = await sync(KEY, { mode: 'apply', fingerprint: FP, full: true, items: items2.filter((i) => i.code !== '4') });
  const p3 = await products(A.token);
  check('se marcan sin stock, no se borran', gone.data.hidden === 1 && byCode(p3, '4').available === false && p3.length === 6);
  check('el artículo manual no se oculta', byCode(p3, '77').available === true);
  const back = await sync(KEY, { mode: 'apply', fingerprint: FP, full: true, items: items2 });
  check('si vuelve a existir, se repone', back.data.restored === 1 && byCode(await products(A.token), '4').available === true);
  // El negocio marca AGOTADO a mano: la sincronización no lo repone
  const p4 = byCode(await products(A.token), '5');
  await call('PATCH', `/api/products/${p4.id}/availability`, { token: A.token, body: { available: false } });
  await sync(KEY, { mode: 'apply', fingerprint: FP, full: true, items: items2 });
  check('un AGOTADO puesto a mano se respeta', byCode(await products(A.token), '5').available === false);

  console.log('Protección contra lecturas incompletas');
  const many = Array.from({ length: 40 }, (_, i) => ({ code: String(100 + i), name: `ARTICULO ${i}`, price: 100 + i, unit: 'unidad' }));
  await sync(KEY, { mode: 'apply', fingerprint: FP, full: true, items: [...items2, ...many] });
  const short = await sync(KEY, { mode: 'apply', fingerprint: FP, full: true, items: items2.slice(0, 2) });
  check('si faltan demasiados, pide confirmación y no cambia nada', short.status === 409 && short.data.code === 'too_many_missing' && (await products(A.token)).filter((p) => p.available).length >= 40);
  const shortPrev = await sync(KEY, { mode: 'preview', fingerprint: FP, full: true, items: items2.slice(0, 2) });
  check('la vista previa lo advierte', shortPrev.status === 200 && shortPrev.data.needsForce === true);
  check('con force se aplica', (await sync(KEY, { mode: 'apply', fingerprint: FP, full: true, force: true, items: items2.slice(0, 2) })).status === 200);
  check('una sincronización parcial (sin full) nunca oculta nada', (await sync(KEY, { mode: 'apply', fingerprint: FP, full: false, items: items2.slice(0, 1) })).data.hidden === 0);

  console.log('Datos inválidos');
  const bad = (items) => sync(KEY, { mode: 'apply', fingerprint: FP, items });
  check('sin lista de artículos', (await sync(KEY, { mode: 'apply', fingerprint: FP })).status === 400);
  check('precio negativo', (await bad([{ code: '1', name: 'X', price: -1 }])).status === 400);
  check('precio no numérico', (await bad([{ code: '1', name: 'X', price: 'gratis' }])).status === 400);
  check('sin nombre', (await bad([{ code: '1', name: '  ', price: 1 }])).status === 400);
  check('sin código', (await bad([{ name: 'X', price: 1 }])).status === 400);
  check('demasiados artículos', (await bad(Array.from({ length: 5001 }, (_, i) => ({ code: String(i), name: 'X', price: 1 })))).status === 400);
  const dup = await sync(KEY, { mode: 'preview', fingerprint: FP, items: [{ code: '9', name: 'UNO', price: 1 }, { code: '9', name: 'DOS', price: 2 }] });
  check('un código repetido en el envío cuenta una sola vez', dup.status === 200 && dup.data.total === 1);

  console.log('Revocar y suspender');
  check('revoca la clave', (await call('DELETE', `/api/integrations/keys/${keyAfter.id}`, { token: A.token })).status === 200);
  check('una clave revocada deja de funcionar', (await sync(KEY, { mode: 'ping', fingerprint: FP })).status === 401);
  const k3 = (await call('POST', '/api/integrations/keys', { token: A.token, body: { name: 'Nueva' } })).data;
  check('una clave nueva funciona', (await sync(k3.key, { mode: 'ping', fingerprint: FP })).status === 200);
  await call('PUT', `/api/admin/businesses/${A.id}`, { token: admin.token, body: { name: 'Itegra a', maxScreens: 3, storageLimitMb: 50, active: false } });
  check('con el negocio suspendido la clave no sirve', [401, 403].includes((await sync(k3.key, { mode: 'ping', fingerprint: FP })).status));
  await call('PUT', `/api/admin/businesses/${A.id}`, { token: admin.token, body: { name: 'Itegra a', maxScreens: 3, storageLimitMb: 50, active: true } });

  console.log('Worker real (programa completo)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'itegra-e2e-'));
  const script = [
    'SET DATABASE UNIQUE NAME HSQLDBE2E' + stamp,
    'CREATE MEMORY TABLE PUBLIC.PLUS(NROPLU INTEGER NOT NULL,CODSECCION INTEGER,NOMPLU VARCHAR(150),TPOPLU VARCHAR(5),PRECIO DECIMAL(10,2),CONSTRAINT PLU PRIMARY KEY(NROPLU))',
    "INSERT INTO PLUS VALUES(1,1,'LOMO DE CERDO','P',9000.00)",
    "INSERT INTO PLUS VALUES(2,1,'PAN DE MIGA SOL DE MAYO','N',3500.00)",
    "INSERT INTO PLUS VALUES(3,1,'AJO X UNIDAD','X',0.00)",
    "INSERT INTO PLUS VALUES(4,1,'RICOTA GRANJA','R',0.00)",
    "INSERT INTO PLUS VALUES(5,1,'DULCE DE CA\\u00d1A','N',2500.00)",
    ''
  ].join('\n');
  fs.writeFileSync(path.join(tmp, 'Datos.script'), script);
  const keyW = (await call('POST', '/api/integrations/keys', { token: B.token, body: { name: 'Worker de prueba' } })).data;
  const cfgPath = path.join(tmp, 'worker.config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ servidor: BASE, claveIntegracion: keyW.key, rutaBase: tmp, cadaMinutos: 1 }));
  const worker = path.join(__dirname, '../../integrations/itegra-worker/worker.js');
  const run = (...args) => spawnSync(process.execPath, [worker, '--config', cfgPath, ...args], { encoding: 'utf8', timeout: 60000 });

  let r = run('--previsualizar');
  check('--previsualizar muestra qué haría y no escribe', r.status === 0 && /VISTA PREVIA/.test(r.stdout) && /nuevos 3/.test(r.stdout) && (await products(B.token)).length === 0, r.stdout + r.stderr);
  r = run('--una-vez');
  check('sin confirmar, el modo normal solo previsualiza', /VISTA PREVIA/.test(r.stdout) && (await products(B.token)).length === 0, r.stdout);
  r = run('--aplicar');
  const pB = await products(B.token);
  check('--aplicar sube 3 artículos (omite los tipos R y X)', r.status === 0 && pB.length === 3 && !byCode(pB, '3') && !byCode(pB, '4'), r.stdout + r.stderr);
  check('con categorías, unidades y la ñ bien', byCode(pB, '1').category === 'Cerdo' && byCode(pB, '1').unit === 'kg' && byCode(pB, '2').category === 'Panadería' && byCode(pB, '2').unit === 'unidad' && byCode(pB, '5').name === 'Dulce de Caña' && byCode(pB, '5').category === 'Pastelería y dulces');
  const changesFile = path.join(tmp, 'actualizaciones.log');
  const changesText = () => (fs.existsSync(changesFile) ? fs.readFileSync(changesFile, 'utf8') : '');
  check('actualizaciones.log registra la primera carga', /PRIMERA CARGA: 3 artículos/.test(changesText()), changesText());
  r = run('--una-vez');
  check('sin cambios en la base solo avisa', /Sin cambios/.test(r.stdout), r.stdout);
  check('y no agrega nada a actualizaciones.log', changesText().split('\n').filter(Boolean).length === 1, changesText());
  fs.appendFileSync(path.join(tmp, 'Datos.log'), '/*C1*/UPDATE PLUS SET PRECIO=9500.00 WHERE NROPLU=1\n/*C1*/INSERT INTO PLUS VALUES(6,1,\'ZAPALLO NEGRO X KG\',\'P\',800.00)\n');
  r = run('--una-vez');
  const pB2 = await products(B.token);
  check('toma los cambios recientes del .log: precio nuevo y artículo nuevo', byCode(pB2, '1').price === 9500 && byCode(pB2, '6') && byCode(pB2, '6').category === 'Verduras', r.stdout);
  // Un artículo que el negocio ya cargó a mano con el mismo código: el worker avisa y, con --adoptar, lo adopta
  const manual50 = (await call('POST', '/api/products', { token: B.token, body: { internalCode: '50', name: 'Carne mía', price: 1, category: 'Parrilla' } })).data;
  fs.appendFileSync(path.join(tmp, 'Datos.log'), "/*C1*/INSERT INTO PLUS VALUES(50,1,'CARNE PICADA X KG','P',100.00)\n");
  r = run('--una-vez');
  check('el worker avisa de los artículos ya cargados a mano y cómo adoptarlos', /AVISO: 1 artículos ya estaban cargados a mano/.test(r.stdout) && /--adoptar/.test(r.stdout), r.stdout);
  check('y el registro NO los anota como actualizados', !/NUEVO\s+50/.test(changesText()) && byCode(await products(B.token), '50').name === 'Carne mía');
  r = run('--adoptar', '--una-vez');
  const p50 = byCode(await products(B.token), '50');
  check('con --adoptar los adopta (aunque la base no haya cambiado)', /adoptados 1/.test(r.stdout) && p50.name === 'Carne Picada x kg' && p50.price === 100 && p50.category === 'Parrilla', r.stdout);
  check('actualizaciones.log anota la adopción', /ADOPTADOS: 1 artículos/.test(changesText()) && /ADOPTAR\s+50/.test(changesText()), changesText());
  await call('DELETE', `/api/products/${manual50.id}`, { token: B.token });
  check('el negocio A no recibió nada de este worker', !(await products(A.token)).some((p) => p.name === 'Zapallo Negro x kg'));
  check('actualizaciones.log detalla el precio: antes -> después', /PRECIO\s+1\s+LOMO DE CERDO: \$9\.000,00 -> \$9\.500,00/.test(changesText()), changesText());
  check('y el artículo nuevo con su precio y unidad', /NUEVO\s+6\s+ZAPALLO NEGRO X KG: \$800,00 \/ kg/.test(changesText()), changesText());
  check('con el resumen de la sincronización', /SINCRONIZACIÓN en "Itegra b": 1 precio, 1 nuevo/.test(changesText()), changesText());
  fs.writeFileSync(path.join(tmp, 'Datos.script'), script.replace(/INSERT INTO PLUS.*\n/g, ''));
  fs.rmSync(path.join(tmp, 'Datos.log'));
  r = run('--una-vez');
  check('si la base queda vacía no envía nada', /no tiene art/.test(r.stdout) && (await products(B.token)).length === 4, r.stdout);
  fs.writeFileSync(path.join(tmp, 'worker.config.json'), JSON.stringify({ servidor: BASE, claveIntegracion: 'itg_mala', rutaBase: tmp }));
  r = run();
  check('una clave mal escrita se rechaza antes de conectar o por el servidor', r.status !== 0, r.stdout + r.stderr);
  fs.rmSync(tmp, { recursive: true, force: true });

  for (const b of [A, B]) await call('DELETE', `/api/admin/businesses/${b.id}`, { token: admin.token });
  console.log(`\n${passed} correctas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
