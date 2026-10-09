import { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from './prisma';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error('Definí JWT_SECRET (mínimo 16 caracteres) en las variables de entorno.');
}

export type Role = 'superadmin' | 'business';

export interface AuthPayload {
  userId: string;
  role: Role;
  businessId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      screenId?: string;
    }
  }
}

export const MIN_PASSWORD_LENGTH = 8;

// Hash válido que se compara cuando el usuario no existe (mismo tiempo de respuesta)
export const DUMMY_HASH = bcrypt.hashSync('sin-usuario', 10);

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export const signToken = (payload: AuthPayload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');

const bearer = (req: Request): string | null => {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.slice(7) : null;
};

// Usuario del dashboard (administrador o negocio). Se consulta la base en cada request
// para que desactivar un negocio o borrar un usuario surta efecto de inmediato.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    res.status(401).json({ error: 'Sesión inválida o vencida' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { business: true }
  });
  if (!user) {
    res.status(401).json({ error: 'Usuario inexistente' });
    return;
  }
  if (user.business && !user.business.active) {
    res.status(403).json({ error: 'Cuenta suspendida. Contactá al administrador.' });
    return;
  }

  req.auth = { userId: user.id, role: user.role as Role, businessId: user.businessId };
  next();
};

export const requireSuperadmin: RequestHandler = (req, res, next) =>
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.auth?.role !== 'superadmin') {
      res.status(403).json({ error: 'Solo el administrador' });
      return;
    }
    next();
  });

// Rutas del negocio: garantizan que req.auth.businessId existe
export const requireBusiness: RequestHandler = (req, res, next) =>
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.auth?.role !== 'business' || !req.auth.businessId) {
      res.status(403).json({ error: 'Solo usuarios de un negocio' });
      return;
    }
    next();
  });

// Cada request del negocio opera sobre su propio businessId
export const bid = (req: Request): string => req.auth!.businessId!;

// Reproductor de TV: autentica con el token entregado al vincular la pantalla
export const requireScreenToken: RequestHandler = async (req, res, next) => {
  const token = bearer(req);
  const screen = await prisma.screen.findUnique({ where: { id: String(req.params.id) } });
  if (!token || !screen || !screen.tokenHash) {
    res.status(401).json({ error: 'Pantalla no autorizada' });
    return;
  }

  const given = Buffer.from(sha256(token));
  const stored = Buffer.from(screen.tokenHash);
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    res.status(401).json({ error: 'Pantalla no autorizada' });
    return;
  }
  req.screenId = screen.id;
  next();
};

// Crea el administrador inicial a partir de ADMIN_USERNAME / ADMIN_PASSWORD si no existe ninguno
export async function ensureSuperadmin() {
  if (await prisma.user.findFirst({ where: { role: 'superadmin' } })) return;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Definí ADMIN_USERNAME y ADMIN_PASSWORD (mínimo ${MIN_PASSWORD_LENGTH} caracteres) para crear el administrador.`);
  }
  await prisma.user.create({
    data: { username: username.trim().toLowerCase(), passwordHash: await hashPassword(password), role: 'superadmin' }
  });
  console.log(`Administrador "${username}" creado.`);
}
