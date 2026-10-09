import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../prisma';
import { DUMMY_HASH, MIN_PASSWORD_LENGTH, hashPassword, requireAuth, signToken, verifyPassword, Role } from '../auth';
import { getUsage } from '../usage';

const router = Router();

// Freno a la fuerza bruta: solo cuentan los intentos fallidos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' }
});

const describeUser = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { business: true } });
  return {
    username: user.username,
    role: user.role as Role,
    business: user.business
      ? { id: user.business.id, name: user.business.name, usage: await getUsage(user.business.id) }
      : null
  };
};

router.post('/login', loginLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Ingresá usuario y contraseña' });

  const user = await prisma.user.findUnique({ where: { username }, include: { business: true } });
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  if (user.business && !user.business.active) {
    return res.status(403).json({ error: 'Cuenta suspendida. Contactá al administrador.' });
  }

  const token = signToken({ userId: user.id, role: user.role as Role, businessId: user.businessId });
  res.json({ token, ...(await describeUser(user.id)) });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json(await describeUser(req.auth!.userId));
});

router.post('/change-password', requireAuth, async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  if (next.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `La contraseña nueva debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  res.json({ success: true });
});

export default router;
