// Lector de solo lectura de la base de Itegra (HSQLDB): Datos.script + Datos.log (si existe).
// Solo mira la tabla de artículos (PLUS). No abre la base, no la modifica ni la bloquea, y nunca lee clientes, usuarios ni ventas.
const fs = require('fs');
const path = require('path');

// Valores de un INSERT: 'texto' (con '' como comilla y \uXXXX para caracteres especiales) o números / TRUE / FALSE / NULL
function parseValues(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "'") {
      let v = '';
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { v += "'"; i += 2; }
        else if (s[i] === "'") { i++; break; }
        else v += s[i++];
      }
      out.push(v.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
    } else {
      let j = i;
      while (j < s.length && s[j] !== ',') j++;
      out.push(s.slice(i, j).trim());
      i = j;
    }
    if (s[i] === ',') i++;
  }
  return out;
}

// UPDATE ... SET COL=valor,COL2='texto' WHERE NROPLU=n  ->  { cambios, nroplu }
function parseUpdate(line) {
  const m = line.match(/^UPDATE\s+(?:PUBLIC\.)?PLUS\s+SET\s+([\s\S]*?)\s+WHERE\s+NROPLU\s*=\s*(\d+)\s*$/i);
  if (!m) return null;
  const changes = {};
  const body = m[1];
  let i = 0;
  while (i < body.length) {
    const eq = body.indexOf('=', i);
    if (eq < 0) break;
    const col = body.slice(i, eq).trim().toUpperCase();
    i = eq + 1;
    let raw;
    if (body[i] === "'") {
      let j = i + 1;
      while (j < body.length) {
        if (body[j] === "'" && body[j + 1] === "'") j += 2;
        else if (body[j] === "'") break;
        else j++;
      }
      raw = body.slice(i, j + 1);
      i = j + 1;
    } else {
      let j = i;
      while (j < body.length && body[j] !== ',') j++;
      raw = body.slice(i, j).trim();
      i = j;
    }
    if (body[i] === ',') i++;
    changes[col] = parseValues(raw)[0];
  }
  return { changes, nroplu: m[2] };
}

// Cuando Itegra está instalado en "Program Files" y corre sin permisos de administrador, Windows desvía lo que
// escribe a la carpeta VirtualStore de cada usuario. Ahí queda la base con los cambios y en la carpeta original
// queda una copia vieja. Por eso se miran las dos y se usa la más reciente.
function virtualStoreDirs(dir) {
  const found = [];
  if (process.platform !== 'win32') return found;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(path.resolve(dir));
  if (!m) return found;
  const usersRoot = `${m[1]}:\\Users`;
  let users = [];
  try { users = fs.readdirSync(usersRoot); } catch { return found; }
  for (const u of users) {
    const p = path.join(usersRoot, u, 'AppData', 'Local', 'VirtualStore', m[2]);
    try { if (fs.statSync(p).isDirectory()) found.push(p); } catch { /* no existe */ }
  }
  return found;
}

// Elige el archivo de base más reciente entre la carpeta indicada y su(s) VirtualStore.
// Itegra (HSQLDB) deja la foto de la base en Datos.script o, mientras trabaja, en Datos.script.new.
function resolveFiles(target, extraDirs) {
  const isScript = /\.script$/i.test(target);
  const dir = isScript ? path.dirname(target) : target;
  const base = isScript ? path.basename(target).replace(/\.script$/i, '') : 'Datos';
  const dirs = [dir, ...(extraDirs || virtualStoreDirs(dir))];

  const candidates = [];
  for (const d of dirs) {
    for (const ext of ['.script', '.script.new']) {
      const file = path.join(d, base + ext);
      try {
        const st = fs.statSync(file);
        if (st.isFile() && st.size > 0) candidates.push({ script: file, log: path.join(d, base + '.log'), mtime: st.mtimeMs });
      } catch { /* no existe */ }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0];
}

function readProducts(target, { extraDirs } = {}) {
  const chosen = resolveFiles(target, extraDirs);
  if (!chosen) throw new Error(`No encuentro la base de Itegra en: ${target}`);
  const { script, log } = chosen;
  const text = fs.readFileSync(script, 'utf8');

  const fingerprint = (text.match(/^SET DATABASE UNIQUE NAME (\S+)/m) || [])[1] || null;
  const tableDef = text.match(/^CREATE (?:MEMORY )?TABLE PUBLIC\.PLUS\((.*)\)\s*$/m);
  if (!tableDef) throw new Error('La base no tiene la tabla de artículos (PLUS). ¿Es la base de Itegra?');
  const columns = [];
  // Columnas "NOMBRE TIPO[(n,m)] [NOT NULL]" separadas por coma, ignorando las comas dentro de paréntesis
  let depth = 0, cur = '';
  for (const ch of tableDef[1]) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { columns.push(cur); cur = ''; } else cur += ch;
  }
  columns.push(cur);
  const names = columns.map((c) => c.trim().split(/\s+/)[0]).filter((c) => c.toUpperCase() !== 'CONSTRAINT');

  const rows = new Map();
  const toRow = (values) => {
    const r = {};
    names.forEach((c, i) => { r[c] = values[i]; });
    return r;
  };

  const insert = /^INSERT INTO (?:PUBLIC\.)?PLUS VALUES\((.*)\)\s*$/;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(insert);
    if (m) { const r = toRow(parseValues(m[1])); rows.set(r.NROPLU, r); }
  }

  // Cambios recientes que Itegra todavía no volcó al .script
  let logLines = 0;
  if (fs.existsSync(log)) {
    for (const raw of fs.readFileSync(log, 'utf8').split(/\r?\n/)) {
      const line = raw.replace(/^\/\*C\d+\*\//, '').trim();
      let m;
      if ((m = line.match(insert))) {
        const r = toRow(parseValues(m[1]));
        rows.set(r.NROPLU, r);
        logLines++;
      } else if ((m = line.match(/^DELETE FROM (?:PUBLIC\.)?PLUS WHERE NROPLU\s*=\s*(\d+)\s*$/i))) {
        rows.delete(m[1]);
        logLines++;
      } else if (/^UPDATE\s+(?:PUBLIC\.)?PLUS\s/i.test(line)) {
        const u = parseUpdate(line);
        if (u && rows.has(u.nroplu)) { Object.assign(rows.get(u.nroplu), u.changes); logLines++; }
      }
    }
  }

  return { fingerprint, rows: [...rows.values()], logLines, files: { script, log: fs.existsSync(log) ? log : null } };
}

// Tipos de artículo de Itegra: P = pesable, N = por unidad. Los demás (R, X) no se suben.
const UNIT_BY_TYPE = { P: 'kg', N: 'unidad' };

function toItems(rows, { types = ['P', 'N'] } = {}) {
  const items = [];
  const skipped = { tipo: 0, sinNombre: 0, precioInvalido: 0 };
  for (const r of rows) {
    const tipo = String(r.TPOPLU || '').trim().toUpperCase();
    if (!types.includes(tipo)) { skipped.tipo++; continue; }
    const name = String(r.NOMPLU || '').replace(/\s+/g, ' ').trim();
    if (!name) { skipped.sinNombre++; continue; }
    const price = Number(r.PRECIO);
    if (!Number.isFinite(price) || price < 0) { skipped.precioInvalido++; continue; }
    items.push({ code: String(r.NROPLU), name, price, unit: UNIT_BY_TYPE[tipo] || null });
  }
  return { items, skipped };
}

module.exports = { readProducts, toItems, parseValues, parseUpdate };
