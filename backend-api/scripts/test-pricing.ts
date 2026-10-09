// Pruebas del cálculo de precios. Uso: npx tsx scripts/test-pricing.ts
import { computeNewPrice, describeChange, parseRequest, roundPrice } from '../src/pricing';

let passed = 0;
let failed = 0;
const eq = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}\n       esperado: ${JSON.stringify(expected)}\n       obtenido: ${JSON.stringify(actual)}`); }
};
const rule = (operation: 'percent' | 'amount', value: number, roundStep = 0, roundDirection: 'nearest' | 'up' | 'down' = 'nearest') =>
  ({ operation, value, roundStep, roundDirection });

console.log('Redondeo');
eq('sin paso: 2 decimales', roundPrice(10.456, 0, 'nearest'), 10.46);
eq('al más cercano a 100 (sube)', roundPrice(10450, 100, 'nearest'), 10500);
eq('al más cercano a 100 (baja)', roundPrice(10440, 100, 'nearest'), 10400);
eq('hacia arriba a 50', roundPrice(10401, 50, 'up'), 10450);
eq('hacia arriba: valor exacto no sube', roundPrice(10400, 100, 'up'), 10400);
eq('hacia abajo a 10', roundPrice(1099, 10, 'down'), 1090);
eq('hacia abajo: valor exacto no baja', roundPrice(1100, 10, 'down'), 1100);
eq('error de coma flotante no altera (hacia arriba)', roundPrice(9500 * 1.1, 50, 'up'), 10450);
eq('error de coma flotante no altera (hacia abajo)', roundPrice(9500 * 1.1, 50, 'down'), 10450);

console.log('Cálculo');
eq('+10% sin redondeo', computeNewPrice(9500, rule('percent', 10)), 10450);
eq('+10% redondeo a 100', computeNewPrice(9500, rule('percent', 10, 100)), 10500);
eq('-15% descuento', computeNewPrice(2000, rule('percent', -15)), 1700);
eq('+$250 monto fijo', computeNewPrice(9500, rule('amount', 250)), 9750);
eq('-$500 monto fijo', computeNewPrice(9500, rule('amount', -500)), 9000);
eq('nunca baja de cero', computeNewPrice(100, rule('amount', -500)), 0);
eq('precio por kg con decimales', computeNewPrice(12999.99, rule('percent', 8.5, 10, 'up')), 14110);
eq('precio chico con decimales', computeNewPrice(1.2, rule('percent', 10)), 1.32);
eq('cero se mantiene en %', computeNewPrice(0, rule('percent', 20)), 0);

console.log('Validación de la solicitud');
const err = (body: unknown) => { const r = parseRequest(body); return 'error' in r ? r.error : null; };
const ok = (body: unknown) => err(body) === null;
eq('operación inválida', err({ operation: 'x', value: 1 }) !== null, true);
eq('valor cero rechazado', err({ operation: 'percent', value: 0 }) !== null, true);
eq('valor no numérico rechazado', err({ operation: 'percent', value: 'abc' }) !== null, true);
eq('porcentaje < -90 rechazado', err({ operation: 'percent', value: -95 }) !== null, true);
eq('porcentaje > 1000 rechazado', err({ operation: 'percent', value: 1001 }) !== null, true);
eq('-90% permitido', ok({ operation: 'percent', value: -90 }), true);
eq('redondeo inválido rechazado', err({ operation: 'percent', value: 5, roundStep: 7 }) !== null, true);
eq('dirección inválida rechazada', err({ operation: 'percent', value: 5, roundDirection: 'sideways' }) !== null, true);
eq('categorías vacías rechazadas', err({ operation: 'percent', value: 5, scope: { type: 'categories', categories: [] } }) !== null, true);
eq('artículos vacíos rechazados', err({ operation: 'percent', value: 5, scope: { type: 'products', productIds: [] } }) !== null, true);
eq('alcance inválido rechazado', err({ operation: 'percent', value: 5, scope: { type: 'todo' } }) !== null, true);
eq('por defecto: todo el catálogo', (parseRequest({ operation: 'amount', value: 10 }) as any).scope, { type: 'all', includeManual: false });
eq('includeManual solo con "all"', (parseRequest({ operation: 'amount', value: 10, scope: { type: 'categories', categories: ['X'], includeManual: true } }) as any).scope.includeManual, undefined);
eq('categoría vacía = sin categoría', ok({ operation: 'percent', value: 5, scope: { type: 'categories', categories: [''] } }), true);

console.log('Descripción');
eq('aumento por categoría', describeChange(rule('percent', 10, 100, 'up'), { type: 'categories', categories: ['Vacuno'] }),
  '+10% a categoría Vacuno, redondeo hacia arriba a $100');
eq('descuento a todo', describeChange(rule('percent', -5), { type: 'all' }), '-5% a todos los artículos');
eq('monto a elegidos', describeChange(rule('amount', 200), { type: 'products', productIds: ['a', 'b'] }), '+$200 a 2 artículo(s) elegidos');

console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
