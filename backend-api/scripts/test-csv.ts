// Pruebas del lector de CSV. Uso: npx tsx scripts/test-csv.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectSeparator, normalizeHeader, parseCsvFile, parsePrice, pick } from '../src/csv';

let passed = 0;
let failed = 0;
const eq = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}\n       esperado: ${JSON.stringify(expected)}\n       obtenido: ${JSON.stringify(actual)}`); }
};

const tmp = (content: string) => {
  const file = path.join(os.tmpdir(), `csvtest-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(file, content, 'utf8');
  return file;
};

(async () => {
  console.log('Precios');
  eq('9500', parsePrice('9500'), 9500);
  eq('9500.50', parsePrice('9500.50'), 9500.5);
  eq('9500,50', parsePrice('9500,50'), 9500.5);
  eq('9.500 (miles AR)', parsePrice('9.500'), 9500);
  eq('1.400', parsePrice('1.400'), 1400);
  eq('1,400 (miles)', parsePrice('1,400'), 1400);
  eq('12.500,75', parsePrice('12.500,75'), 12500.75);
  eq('12,500.75', parsePrice('12,500.75'), 12500.75);
  eq('$ 9.500', parsePrice('$ 9.500'), 9500);
  eq('$9500', parsePrice('$9500'), 9500);
  eq('1.234.567', parsePrice('1.234.567'), 1234567);
  eq('0,5 es medio', parsePrice('0,5'), 0.5);
  eq('0.500 es medio', parsePrice('0.500'), 0.5);
  eq('0 (gratis)', parsePrice('0'), 0);
  eq('texto -> NaN', Number.isNaN(parsePrice('gratis')), true);
  eq('vacío -> NaN', Number.isNaN(parsePrice('')), true);
  eq('negativo -> NaN', Number.isNaN(parsePrice('-5')), true);

  console.log('Encabezados y separador');
  eq('normaliza tildes y mayúsculas', normalizeHeader('Código Interno'), 'codigo_interno');
  eq('normaliza guion', normalizeHeader('codigo-barra'), 'codigo_barra');
  eq('quita BOM', normalizeHeader('\uFEFFnombre'), 'nombre');
  eq('camelCase en minúsculas', normalizeHeader('internalCode'), 'internalcode');
  eq('separador coma', detectSeparator('a,b,c'), ',');
  eq('separador punto y coma', detectSeparator('a;b;c'), ';');
  eq('separador tab', detectSeparator('a\tb\tc'), '\t');
  eq('coma entre comillas no cuenta', detectSeparator('"a,b";c;d'), ';');
  eq('sin separador -> coma', detectSeparator('nombre'), ',');

  console.log('Archivos');
  const expected = { nombre: 'Pizza Muzzarella', precio: '9500' };
  const variants: Array<[string, string]> = [
    ['coma', 'nombre,precio\nPizza Muzzarella,9500\n'],
    ['coma + BOM (CSV UTF-8 de Excel)', '\uFEFFnombre,precio\nPizza Muzzarella,9500\n'],
    ['punto y coma (Excel en español)', 'nombre;precio\nPizza Muzzarella;9500\n'],
    ['punto y coma + BOM + CRLF', '\uFEFFnombre;precio\r\nPizza Muzzarella;9500\r\n'],
    ['tabulador', 'nombre\tprecio\nPizza Muzzarella\t9500\n'],
    ['encabezados con mayúsculas', 'Nombre,PRECIO\nPizza Muzzarella,9500\n']
  ];
  for (const [label, content] of variants) {
    const rows = await parseCsvFile(tmp(content));
    eq(label, { nombre: rows[0]?.nombre, precio: rows[0]?.precio }, expected);
  }

  const quoted = await parseCsvFile(tmp('nombre;descripcion;precio\nHamburguesa;"Carne; cheddar y huevo";8900\n'));
  eq('punto y coma dentro de comillas', quoted[0].descripcion, 'Carne; cheddar y huevo');
  const commaInText = await parseCsvFile(tmp('nombre,descripcion,precio\nHamburguesa,"Carne, cheddar y huevo",8900\n'));
  eq('coma dentro de comillas', commaInText[0].descripcion, 'Carne, cheddar y huevo');
  const accents = await parseCsvFile(tmp('Código Interno;Nombre;Precio\nÑ01;Ñoquis;7.800\n'));
  eq('tildes y ñ', { code: pick(accents[0], 'codigo_interno'), name: pick(accents[0], 'nombre'), price: parsePrice(pick(accents[0], 'precio')) }, { code: 'Ñ01', name: 'Ñoquis', price: 7800 });
  eq('archivo vacío -> sin filas', (await parseCsvFile(tmp(''))).length, 0);
  eq('solo encabezado -> sin filas', (await parseCsvFile(tmp('nombre,precio\n'))).length, 0);

  console.log(`\n${passed} correctas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})();
