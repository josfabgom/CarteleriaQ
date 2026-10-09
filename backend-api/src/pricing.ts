import { Prisma } from '@prisma/client';
import prisma from './prisma';

export type Operation = 'percent' | 'amount';
export type RoundDirection = 'nearest' | 'up' | 'down';

export interface Rule {
  operation: Operation;
  value: number;
  roundStep: number;
  roundDirection: RoundDirection;
}

export interface Scope {
  type: 'all' | 'categories' | 'products';
  categories?: string[]; // '' = artículos sin categoría
  productIds?: string[];
  includeManual?: boolean; // incluir ítems manuales (no enlazados al catálogo) de las listas; solo con type 'all'
}

export interface Row {
  type: 'product' | 'priceItem';
  id: string;
  name: string;
  category: string | null;
  oldPrice: number;
  newPrice: number;
}

export const ROUND_STEPS = [0, 1, 5, 10, 50, 100, 500, 1000];
const MAX_PENDING_PER_BUSINESS = 50;

// ---------- Cálculo ----------

export function roundPrice(value: number, step: number, direction: RoundDirection): number {
  if (!step) return Math.round(value * 100) / 100;
  const q = value / step;
  // El margen 1e-9 evita que errores de coma flotante (10450.000000000002) cambien el resultado
  const n = direction === 'up' ? Math.ceil(q - 1e-9) : direction === 'down' ? Math.floor(q + 1e-9) : Math.round(q);
  return n * step;
}

export function computeNewPrice(oldPrice: number, rule: Rule): number {
  const raw = rule.operation === 'percent' ? oldPrice * (1 + rule.value / 100) : oldPrice + rule.value;
  return Math.max(0, roundPrice(raw, rule.roundStep, rule.roundDirection));
}

// ---------- Validación de la solicitud ----------

export interface Parsed { rule: Rule; scope: Scope }

export function parseRequest(body: any): Parsed | { error: string } {
  const operation = body?.operation;
  if (operation !== 'percent' && operation !== 'amount') return { error: 'La operación debe ser "percent" o "amount".' };

  const value = Number(body?.value);
  if (!Number.isFinite(value) || value === 0) return { error: 'Indicá un valor distinto de cero.' };
  if (operation === 'percent' && (value < -90 || value > 1000)) return { error: 'El porcentaje debe estar entre -90 y 1000.' };
  if (operation === 'amount' && Math.abs(value) > 1e9) return { error: 'El monto es demasiado grande.' };

  const roundStep = Number(body?.roundStep ?? 0);
  if (!ROUND_STEPS.includes(roundStep)) return { error: `El redondeo debe ser uno de: ${ROUND_STEPS.join(', ')}.` };
  const roundDirection = (body?.roundDirection ?? 'nearest') as RoundDirection;
  if (!['nearest', 'up', 'down'].includes(roundDirection)) return { error: 'La dirección del redondeo no es válida.' };

  const s = body?.scope ?? { type: 'all' };
  if (!['all', 'categories', 'products'].includes(s.type)) return { error: 'El alcance no es válido.' };
  const scope: Scope = { type: s.type };
  if (s.type === 'categories') {
    scope.categories = Array.isArray(s.categories) ? s.categories.map((c: unknown) => String(c).trim()).slice(0, 200) : [];
    if (!scope.categories?.length) return { error: 'Elegí al menos una categoría.' };
  }
  if (s.type === 'products') {
    scope.productIds = Array.isArray(s.productIds) ? s.productIds.map(String).slice(0, 5000) : [];
    if (!scope.productIds?.length) return { error: 'Elegí al menos un artículo.' };
  }
  if (s.type === 'all') scope.includeManual = !!s.includeManual;

  return { rule: { operation, value, roundStep, roundDirection }, scope };
}

export function describeChange(rule: Rule, scope: Scope): string {
  const sign = rule.value > 0 ? '+' : '';
  const what = rule.operation === 'percent' ? `${sign}${rule.value}%` : `${sign}$${rule.value}`;
  const where = scope.type === 'all' ? 'todos los artículos'
    : scope.type === 'categories' ? `categoría ${scope.categories!.map((c) => c || 'sin categoría').join(', ')}`
    : `${scope.productIds!.length} artículo(s) elegidos`;
  const round = rule.roundStep ? `, redondeo ${rule.roundDirection === 'up' ? 'hacia arriba' : rule.roundDirection === 'down' ? 'hacia abajo' : 'al más cercano'} a $${rule.roundStep}` : '';
  return `${what} a ${where}${round}`;
}

// ---------- Resolución de los artículos afectados ----------

type Db = Prisma.TransactionClient | typeof prisma;

export async function buildRows(businessId: string, scope: Scope, rule: Rule, db: Db = prisma): Promise<Row[]> {
  const where: Prisma.ProductWhereInput = { businessId };
  if (scope.type === 'categories') {
    const named = scope.categories!.filter((c) => c !== '');
    where.OR = [
      ...(named.length ? [{ category: { in: named } }] : []),
      ...(scope.categories!.includes('') ? [{ category: null }] : [])
    ];
  }
  if (scope.type === 'products') where.id = { in: scope.productIds };

  const products = await db.product.findMany({ where, select: { id: true, name: true, category: true, price: true }, orderBy: { name: 'asc' } });
  const rows: Row[] = products.map((p) => ({
    type: 'product', id: p.id, name: p.name, category: p.category, oldPrice: p.price, newPrice: computeNewPrice(p.price, rule)
  }));

  if (scope.type === 'all' && scope.includeManual) {
    const items = await db.priceItem.findMany({
      where: { productId: null, priceList: { businessId } },
      select: { id: true, productName: true, category: true, price: true, priceList: { select: { name: true } } }
    });
    for (const i of items) {
      rows.push({
        type: 'priceItem', id: i.id, name: `${i.productName} (lista: ${i.priceList.name})`, category: i.category,
        oldPrice: i.price, newPrice: computeNewPrice(i.price, rule)
      });
    }
  }
  return rows.filter((r) => r.newPrice !== r.oldPrice);
}

