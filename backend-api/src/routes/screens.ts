import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../prisma';
import { bid, randomToken, requireBusiness, requireScreenToken, sha256 } from '../auth';
import { PRODUCT_WITH_IMAGE, resolveItems } from '../menu';

const router = Router();

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // sin sync en 2 min => offline
const LAST_SEEN_THROTTLE_MS = 30 * 1000; // no escribir lastSeenAt en cada polling
const PENDING_TTL_MS = 60 * 60 * 1000; // códigos sin vincular expiran en 1 h
const PRICE_LIST_DURATION = 60;

// Alfabeto sin caracteres ambiguos (0/O, 1/I) para tipear fácil desde la TV
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateCode = () =>
  Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

// Nunca se exponen los secretos de la pantalla al dashboard
const publicScreen = <T extends { tokenHash?: unknown; pairingToken?: unknown; pairingCode?: unknown }>(screen: T) => {
  const { tokenHash, pairingToken, ...rest } = screen;
  return rest;
};

const withLiveStatus = <T extends { status: string; lastSeenAt: Date | null }>(screen: T): T => {
  if (screen.status === 'pending') return screen;
  const online = !!screen.lastSeenAt && Date.now() - screen.lastSeenAt.getTime() < ONLINE_WINDOW_MS;
  return { ...screen, status: online ? 'online' : 'offline' };
};

// El registro es público (lo llama la TV): limitar para que nadie llene la tabla de pendientes
const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes' }
});

const pairingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes' }
});

// ---------- Rutas de la TV ----------

// Registrar pantalla desde la TV
router.post('/register', registerLimiter, async (req, res) => {
  try {
    // Limpiar pantallas que nunca se vincularon
    await prisma.screen.deleteMany({
      where: { status: 'pending', createdAt: { lt: new Date(Date.now() - PENDING_TTL_MS) } }
    });

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const code = generateCode();
        const newScreen = await prisma.screen.create({
          data: { name: 'Nueva Pantalla (No vinculada)', status: 'pending', pairingCode: code }
        });
        return res.status(201).json({ code, id: newScreen.id });
      } catch (error: any) {
        if (error.code !== 'P2002') throw error; // colisión de código: reintentar
      }
    }
    res.status(500).json({ error: 'No se pudo generar un código único' });
  } catch (error) {
    console.error('Register screen error:', error);
    res.status(500).json({ error: 'Error registering screen' });
  }
});

