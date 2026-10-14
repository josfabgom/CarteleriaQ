import crypto from 'crypto';
import { Router, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { IntegrationKey, Prisma } from '@prisma/client';
import prisma from '../prisma';
import { bid, requireBusiness, sha256 } from '../auth';
import { categorize, prettyName } from '../categories';

// Integración con Itegra (administrador de balanzas): un programa instalado en el local ("worker") lee la base de
// Itegra y sube los artículos a la nube. Se autentica con una clave de integración que pertenece a UN negocio.

const router = Router();

const MAX_ITEMS = 5000;
const MAX_KEYS = 10;
const MAX_MISSING_RATIO = 0.3; // si faltan más de este % de los artículos ya sincronizados, se pide confirmación explícita
const MIN_MISSING_ALLOWED = 10;
const ONLINE_WINDOW_MS = 15 * 60 * 1000;

const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes' }
});

// ---------- Lo que llama el worker (autenticado con la clave de integración) ----------

const requireIntegrationKey: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token.startsWith('itg_')) return void res.status(401).json({ error: 'Clave de integración inválida' });

  const key = await prisma.integrationKey.findUnique({ where: { keyHash: sha256(token) }, include: { business: { select: { name: true, active: true } } } });
  if (!key || key.revokedAt) return void res.status(401).json({ error: 'Clave de integración inválida o revocada' });
  if (!key.business.active) return void res.status(403).json({ error: 'El negocio está suspendido' });
  res.locals.integration = key;
  next();
};

interface Incoming { code: string; name: string; price: number; unit: string | null }

const round2 = (n: number) => Math.round(n * 100) / 100;

function readItems(input: unknown): { items: Incoming[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'Faltan los artículos (items).' };
  if (input.length > MAX_ITEMS) return { error: `Demasiados artículos en un envío (máximo ${MAX_ITEMS}).` };
  const byCode = new Map<string, Incoming>();
  for (const [i, raw] of input.entries()) {
    const code = typeof raw?.code === 'string' || typeof raw?.code === 'number' ? String(raw.code).trim() : '';
    const name = typeof raw?.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : '';
    const price = Number(raw?.price);
    const unit = typeof raw?.unit === 'string' && raw.unit.trim() ? raw.unit.trim().slice(0, 30) : null;
    if (!code || code.length > 40) return { error: `Artículo ${i + 1}: código inválido.` };
    if (!name || name.length > 150) return { error: `Artículo ${i + 1} (${code}): nombre inválido.` };
    if (!Number.isFinite(price) || price < 0 || price > 1e9) return { error: `Artículo ${i + 1} (${code}): precio inválido.` };
    byCode.set(code, { code, name, price: round2(price), unit });
  }
  return { items: [...byCode.values()] };
}

