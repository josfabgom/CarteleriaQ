// Pruebas de las categorías automáticas y del formato de nombres. Uso: npx tsx scripts/test-categories.ts
import { categorize, prettyName, CATEGORY_NAMES } from '../src/categories';

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  FAIL ${name} ${extra}`); }
};

const expected: [string, string][] = [
  ['CARRE DE CERDO BARBIAN', 'Cerdo'],
  ['CARNE MOLIDA X KG', 'Carnes vacunas'],
  ['CARNE MOLIDA DE POLLO KG', 'Pollo'],
  ['CARNE CHULETA DE CERDO X', 'Cerdo'],
  ['PECHUGA S/HUESO X KG', 'Pollo'],
  ['POLLO FRITO X KG', 'Comidas elaboradas'],
  ['MILANESA VACUNO X KG', 'Carnes vacunas'],
  ['MILANESA DE POLLO LISTA', 'Comidas elaboradas'],
  ['ACHURA RIÑON X KG', 'Achuras'],
  ['MOLLEJA X KG', 'Achuras'],
  ['MERLUZA DESPINADA KG', 'Pescados y mariscos'],
  ['FILET SURUBI X KG', 'Pescados y mariscos'],
  ['CHORIZO COFRA CRIOLLO X K', 'Embutidos y fiambres'],
  ['QUESO CERDO BARBIAN', 'Embutidos y fiambres'],
  ['JAMON COCIDO COFRA X KG', 'Embutidos y fiambres'],
  ['QUESO MOZZARELLA NOAL', 'Quesos'],
  ['RICOTA GRANJA SUIZA X 320', 'Quesos'],
  ['HUEVO MAPLE COLOR X 2.5 D', 'Lácteos y huevos'],
  ['MANTECA X KG', 'Lácteos y huevos'],
  ['MANZANA JAULA X KG', 'Frutas'],
  ['BANANA ECUADOR X KG', 'Frutas'],
  ['TOMATE PLATENSE X KG', 'Verduras'],
  ['LECHUGA X KG', 'Verduras'],
  ['CILANTRO X MAZO', 'Verduras'],
  ['DULCE DE BATATA ARCOR VAI', 'Pastelería y dulces'],
  ['BATATAS X KG', 'Verduras'],
  ['ALMENDRAS ENT X KG', 'Frutos secos y semillas'],
  ['PERA DESHID X KG', 'Frutos secos y semillas'],
  ['PAN HAMB LINEA SALUDABLE', 'Panadería'],
  ['PAN PEBETE SOL DE MAYO X6', 'Panadería'],
  ['TORTA MATILDA X KG', 'Pastelería y dulces'],
  ['ALFAJOR HOJALDRE GRANDE', 'Pastelería y dulces'],
  ['CANASTITAS HOJALDRE', 'Panadería'],
  ['EMPANADA DE POLLO', 'Comidas elaboradas'],
  ['TARTA DE ACELGA', 'Comidas elaboradas'],
  ['ENSALADA RUSA', 'Comidas elaboradas'],
  ['YERBA PAQUETE GRANDE', 'Almacén'],
  ['JABON POLVO ALA SUELTO', 'Almacén'],
  ['CREMA PASTELERA X KG', 'Pastelería y dulces'],
  ['ARTICULO RARO SIN NOMBRE CONOCIDO', 'Otros'],
  ['Asado de tira', 'Carnes vacunas'],
  ['  chorizo parrillero  ', 'Embutidos y fiambres']
];
console.log('Categorías');
for (const [name, cat] of expected) check(`${name.trim()} -> ${cat}`, categorize(name) === cat, `(dio ${categorize(name)})`);
check('todas las categorías posibles están listadas', CATEGORY_NAMES.includes('Otros') && CATEGORY_NAMES.includes('Quesos'));

console.log('Nombres');
const names: [string, string][] = [
  ['CARRE DE CERDO BARBIAN', 'Carre de Cerdo Barbian'],
  ['QUESO SBRINZ TIO PUJIO X', 'Queso Sbrinz Tio Pujio x'],
  ['MANZANA JAULA X KG', 'Manzana Jaula x kg'],
  ['  PAN   DE  MIGA  ', 'Pan de Miga'],
  ['RAKKYO X1000G', 'Rakkyo X1000G'],
  ['PORT SALUT LACTEAR S/S S/', 'Port Salut Lactear S/S S/'],
  ['1/2 POLLO AL ESPIEDO', '1/2 Pollo al Espiedo'],
  ['DULCE DE CAÑA', 'Dulce de Caña']
];
for (const [raw, pretty] of names) check(`"${raw.trim()}" -> "${pretty}"`, prettyName(raw) === pretty, `(dio "${prettyName(raw)}")`);

console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
