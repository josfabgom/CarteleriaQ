// Pruebas del lector de la base de Itegra. Uso: node test-db.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readProducts, toItems, parseValues, parseUpdate } = require('./itegra-db');

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  FAIL ${name} ${extra}`); }
};

const SCRIPT = [
  'SET DATABASE UNIQUE NAME HSQLDBTEST1',
  'CREATE MEMORY TABLE PUBLIC.USUARIOS(CODUSUARIO INTEGER NOT NULL,NOMUSUARIO VARCHAR(20),CLAVE VARCHAR(20))',
  'CREATE MEMORY TABLE PUBLIC.PLUS(NROPLU INTEGER NOT NULL,CODSECCION INTEGER,NOMPLU VARCHAR(150),TPOPLU VARCHAR(5),PRECIO DECIMAL(10,2),CONSTRAINT PLU PRIMARY KEY(NROPLU))',
  "INSERT INTO USUARIOS VALUES(1,'Admin','no-se-debe-leer')",
  "INSERT INTO PLUS VALUES(1,1,'ASADO DE TIRA','P',12900.00)",
  "INSERT INTO PLUS VALUES(2,1,'DULCE DE CA\\u00d1A','N',2500.50)",
  "INSERT INTO PLUS VALUES(3,1,'QUESO L''AUBRAC, TIPO \"X\"','P',9000.00)",
  "INSERT INTO PLUS VALUES(4,1,'RICOTA X KG','R',0.00)",
  "INSERT INTO PLUS VALUES(5,1,'AJO X UNIDAD','X',0.00)",
  "INSERT INTO PLUS VALUES(6,1,'   ','P',100.00)",
  "INSERT INTO PLUS VALUES(7,1,'SIN PRECIO','N',-5.00)",
  ''
].join('\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'itegra-test-'));
fs.writeFileSync(path.join(tmp, 'Datos.script'), SCRIPT);

console.log('Valores');
check('texto con comilla doblada y coma', parseValues("1,'L''AUBRAC, X',2.5")[1] === "L'AUBRAC, X");
check('caracteres \\u00d1', parseValues("'CA\\u00d1A'")[0] === 'CAÑA');
check('UPDATE simple', JSON.stringify(parseUpdate("UPDATE PLUS SET PRECIO=15.5,NOMPLU='A,B' WHERE NROPLU=9")) === JSON.stringify({ changes: { PRECIO: '15.5', NOMPLU: 'A,B' }, nroplu: '9' }));

console.log('Lectura de la base');
let db = readProducts(tmp);
check('identifica la base (fingerprint)', db.fingerprint === 'HSQLDBTEST1');
check('lee solo la tabla de artículos', db.rows.length === 7 && !('CLAVE' in db.rows[0]));
let { items, skipped } = toItems(db.rows);
check('solo sube tipos P y N con nombre y precio válido', items.length === 3 && skipped.tipo === 2 && skipped.sinNombre === 1 && skipped.precioInvalido === 1, JSON.stringify(skipped));
check('unidad: P=kg, N=unidad', items[0].unit === 'kg' && items[1].unit === 'unidad');
check('decodifica la ñ', items[1].name === 'DULCE DE CAÑA');
check('el código es el número del artículo', items[0].code === '1' && items[0].price === 12900);
check('se pueden elegir otros tipos', toItems(db.rows, { types: ['P', 'N', 'R'] }).items.length === 4);

console.log('Cambios recientes (.log)');
fs.writeFileSync(path.join(tmp, 'Datos.log'), [
  '/*C1*/SET SCHEMA PUBLIC',
  "/*C1*/INSERT INTO PLUS VALUES(10,1,'PAN CASERO KG','P',4200.00)",
  '/*C1*/UPDATE PLUS SET PRECIO=13500.00 WHERE NROPLU=1',
  "/*C1*/UPDATE PLUS SET NOMPLU='VACIO NUEVO',PRECIO=1.5 WHERE NROPLU=2",
  '/*C1*/DELETE FROM PLUS WHERE NROPLU=3',
  '/*C1*/UPDATE PLUS SET PRECIO=99 WHERE NROPLU=999',
  '/*C1*/COMMIT',
  ''
].join('\n'));
db = readProducts(tmp);
({ items } = toItems(db.rows));
const byCode = Object.fromEntries(items.map((i) => [i.code, i]));
check('aplica el alta del .log', !!byCode['10'] && byCode['10'].price === 4200);
check('aplica el cambio de precio', byCode['1'].price === 13500);
check('aplica cambio de nombre y precio juntos', byCode['2'].name === 'VACIO NUEVO' && byCode['2'].price === 1.5);
check('aplica la baja', !byCode['3']);
check('ignora cambios de artículos que no existen', !byCode['999']);
check('también se puede indicar el archivo .script', readProducts(path.join(tmp, 'Datos.script')).rows.length === db.rows.length);

console.log('Errores');
let msg = '';
try { readProducts(path.join(tmp, 'noexiste')); } catch (e) { msg = e.message; }
check('base inexistente: mensaje claro', /No encuentro la base/.test(msg));
fs.writeFileSync(path.join(tmp, 'Otra.script'), 'SET DATABASE UNIQUE NAME X\nCREATE MEMORY TABLE PUBLIC.OTRA(A INTEGER)\n');
try { readProducts(path.join(tmp, 'Otra.script')); } catch (e) { msg = e.message; }
check('archivo que no es de Itegra: mensaje claro', /tabla de art/.test(msg));

// Prueba con la base real, si está en esta PC (no se sube al repositorio)
const real = path.join(__dirname, '..', '..', 'base de Itegra');
if (fs.existsSync(path.join(real, 'Datos.script'))) {
  console.log('Base real (opcional)');
  const r = readProducts(real);
  const t = toItems(r.rows);
  check('lee los 790 artículos y sube los de tipo P/N', r.rows.length === 790 && t.items.length === 764 && t.skipped.tipo === 26);
  check('los nombres con ñ quedan bien', t.items.some((i) => /CAÑA/.test(i.name)) && !t.items.some((i) => /\\u00/.test(i.name)));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