router.post('/itegra/sync', syncLimiter, requireIntegrationKey, async (req, res) => {
  const key = res.locals.integration as IntegrationKey & { business: { name: string } };
  const body = req.body ?? {};
  const mode = body.mode;
  if (!['ping', 'preview', 'apply'].includes(mode)) return void res.status(400).json({ error: 'mode debe ser ping, preview o apply.' });

  const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint.trim().slice(0, 100) : '';
  if (!fingerprint) return void res.status(400).json({ error: 'Falta la identidad de la base (fingerprint).' });
  if (key.fingerprint && key.fingerprint !== fingerprint) {
    return void res.status(409).json({ code: 'fingerprint_mismatch', error: 'Esta clave ya está vinculada a otra base de Itegra. Si cambió la base, desvinculala desde el panel.' });
  }

  const now = new Date();
  if (mode === 'ping') {
    await prisma.integrationKey.update({ where: { id: key.id }, data: { lastSeenAt: now } });
    return void res.json({ ok: true, business: key.business.name });
  }

  const parsed = readItems(body.items);
  if ('error' in parsed) return void res.status(400).json({ error: parsed.error });
  const items = parsed.items;
  const businessId = key.businessId;
  const full = body.full === true;
  const force = body.force === true;

  const codes = items.map((i) => i.code);
  const existing = await prisma.product.findMany({ where: { businessId, OR: [{ source: 'itegra' }, { internalCode: { in: codes } }] } });
  const byCode = new Map(existing.filter((p) => p.internalCode).map((p) => [p.internalCode as string, p]));

  const creates: Prisma.ProductCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.ProductUpdateInput }[] = [];
  const conflicts: { code: string; name: string }[] = [];
  let unchanged = 0;
  let restored = 0;

  for (const it of items) {
    const found = byCode.get(it.code);
    const name = prettyName(it.name);
    if (!found) {
      creates.push({ businessId, internalCode: it.code, name, price: it.price, unit: it.unit, category: categorize(it.name), source: 'itegra', available: true });
      continue;
    }
    if (found.source !== 'itegra') { conflicts.push({ code: it.code, name: found.name }); continue; } // cargado a mano: no se toca

    // Itegra manda sobre nombre, precio y unidad; categoría, foto, etiqueta y precio anterior son de la nube
    const data: Prisma.ProductUpdateInput = {};
    if (found.name !== name) data.name = name;
    if (round2(found.price) !== it.price) data.price = it.price;
    if (it.unit && found.unit !== it.unit) data.unit = it.unit;
    if (!found.category) data.category = categorize(it.name);
    if (found.autoHidden) { data.available = true; data.autoHidden = false; restored++; }
    if (Object.keys(data).length) updates.push({ id: found.id, data }); else unchanged++;
  }

  // Artículos que ya no están en Itegra: se marcan sin stock (no se borran). Solo en una revisión completa.
  const incomingCodes = new Set(codes);
  const itegraProducts = existing.filter((p) => p.source === 'itegra');
  const missing = full ? itegraProducts.filter((p) => !incomingCodes.has(p.internalCode ?? '') && !p.autoHidden) : [];
  const missingLimit = Math.max(MIN_MISSING_ALLOWED, Math.ceil(itegraProducts.length * MAX_MISSING_RATIO));
  const needsForce = missing.length > missingLimit;
  if (mode === 'apply' && needsForce && !force) {
    return void res.status(409).json({
      code: 'too_many_missing',
      error: `Faltan ${missing.length} de ${itegraProducts.length} artículos en lo que se envió. Parece un error de lectura; revisá la base o confirmá con force.`
    });
  }

  const summary = {
    mode,
    at: now.toISOString(),
    total: items.length,
    created: creates.length,
    updated: updates.length,
    unchanged,
    restored,
    hidden: missing.length,
    conflicts: conflicts.length,
    needsForce
  };

  if (mode === 'apply') {
    await prisma.$transaction(
      async (tx) => {
        if (creates.length) await tx.product.createMany({ data: creates, skipDuplicates: true });
        for (const u of updates) await tx.product.update({ where: { id: u.id }, data: u.data });
        if (missing.length) await tx.product.updateMany({ where: { id: { in: missing.map((p) => p.id) } }, data: { available: false, autoHidden: true } });
        await tx.integrationKey.update({
          where: { id: key.id },
          data: { fingerprint: key.fingerprint ?? fingerprint, lastSeenAt: now, lastSyncAt: now, lastSummary: summary }
        });
      },
      { timeout: 60000 }
    );
  } else {
    await prisma.integrationKey.update({ where: { id: key.id }, data: { lastSeenAt: now, lastSummary: summary } });
  }

  res.json({
    ...summary,
    business: key.business.name,
    sampleCreated: creates.slice(0, 8).map((c) => ({ code: c.internalCode, name: c.name, category: c.category, price: c.price, unit: c.unit })),
    conflictList: conflicts.slice(0, 20)
  });
});

// ---------- Lo que usa el negocio desde el panel ----------

router.use(requireBusiness);

const publicKey = (k: IntegrationKey) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  linked: !!k.fingerprint,
  fingerprint: k.fingerprint,
  lastSeenAt: k.lastSeenAt,
  lastSyncAt: k.lastSyncAt,
  lastSummary: k.lastSummary,
  revoked: !!k.revokedAt,
  online: !!k.lastSeenAt && Date.now() - k.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
  createdAt: k.createdAt
});

router.get('/keys', async (req, res) => {
  const keys = await prisma.integrationKey.findMany({ where: { businessId: bid(req) }, orderBy: { createdAt: 'desc' } });
  res.json(keys.map(publicKey));
});

router.post('/keys', async (req, res) => {
  const businessId = bid(req);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  if (!name) return void res.status(400).json({ error: 'Poné un nombre para la clave (por ejemplo, "PC del mostrador").' });
  if ((await prisma.integrationKey.count({ where: { businessId, revokedAt: null } })) >= MAX_KEYS) {
    return void res.status(400).json({ error: `Alcanzaste el máximo de ${MAX_KEYS} claves activas.` });
  }
  const secret = 'itg_' + crypto.randomBytes(24).toString('hex');
  const created = await prisma.integrationKey.create({ data: { businessId, name, prefix: secret.slice(0, 8), keyHash: sha256(secret) } });
  res.status(201).json({ ...publicKey(created), key: secret });
});

// La base de Itegra cambió (PC nueva, reinstalación): se permite atar la clave a la nueva
router.post('/keys/:id/unbind', async (req, res) => {
  const result = await prisma.integrationKey.updateMany({ where: { id: String(req.params.id), businessId: bid(req) }, data: { fingerprint: null } });
  if (result.count === 0) return void res.status(404).json({ error: 'Clave no encontrada' });
  res.json({ success: true });
});

router.delete('/keys/:id', async (req, res) => {
  const result = await prisma.integrationKey.updateMany({ where: { id: String(req.params.id), businessId: bid(req), revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count === 0) return void res.status(404).json({ error: 'Clave no encontrada' });
  res.json({ success: true });
});

export default router;
