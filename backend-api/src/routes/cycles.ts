import { Router } from 'express';
import prisma from '../prisma';
import { bid, requireBusiness } from '../auth';
import { buildScenes, replaceScenes, starterScenes, validateScenes, SceneData, Template } from '../scenes';

const router = Router();
router.use(requireBusiness);

const MAX_CYCLES = 100;
const TEMPLATES: Template[] = ['prices', 'prices-offers', 'full'];

const totalSeconds = (items: { duration: number; enabled: boolean }[]) =>
  items.filter((i) => i.enabled).reduce((sum, i) => sum + i.duration, 0);

// Ciclos del negocio con un resumen
router.get('/', async (req, res) => {
  const cycles = await prisma.playlist.findMany({
    where: { businessId: bid(req) },
    include: {
      items: { where: { type: { not: 'legacy' } }, select: { type: true, duration: true, enabled: true } },
      screens: { select: { id: true, name: true } }
    },
    orderBy: [{ private: 'asc' }, { createdAt: 'asc' }]
  });
  res.json(cycles.map((c) => ({
    id: c.id,
    name: c.name,
    private: c.private,
    scenes: c.items.length,
    types: [...new Set(c.items.map((i) => i.type))],
    totalSeconds: totalSeconds(c.items),
    screens: c.screens
  })));
});

// Crear un ciclo, vacío o desde una plantilla de inicio
router.post('/', async (req, res) => {
  const businessId = bid(req);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  if (!name) return res.status(400).json({ error: 'Poné un nombre al ciclo.' });
  if ((await prisma.playlist.count({ where: { businessId } })) >= MAX_CYCLES) {
    return res.status(400).json({ error: `Alcanzaste el máximo de ${MAX_CYCLES} ciclos.` });
  }

  const template = TEMPLATES.includes(req.body?.template) ? (req.body.template as Template) : null;
  const scenes: SceneData[] = template ? await starterScenes(businessId, template) : [];

  const cycle = await prisma.$transaction(async (tx) => {
    const created = await tx.playlist.create({ data: { name, businessId } });
    await replaceScenes(tx, created.id, scenes);
    return created;
  });
  res.status(201).json({ id: cycle.id, name: cycle.name, scenes: scenes.length });
});

// Un ciclo con sus escenas y los datos de lo que referencian (para mostrar en el editor)
router.get('/:id', async (req, res) => {
  const businessId = bid(req);
  const cycle = await prisma.playlist.findFirst({
    where: { id: String(req.params.id), businessId },
    include: {
      screens: { select: { id: true, name: true } },
      items: { where: { type: { not: 'legacy' } }, orderBy: { order: 'asc' }, include: { media: true, priceList: { select: { id: true, name: true } } } }
    }
  });
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const sideIds = [...new Set(cycle.items.flatMap((i) => ((i.config as any)?.sideMediaIds as string[]) ?? []))];
  const sideMedia = sideIds.length ? await prisma.media.findMany({ where: { id: { in: sideIds }, businessId } }) : [];

  res.json({
    id: cycle.id,
    name: cycle.name,
    private: cycle.private,
    screens: cycle.screens,
    totalSeconds: totalSeconds(cycle.items),
    scenes: cycle.items.map((i) => ({
      id: i.id,
      type: i.type,
      name: i.name,
      duration: i.duration,
      enabled: i.enabled,
      priceListId: i.priceListId,
      mediaId: i.mediaId,
      config: i.config ?? {},
      refs: {
        priceListName: i.priceList?.name ?? null,
        media: i.media ? { id: i.media.id, url: i.media.url, type: i.media.type, name: i.media.name } : null,
        sideMedia: (((i.config as any)?.sideMediaIds as string[]) ?? [])
          .map((id) => sideMedia.find((m) => m.id === id))
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map((m) => ({ id: m.id, url: m.url, type: m.type, name: m.name }))
      }
    }))
  });
});

// Qué mostraría hoy cada escena (las ofertas y las listas se calculan en vivo)
router.get('/:id/preview', async (req, res) => {
  const businessId = bid(req);
  const cycle = await prisma.playlist.findFirst({
    where: { id: String(req.params.id), businessId },
    include: { items: { where: { type: { not: 'legacy' } }, select: { id: true, enabled: true, duration: true } } }
  });
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const shown = await buildScenes(cycle.id, businessId);
  const byId = new Map(shown.map((s: any) => [s.id, s]));
  res.json({
    scenes: cycle.items.map((i) => {
      const s: any = byId.get(i.id);
      const count = !s ? 0 : s.items ? s.items.length : s.priceList ? s.priceList.items.length : 1;
      return { id: i.id, enabled: i.enabled, shown: !!s, count };
    }),
    totalSeconds: shown.reduce((sum: number, s: any) => sum + s.duration, 0)
  });
});

router.put('/:id', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  if (!name) return res.status(400).json({ error: 'Poné un nombre al ciclo.' });
  const result = await prisma.playlist.updateMany({ where: { id: String(req.params.id), businessId: bid(req) }, data: { name } });
  if (result.count === 0) return res.status(404).json({ error: 'Ciclo no encontrado' });
  res.json({ success: true });
});

// Reemplaza todas las escenas del ciclo de una vez (lo que guarda el editor)
router.put('/:id/scenes', async (req, res) => {
  const businessId = bid(req);
  const cycle = await prisma.playlist.findFirst({ where: { id: String(req.params.id), businessId } });
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const parsed = await validateScenes(businessId, req.body?.scenes);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  await prisma.$transaction((tx) => replaceScenes(tx, cycle.id, parsed.scenes));
  res.json({ success: true, scenes: parsed.scenes.length });
});

router.post('/:id/duplicate', async (req, res) => {
  const businessId = bid(req);
  const source = await prisma.playlist.findFirst({
    where: { id: String(req.params.id), businessId },
    include: { items: { where: { type: { not: 'legacy' } }, orderBy: { order: 'asc' } } }
  });
  if (!source) return res.status(404).json({ error: 'Ciclo no encontrado' });
  if ((await prisma.playlist.count({ where: { businessId } })) >= MAX_CYCLES) {
    return res.status(400).json({ error: `Alcanzaste el máximo de ${MAX_CYCLES} ciclos.` });
  }

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.playlist.create({ data: { name: `${source.name} (copia)`.slice(0, 80), businessId } });
    await tx.playlistItem.createMany({
      data: source.items.map((i, order) => ({
        playlistId: created.id, order, type: i.type, name: i.name, duration: i.duration, enabled: i.enabled,
        priceListId: i.priceListId, mediaId: i.mediaId, config: (i.config ?? {}) as object
      }))
    });
    return created;
  });
  res.status(201).json({ id: copy.id, name: copy.name });
});

// Las pantallas que lo usan quedan sin ciclo (la TV muestra el fondo de espera)
router.delete('/:id', async (req, res) => {
  const result = await prisma.playlist.deleteMany({ where: { id: String(req.params.id), businessId: bid(req) } });
  if (result.count === 0) return res.status(404).json({ error: 'Ciclo no encontrado' });
  res.json({ success: true });
});

export default router;
