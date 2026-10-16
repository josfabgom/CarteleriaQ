#!/usr/bin/env node
// Worker de Itegra -> CarteleriaQ. Lee la base de Itegra (solo lectura) y sube los artículos a la nube.
//
//   node worker.js --previsualizar   muestra qué cambiaría, sin aplicar nada
//   node worker.js --aplicar         primera carga real (después queda funcionando solo)
//   node worker.js                   modo normal: revisa cada X minutos y sube solo las diferencias
//   node worker.js --una-vez         una sola revisión y termina
//
// Requiere Node.js 18 o más nuevo. No usa librerías externas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readProducts, toItems } = require('./itegra-db');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

if (flag('--ayuda') || flag('-h')) {
  console.log([
    'Worker de Itegra -> CarteleriaQ', '',
    '  --previsualizar   muestra qué cambiaría, sin aplicar nada',
    '  --aplicar         primera carga real (después queda funcionando solo)',
    '  (sin opciones)    modo normal: revisa cada X minutos y sube solo las diferencias',
    '  --una-vez         una sola revisión y termina',
    '  --forzar          salta las protecciones de lectura incompleta',
    '  --adoptar         los artículos ya cargados a mano con el mismo código pasan a actualizarse desde Itegra',
    '  --config <ruta>   usa otro archivo de configuración'
  ].join('\n'));
  process.exit(0);
}

// Empaquetado como .exe, los archivos de configuración están junto al ejecutable; como script, junto al código
const appDir = /^node(\.exe)?$/i.test(path.basename(process.execPath)) ? __dirname : path.dirname(process.execPath);
const configPath = path.resolve(option('--config') || path.join(appDir, 'worker.config.json'));
const baseDir = path.dirname(configPath);
const statePath = path.join(baseDir, 'estado.json');
const logPath = path.join(baseDir, 'worker.log');
const changesPath = path.join(baseDir, 'actualizaciones.log'); // qué artículos cambiaron en cada sincronización

// ---------- Registro ----------
function log(msg) {
  const line = `${new Date().toISOString().replace('T', ' ').slice(0, 19)}  ${msg}`;
  console.log(line);
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 2 * 1024 * 1024) fs.renameSync(logPath, logPath + '.1');
    fs.appendFileSync(logPath, line + '\n');
  } catch { /* si no se puede escribir el log, se sigue igual */ }
}

// ---------- Configuración y estado ----------
function loadConfig() {
  if (!fs.existsSync(configPath)) throw new Error(`No encuentro el archivo de configuración: ${configPath}\nCopiá worker.config.example.json como worker.config.json y completalo.`);
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const cfg = {
    servidor: String(raw.servidor || '').replace(/\/+$/, ''),
    claveIntegracion: String(raw.claveIntegracion || '').trim(),
    rutaBase: raw.rutaBase,
    cadaMinutos: Math.max(1, Number(raw.cadaMinutos) || 5),
    tipos: Array.isArray(raw.tiposDeArticulo) && raw.tiposDeArticulo.length ? raw.tiposDeArticulo.map((t) => String(t).toUpperCase()) : ['P', 'N']
  };
  if (!/^https:\/\//.test(cfg.servidor) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(cfg.servidor)) throw new Error('"servidor" debe ser una dirección https:// (o http://localhost para pruebas).');
  if (!cfg.claveIntegracion.startsWith('itg_')) throw new Error('"claveIntegracion" no es válida: debe empezar con itg_ (se genera en el panel, sección Integración).');
  if (!cfg.rutaBase) throw new Error('Falta "rutaBase": la carpeta (o el archivo Datos.script) de la base de Itegra.');
  return cfg;
}

// ---------- Registro de actualizaciones (qué cambió) ----------
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const money = (n) => { const [i, d] = Number(n).toFixed(2).split('.'); return '$' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };

function appendChanges(lines) {
  try {
    if (fs.existsSync(changesPath) && fs.statSync(changesPath).size > 2 * 1024 * 1024) fs.renameSync(changesPath, changesPath + '.1');
    fs.appendFileSync(changesPath, lines.join('\n') + '\n');
  } catch { /* si no se puede escribir, se sigue igual */ }
}

// Compara lo enviado ahora con lo enviado la vez anterior. prev: { codigo: [nombre, precio, unidad] }
function diffItems(prev, items) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    seen.add(it.code);
    const p = prev[it.code];
    if (!p) { out.push({ tipo: 'NUEVO', code: it.code, texto: `${it.name}: ${money(it.price)}${it.unit ? ' / ' + it.unit : ''}` }); continue; }
    if (Math.abs(Number(p[1]) - it.price) >= 0.005) out.push({ tipo: 'PRECIO', code: it.code, texto: `${it.name}: ${money(p[1])} -> ${money(it.price)}` });
    if (p[0] !== it.name) out.push({ tipo: 'NOMBRE', code: it.code, texto: `${p[0]} -> ${it.name}` });
    if (it.unit && p[2] && p[2] !== it.unit) out.push({ tipo: 'UNIDAD', code: it.code, texto: `${it.name}: ${p[2]} -> ${it.unit}` });
  }
  for (const code of Object.keys(prev)) if (!seen.has(code)) out.push({ tipo: 'BAJA', code, texto: `${prev[code][0]} (ya no está en Itegra: queda sin stock)` });
  return out;
}

