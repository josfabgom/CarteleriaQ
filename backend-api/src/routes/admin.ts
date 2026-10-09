import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../prisma';
import { MIN_PASSWORD_LENGTH, hashPassword, requireSuperadmin } from '../auth';
import { UPLOAD_DIR } from '../config';

const router = Router();
router.use(requireSuperadmin);

const toInt = (value: unknown, fallback: number, min = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
};

async function listBusinesses(onlyId?: string) {
  const businesses = await prisma.business.findMany({
    where: onlyId ? { id: onlyId } : undefined,
    include: { user: true, _count: { select: { screens: true } } },
    orderBy: { createdAt: 'desc' }
  });
  const sizes = await prisma.media.groupBy({ by: ['businessId'], _sum: { size: true } });
  const usedBy = new Map(sizes.map((s) => [s.businessId, s._sum.size ?? 0]));

  return businesses.map((b) => ({
    id: b.id,
    name: b.name,
    active: b.active,
    username: b.user?.username ?? null,
    maxScreens: b.maxScreens,
    storageLimitMb: b.storageLimitMb,
    screens: b._count.screens,
    storageUsedBytes: usedBy.get(b.id) ?? 0,
    createdAt: b.createdAt
  }));
}

router.get('/businesses', async (req, res) => {
  res.json(await listBusinesses());
});

// Crear negocio junto con su único usuario
router.post('/businesses', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!name || !username) return res.status(400).json({ error: 'Nombre y usuario son obligatorios' });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
  }
  if (await prisma.user.findUnique({ where: { username } })) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
  }

  const business = await prisma.business.create({
    data: {
      name,
      maxScreens: toInt(req.body?.maxScreens, 3, 1),
      storageLimitMb: toInt(req.body?.storageLimitMb, 1024, 1),
      user: { create: { username, passwordHash: await hashPassword(password), role: 'business' } }
    }
  });
  res.status(201).json((await listBusinesses(business.id))[0]);
});

router.put('/businesses/:id', async (req, res) => {
  const id = String(req.params.id);
  const business = await prisma.business.findUnique({ where: { id }, include: { user: true } });
  if (!business) return res.status(404).json({ error: 'Negocio no encontrado' });

  const data: Record<string, unknown> = {};
  if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim();
  if (typeof req.body?.active === 'boolean') data.active = req.body.active;
  if (req.body?.maxScreens !== undefined) data.maxScreens = toInt(req.body.maxScreens, business.maxScreens, 1);
  if (req.body?.storageLimitMb !== undefined) data.storageLimitMb = toInt(req.body.storageLimitMb, business.storageLimitMb, 1);
  await prisma.business.update({ where: { id }, data });

  const password = req.body?.password ? String(req.body.password) : '';
  if (password && business.user) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
    }
    await prisma.user.update({ where: { id: business.user.id }, data: { passwordHash: await hashPassword(password) } });
  }

  res.json((await listBusinesses(id))[0]);
});

// Borra el negocio, todos sus datos y sus archivos
router.delete('/businesses/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!(await prisma.business.findUnique({ where: { id } }))) {
    return res.status(404).json({ error: 'Negocio no encontrado' });
  }
  await prisma.business.delete({ where: { id } }); // cascada: usuario, pantallas, listas, medios, productos
  fs.rmSync(path.join(UPLOAD_DIR, path.basename(id)), { recursive: true, force: true });
  res.json({ success: true });
});

export default router;
