import { Router } from 'express';
import prisma from '../prisma';
import { bid, requireBusiness } from '../auth';
import { applyChange, buildRows, countPending, describeChange, parseRequest, undoChange } from '../pricing';

const router = Router();
router.use(requireBusiness);

const PREVIEW_ROWS = 300;

// Categorías y unidades que ya usa el negocio (para sugerirlas en los formularios)
router.get('/meta', async (req, res) => {
  const businessId = bid(req);
  const [cats, units, withoutCategory] = await Promise.all([
    prisma.product.groupBy({ by: ['category'], where: { businessId, category: { not: null } }, _count: true, orderBy: { category: 'asc' } }),
    prisma.product.groupBy({ by: ['unit'], where: { businessId, unit: { not: null } }, _count: true, orderBy: { unit: 'asc' } }),
    prisma.product.count({ where: { businessId, category: null } })
  ]);
  res.json({
    categories: cats.map((c) => ({ name: c.category, count: c._count })),
    withoutCategory,
    units: units.map((u) => u.unit)
  });
});

// Muestra qué pasaría, sin cambiar nada
router.post('/preview', async (req, res) => {
  const parsed = parseRequest(req.body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  const rows = await buildRows(bid(req), parsed.scope, parsed.rule);
  res.json({
    description: describeChange(parsed.rule, parsed.scope),
    count: rows.length,
    shown: Math.min(rows.length, PREVIEW_ROWS),
    rows: rows.slice(0, PREVIEW_ROWS)
  });
});

// Crea un cambio: se aplica ahora o queda programado para scheduledFor
router.post('/changes', async (req, res) => {
  const businessId = bid(req);
  const parsed = parseRequest(req.body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  let scheduledFor: Date | null = null;
  if (req.body?.scheduledFor) {
    scheduledFor = new Date(req.body.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) return res.status(400).json({ error: 'La fecha programada no es válida.' });
    if (scheduledFor.getTime() <= Date.now() + 30_000) return res.status(400).json({ error: 'La fecha programada debe estar en el futuro.' });
    if (scheduledFor.getTime() > Date.now() + 366 * 24 * 3600 * 1000) return res.status(400).json({ error: 'La fecha programada no puede superar un año.' });
    if (await countPending(businessId)) return res.status(400).json({ error: 'Tenés demasiados cambios programados. Cancelá alguno primero.' });
  }

  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 120) : '';
  const base = describeChange(parsed.rule, parsed.scope);
  const change = await prisma.priceChange.create({
    data: {
      businessId,
      description: note ? `${note} — ${base}` : base,
      operation: parsed.rule.operation,
      value: parsed.rule.value,
      roundStep: parsed.rule.roundStep,
      roundDirection: parsed.rule.roundDirection,
      scope: parsed.scope as object,
      status: scheduledFor ? 'pending' : 'applying',
      scheduledFor
    }
  });

  if (scheduledFor) return res.status(201).json(change);

  try {
    await applyChange(change.id);
  } catch (error) {
    console.error('Error aplicando cambio de precios:', error);
    await prisma.priceChange.update({ where: { id: change.id }, data: { status: 'failed', errorMessage: 'No se pudo aplicar el cambio.' } });
    return res.status(500).json({ error: 'No se pudo aplicar el cambio de precios. No se modificó ningún precio.' });
  }
  res.status(201).json(await prisma.priceChange.findUniqueOrThrow({ where: { id: change.id } }));
});

router.get('/changes', async (req, res) => {
  const changes = await prisma.priceChange.findMany({
    where: { businessId: bid(req) },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  res.json(changes);
});

router.get('/changes/:id', async (req, res) => {
  const change = await prisma.priceChange.findFirst({
    where: { id: String(req.params.id), businessId: bid(req) },
    include: { items: { take: 1000, orderBy: { name: 'asc' } } }
  });
  if (!change) return res.status(404).json({ error: 'Cambio no encontrado' });
  res.json(change);
});

router.post('/changes/:id/undo', async (req, res) => {
  const change = await prisma.priceChange.findFirst({ where: { id: String(req.params.id), businessId: bid(req) } });
  if (!change) return res.status(404).json({ error: 'Cambio no encontrado' });
  if (change.status !== 'applied') return res.status(400).json({ error: 'Solo se pueden deshacer cambios ya aplicados.' });

  // Reclamar para que un doble clic no lo deshaga dos veces
  const claimed = await prisma.priceChange.updateMany({ where: { id: change.id, status: 'applied' }, data: { status: 'applying' } });
  if (claimed.count === 0) return res.status(409).json({ error: 'El cambio ya se está procesando.' });
  try {
    const result = await undoChange(change.id);
    res.json({ ...result, change: await prisma.priceChange.findUniqueOrThrow({ where: { id: change.id } }) });
  } catch (error) {
    console.error('Error deshaciendo cambio de precios:', error);
    await prisma.priceChange.update({ where: { id: change.id }, data: { status: 'applied' } });
    res.status(500).json({ error: 'No se pudo deshacer el cambio. No se modificó ningún precio.' });
  }
});

router.post('/changes/:id/cancel', async (req, res) => {
  const result = await prisma.priceChange.updateMany({
    where: { id: String(req.params.id), businessId: bid(req), status: 'pending' },
    data: { status: 'cancelled' }
  });
  if (result.count === 0) return res.status(400).json({ error: 'Solo se pueden cancelar cambios programados que aún no se aplicaron.' });
  res.json({ success: true });
});

export default router;