function logApplied(prevItems, items, serverData) {
  const ts = stamp();
  const business = serverData.business;
  if (prevItems === undefined) {
    appendChanges([`${ts}  PRIMERA CARGA: ${items.length} artículos subidos a "${business}" (nuevos ${serverData.created}, actualizados ${serverData.updated})`, '']);
    return;
  }
  if (prevItems === null) { // el estado viene de una versión anterior que no guardaba el detalle
    appendChanges([`${ts}  SINCRONIZADO con "${business}": ${describe(serverData)}  (desde acá se registra el detalle de cada cambio)`, '']);
    return;
  }
  // Los artículos que el servidor omitió (cargados a mano con el mismo código) no se registran como actualizados
  const skip = new Set(serverData.conflictCodes || (serverData.conflictList || []).map((c) => c.code));
  const changes = diffItems(prevItems, items).filter((c) => !skip.has(c.code));
  const counts = changes.reduce((a, c) => { a[c.tipo] = (a[c.tipo] || 0) + 1; return a; }, {});
  if (!changes.length && !serverData.hidden && !serverData.restored && !serverData.conflicts && !serverData.adopted) return; // nada para registrar
  const resumen = Object.entries(counts).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(', ') || 'sin cambios en los artículos';
  const lines = [`${ts}  SINCRONIZACIÓN en "${business}": ${resumen}${serverData.conflicts ? ` · omitidos por conflicto: ${serverData.conflicts}` : ''}${serverData.hidden ? ` · sin stock: ${serverData.hidden}` : ''}`];
  if (serverData.adopted) {
    lines.push(`   ADOPTADOS: ${serverData.adopted} artículos que ya existían en la nube ahora se actualizan desde Itegra`);
    for (const a of serverData.adoptedSample || []) lines.push(`   ADOPTAR ${a.code.padStart(5)}  ${a.before} -> ${a.after}`);
  }
  const MAX = 300;
  for (const c of changes.slice(0, MAX)) lines.push(`   ${c.tipo.padEnd(7)} ${c.code.padStart(5)}  ${c.texto}`);
  if (changes.length > MAX) lines.push(`   ... y ${changes.length - MAX} más`);
  lines.push('');
  appendChanges(lines);
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; }
}
function saveState(s) { fs.writeFileSync(statePath, JSON.stringify(s, null, 2)); }