// ---------- Aplicar / deshacer ----------

const ruleOf = (c: { operation: string; value: number; roundStep: number; roundDirection: string }): Rule => ({
  operation: c.operation as Operation, value: c.value, roundStep: c.roundStep, roundDirection: c.roundDirection as RoundDirection
});

// El cambio debe estar en estado 'applying' (lo reclama quien lo llama). Es atómico: o se aplican todos los precios o ninguno.
export async function applyChange(changeId: string): Promise<number> {
  const change = await prisma.priceChange.findUniqueOrThrow({ where: { id: changeId } });
  const rule = ruleOf(change);
  const scope = change.scope as unknown as Scope;

  return prisma.$transaction(async (tx) => {
    const rows = await buildRows(change.businessId, scope, rule, tx);
    for (const r of rows) {
      if (r.type === 'product') await tx.product.update({ where: { id: r.id }, data: { price: r.newPrice } });
      else await tx.priceItem.update({ where: { id: r.id }, data: { price: r.newPrice } });
    }
    await tx.priceChangeItem.createMany({
      data: rows.map((r) => ({ changeId, targetType: r.type, targetId: r.id, name: r.name, oldPrice: r.oldPrice, newPrice: r.newPrice }))
    });
    await tx.priceChange.update({
      where: { id: changeId },
      data: { status: 'applied', appliedAt: new Date(), affectedCount: rows.length, errorMessage: null }
    });
    return rows.length;
  }, { timeout: 120000, maxWait: 10000 });
}

// Restaura los precios anteriores, pero solo de los artículos que siguen con el precio que puso este cambio
// (si alguien los modificó después, no se pisa su trabajo).
export async function undoChange(changeId: string): Promise<{ reverted: number; skipped: number }> {
  const items = await prisma.priceChangeItem.findMany({ where: { changeId } });

  return prisma.$transaction(async (tx) => {
    let reverted = 0;
    let skipped = 0;
    for (const it of items) {
      const current = it.targetType === 'product'
        ? await tx.product.findUnique({ where: { id: it.targetId }, select: { price: true } })
        : await tx.priceItem.findUnique({ where: { id: it.targetId }, select: { price: true } });
      if (!current || Math.abs(current.price - it.newPrice) > 0.005) { skipped++; continue; }
      if (it.targetType === 'product') await tx.product.update({ where: { id: it.targetId }, data: { price: it.oldPrice } });
      else await tx.priceItem.update({ where: { id: it.targetId }, data: { price: it.oldPrice } });
      reverted++;
    }
    await tx.priceChange.update({
      where: { id: changeId },
      data: { status: 'undone', undoneAt: new Date(), undoSummary: `${reverted} restaurado(s), ${skipped} omitido(s) por haber cambiado después` }
    });
    return { reverted, skipped };
  }, { timeout: 120000, maxWait: 10000 });
}

export async function countPending(businessId: string): Promise<boolean> {
  return (await prisma.priceChange.count({ where: { businessId, status: 'pending' } })) >= MAX_PENDING_PER_BUSINESS;
}

// ---------- Programador ----------

async function runDue() {
  const due = await prisma.priceChange.findMany({
    where: { status: 'pending', scheduledFor: { lte: new Date() }, business: { active: true } },
    take: 20,
    orderBy: { scheduledFor: 'asc' }
  });
  for (const change of due) {
    // Reclamar atómicamente: si dos ciclos coinciden, solo uno lo aplica
    const claimed = await prisma.priceChange.updateMany({ where: { id: change.id, status: 'pending' }, data: { status: 'applying' } });
    if (claimed.count === 0) continue;
    try {
      const n = await applyChange(change.id);
      console.log(`Cambio de precios programado aplicado (${change.description}): ${n} artículo(s)`);
    } catch (error) {
      console.error('Error aplicando cambio de precios programado:', error);
      await prisma.priceChange.update({
        where: { id: change.id },
        data: { status: 'failed', errorMessage: error instanceof Error ? error.message.slice(0, 300) : 'Error desconocido' }
      });
    }
  }
}

let running = false;
export function startPriceScheduler(intervalMs = 30_000) {
  // Un cambio que quedó "aplicándose" por un reinicio no se confirmó (la transacción es atómica, no quedó a medias):
  // los programados se reintentan, los inmediatos se marcan como fallidos y los que se estaban deshaciendo vuelven a "aplicado".
  (async () => {
    await prisma.priceChange.updateMany({ where: { status: 'applying', appliedAt: { not: null } }, data: { status: 'applied' } });
    await prisma.priceChange.updateMany({ where: { status: 'applying', appliedAt: null, scheduledFor: { not: null } }, data: { status: 'pending' } });
    await prisma.priceChange.updateMany({
      where: { status: 'applying', appliedAt: null, scheduledFor: null },
      data: { status: 'failed', errorMessage: 'Se interrumpió por un reinicio del servidor. No se modificó ningún precio.' }
    });
  })().catch((e) => console.error('Programador de precios:', e));

  const tick = async () => {
    if (running) return;
    running = true;
    try { await runDue(); } catch (e) { console.error('Programador de precios:', e); } finally { running = false; }
  };
  setTimeout(tick, 5000);
  return setInterval(tick, intervalMs);
}