// Comprobar si la pantalla ya se vinculó (polling desde la TV). Entrega el token una vez vinculada.
router.get('/check-pairing/:code', pairingLimiter, async (req, res) => {
  try {
    const screen = await prisma.screen.findUnique({ where: { pairingCode: String(req.params.code) } });
    if (!screen) return res.status(404).json({ error: 'Not found' });

    if (screen.status !== 'pending' && screen.pairingToken) {
      res.json({ linked: true, screenId: screen.id, token: screen.pairingToken });
    } else {
      res.json({ linked: false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error checking pairing' });
  }
});

// Configuración de la pantalla (la consulta el reproductor con su token)
router.get('/:id/sync', requireScreenToken, async (req, res) => {
  try {
    const id = req.screenId!;
    const screen = await prisma.screen.findUnique({
      where: { id },
      include: {
        playlist: {
          include: {
            items: {
              include: { media: true, priceList: { include: { items: { include: { product: PRODUCT_WITH_IMAGE }, orderBy: [{ order: 'asc' }, { productName: 'asc' }] } } } },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    });

    if (!screen) return res.status(404).json({ error: 'Screen not found' });

    // Registrar actividad sin escribir en la base en cada polling.
    // El token en claro se descarta en el primer sync: la TV ya lo recibió.
    // Versión del reproductor que informa la TV (solo ASCII imprimible, longitud acotada)
    const reported = String(req.headers['x-player-version'] || '').replace(/[^ -~]/g, '').slice(0, 64);
    const versionChanged = !!reported && reported !== screen.playerVersion;

    const stale = !screen.lastSeenAt || Date.now() - screen.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS;
    if (stale || screen.pairingCode || screen.pairingToken || versionChanged) {
      await prisma.screen.update({
        where: { id },
        data: {
          lastSeenAt: new Date(),
          status: 'online',
          pairingCode: null,
          pairingToken: null,
          ...(versionChanged ? { playerVersion: reported } : {})
        }
      });
    }

    // Se excluyen los campos que cambian en cada sync para que el reproductor
    // no detecte un "cambio" y reinicie la reproducción innecesariamente.
    const { lastSeenAt, status, pairingCode, pairingToken, tokenHash, businessId, playerVersion, ...config } = screen;

    // Los artículos enlazados al catálogo se envían con sus datos vivos (precio, foto, unidad, etiqueta…)
    // y los campos de siempre (productName, price, description) para que reproductores anteriores sigan funcionando.
    const playlist = config.playlist && {
      ...config.playlist,
      items: config.playlist.items.map((entry) =>
        entry.priceList ? { ...entry, priceList: { ...entry.priceList, items: resolveItems(entry.priceList) } } : entry
      )
    };
    res.json({ ...config, playlist });
  } catch (error) {
    res.status(500).json({ error: 'Error syncing screen' });
  }
});

// ---------- Rutas del negocio (dashboard) ----------

// Vincular una pantalla con el código que muestra la TV
router.post('/link', requireBusiness, async (req, res) => {
  try {
    const { name, location } = req.body;
    const businessId = bid(req);
    const code = String(req.body.code || '').trim().toUpperCase();

    const screen = await prisma.screen.findUnique({ where: { pairingCode: code } });
    if (!screen || screen.status !== 'pending') {
      return res.status(404).json({ error: 'Código inválido o expirado.' });
    }

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const used = await prisma.screen.count({ where: { businessId } });
    if (used >= business.maxScreens) {
      return res.status(403).json({ error: `Alcanzaste el máximo de ${business.maxScreens} pantallas de tu plan.` });
    }

    const token = randomToken();
    // updateMany con status 'pending' evita que dos negocios reclamen el mismo código a la vez
    const claimed = await prisma.screen.updateMany({
      where: { id: screen.id, status: 'pending' },
      data: {
        name: String(name || '').trim() || 'Pantalla',
        location,
        status: 'offline', // pasa a online con el primer sync de la TV
        businessId,
        tokenHash: sha256(token),
        pairingToken: token
      }
    });
    if (claimed.count === 0) return res.status(404).json({ error: 'Código inválido o expirado.' });

    const updated = await prisma.screen.findUniqueOrThrow({ where: { id: screen.id } });
    res.json(publicScreen(updated));
  } catch (error) {
    console.error('Link screen error:', error);
    res.status(500).json({ error: 'Error linking screen' });
  }
});

// Asignar lista de precios y medios a la pantalla
router.post('/:id/assign', requireBusiness, async (req, res) => {
  try {
    const id = String(req.params.id);
    const businessId = bid(req);
    const { priceListId, mediaIds, layout, transition, mediaDuration } = req.body;
    const menuStyle = ['list', 'photo-list', 'cards'].includes(req.body.menuStyle) ? req.body.menuStyle : 'list';

    const screen = await prisma.screen.findFirst({ where: { id, businessId } });
    if (!screen) return res.status(404).json({ error: 'Screen not found' });

    // La lista y los medios deben ser del mismo negocio
    const ids: string[] = Array.isArray(mediaIds) ? mediaIds.map(String) : [];
    if (priceListId && !(await prisma.priceList.findFirst({ where: { id: String(priceListId), businessId } }))) {
      return res.status(400).json({ error: 'Lista de precios inválida' });
    }
    if (ids.length && (await prisma.media.count({ where: { id: { in: ids }, businessId } })) !== new Set(ids).size) {
      return res.status(400).json({ error: 'Medios inválidos' });
    }

    const duration = Number(mediaDuration) > 0 ? Number(mediaDuration) : 10;
    const items = [
      ...(priceListId ? [{ priceListId: String(priceListId), order: 0, duration: PRICE_LIST_DURATION }] : []),
      ...ids.map((mId, index) => ({ mediaId: mId, order: index + 1, duration }))
    ];

    // Reutilizar la playlist de la pantalla en vez de acumular playlists huérfanas
    const playlistId = await prisma.$transaction(async (tx) => {
      if (screen.playlistId) {
        await tx.playlistItem.deleteMany({ where: { playlistId: screen.playlistId } });
        await tx.playlistItem.createMany({
          data: items.map((i) => ({ ...i, playlistId: screen.playlistId! }))
        });
        return screen.playlistId;
      }
      const playlist = await tx.playlist.create({
        data: { name: `Playlist - Screen ${id}`, businessId, items: { create: items } }
      });
      return playlist.id;
    });

    const updated = await prisma.screen.update({
      where: { id },
      data: {
        playlistId,
        layout: layout || 'split',
        transition: transition || 'fade',
        menuStyle,
        mediaDuration: duration
      }
    });

    res.json(publicScreen(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error assigning content' });
  }
});

// Pantallas del negocio
router.get('/', requireBusiness, async (req, res) => {
  try {
    const screens = await prisma.screen.findMany({
      where: { businessId: bid(req) },
      include: {
        playlist: {
          include: {
            items: {
              include: { media: true, priceList: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(screens.map((s) => publicScreen(withLiveStatus(s))));
  } catch (error) {
    res.status(500).json({ error: 'Error fetching screens' });
  }
});

// Actualizar nombre/ubicación
router.put('/:id', requireBusiness, async (req, res) => {
  try {
    const { name, location } = req.body;
    const result = await prisma.screen.updateMany({
      where: { id: String(req.params.id), businessId: bid(req) },
      data: { name, location }
    });
    if (result.count === 0) return res.status(404).json({ error: 'Screen not found' });
    res.json(publicScreen(await prisma.screen.findUniqueOrThrow({ where: { id: String(req.params.id) } })));
  } catch (error) {
    res.status(500).json({ error: 'Error updating screen' });
  }
});

// Borrar pantalla (su token deja de valer y la TV vuelve a pedir vinculación)
router.delete('/:id', requireBusiness, async (req, res) => {
  try {
    const result = await prisma.screen.deleteMany({ where: { id: String(req.params.id), businessId: bid(req) } });
    if (result.count === 0) return res.status(404).json({ error: 'Screen not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting screen' });
  }
});

export default router;