// ---------- Comunicación con la nube ----------
async function post(cfg, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const res = await fetch(`${cfg.servidor}/api/integrations/itegra/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.claveIntegracion}` },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const describe = (d) => `nuevos ${d.created}, actualizados ${d.updated}, sin cambios ${d.unchanged}, sin stock ${d.hidden}${d.restored ? `, repuestos ${d.restored}` : ''}${d.adopted ? `, adoptados ${d.adopted}` : ''}${d.conflicts ? `, omitidos por conflicto ${d.conflicts}` : ''}`;

// ---------- Una revisión ----------
let lastSource = null;
async function runOnce(cfg) {
  const state = loadState();
  const { fingerprint, rows, logLines, files } = readProducts(cfg.rutaBase);
  if (files.script !== lastSource) { log(`Leyendo la base desde: ${files.script}`); lastSource = files.script; }
  const { items, skipped } = toItems(rows, { types: cfg.tipos });
  const omitidos = skipped.tipo + skipped.sinNombre + skipped.precioInvalido;

  if (items.length === 0) { log('La base no tiene artículos para subir. No se envía nada.'); return { ok: false }; }
  if (state.lastCount && items.length < state.lastCount * 0.5 && !flag('--forzar')) {
    log(`ATENCIÓN: ahora hay ${items.length} artículos y antes eran ${state.lastCount}. Parece un error de lectura; no se envía. Si es correcto, ejecutá con --forzar.`);
    return { ok: false };
  }

  const hash = crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');
  const confirmado = !!state.confirmado || flag('--aplicar');
  const fullDue = !state.lastFullAt || Date.now() - state.lastFullAt > DAY;

  let mode;
  if (flag('--previsualizar') || !confirmado) mode = 'preview';
  else if (hash === state.lastHash && !fullDue && !flag('--forzar') && !flag('--adoptar')) mode = 'ping';
  else mode = 'apply';

  const full = mode !== 'ping' && (fullDue || flag('--aplicar') || !state.lastHash || flag('--forzar'));
  log(`Base leída: ${rows.length} artículos${logLines ? ` (+${logLines} cambios recientes)` : ''}; se suben ${items.length}, se omiten ${omitidos} (tipo no incluido, sin nombre o precio inválido).`);

  const res = await post(cfg, { mode, fingerprint, full, force: flag('--forzar'), adopt: flag('--adoptar'), items: mode === 'ping' ? undefined : items });

  if (res.status === 401) throw Object.assign(new Error('La clave de integración no es válida o fue revocada. Pedí una nueva en el panel.'), { fatal: true });
  if (res.status === 403) throw Object.assign(new Error(res.data.error || 'Acceso denegado.'), { fatal: true });
  if (res.status === 409) throw Object.assign(new Error(res.data.error || 'Conflicto con el servidor.'), { fatal: res.data.code === 'fingerprint_mismatch' });
  if (res.status >= 400) throw new Error(`El servidor respondió ${res.status}: ${res.data.error || ''}`);

  if (mode === 'ping') { log(`Sin cambios (${res.data.business}).`); return { ok: true }; }

  log(`${mode === 'preview' ? 'VISTA PREVIA' : 'Sincronizado'} con "${res.data.business}": ${describe(res.data)}.`);
  if (res.data.conflicts && !flag('--adoptar')) log(`AVISO: ${res.data.conflicts} artículos ya estaban cargados a mano con el mismo código y no se actualizan desde Itegra. Si querés que Itegra los actualice, ejecutá el worker con --adoptar (por ejemplo: worker.exe --adoptar --aplicar).`);
  for (const a of res.data.adoptedSample || []) log(`   adoptar: ${a.code} ${a.before} -> ${a.after}`);
  if (mode === 'preview') {
    for (const s of res.data.sampleCreated || []) log(`   nuevo: ${s.code} ${s.name}  [${s.category}]  $${s.price}${s.unit ? ' / ' + s.unit : ''}`);
    if (!confirmado || flag('--previsualizar')) log('No se aplicó nada. Si el negocio es el correcto, ejecutá el worker con --aplicar (node worker.js --aplicar, o worker.exe --aplicar).');
    return { ok: true };
  }
  // state.items solo existe desde que se registran los cambios: sin él, no se puede comparar (null = estado viejo, undefined = primera carga)
  logApplied(state.items ? state.items : (state.lastHash ? null : undefined), items, res.data);
  saveState({ confirmado: true, lastHash: hash, lastCount: items.length, lastFullAt: full ? Date.now() : state.lastFullAt, lastSyncAt: Date.now(), items: Object.fromEntries(items.map((i) => [i.code, [i.name, i.price, i.unit]])) });
  return { ok: true };
}

// ---------- Principal ----------
async function main() {
  let cfg;
  try { cfg = loadConfig(); } catch (e) { console.error('Error de configuración: ' + e.message); process.exit(2); }
  log(`Worker de Itegra iniciado. Servidor: ${cfg.servidor} · Base: ${cfg.rutaBase} · Revisión cada ${cfg.cadaMinutos} min.`);

  const once = flag('--una-vez') || flag('--previsualizar') || flag('--aplicar');
  for (;;) {
    try {
      await runOnce(cfg);
    } catch (e) {
      log(`Error: ${e.message}${e.cause ? ' (' + e.cause.message + ')' : ''}`);
      if (e.fatal) process.exit(1);
      if (once) process.exit(1);
    }
    if (once) return;
    await new Promise((r) => setTimeout(r, cfg.cadaMinutos * 60 * 1000));
  }
}

main();
