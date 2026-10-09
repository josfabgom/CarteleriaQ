import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';

const router = Router();

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // sin sync en 2 min => offline
const LAST_SEEN_THROTTLE_MS = 30 * 1000; // no escribir lastSeenAt en cada polling
const PENDING_TTL_MS = 60 * 60 * 1000; // códigos sin vincular expiran en 1 h
const PRICE_LIST_DURATION = 60;

// Alfabeto sin caracteres ambiguos (0/O, 1/I) para tipear fácil desde la TV
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateCode = () =>
  Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

const withLiveStatus = <T extends { status: string; lastSeenAt: Date | null }>(screen: T): T => {
  if (screen.status === 'pending') return screen;
  const online = !!screen.lastSeenAt && Date.now() - screen.lastSeenAt.getTime() < ONLINE_WINDOW_MS;
  return { ...screen, status: online ? 'online' : 'offline' };
};

// Registrar pantalla desde la TV
router.post('/register', async (req, res) => {
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

// Comprobar si la pantalla ya se vinculó (Polling desde TV)
router.get('/check-pairing/:code', async (req, res) => {
  try {
    const screen = await prisma.screen.findUnique({ where: { pairingCode: req.params.code } });
    if (!screen) return res.status(404).json({ error: 'Not found' });

    if (screen.status !== 'pending') {
      res.json({ linked: true, screenId: screen.id });
    } else {
      res.json({ linked: false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error checking pairing' });
  }
});

// Vincular pantalla desde el Dashboard
router.post('/link', async (req, res) => {
  try {
    const { name, location } = req.body;
    const code = String(req.body.code || '').trim().toUpperCase();
    const screen = await prisma.screen.findUnique({ where: { pairingCode: code } });

    if (!screen) return res.status(404).json({ error: 'Código inválido o expirado.' });

    // Queda "offline" hasta que la TV haga su primer sync
    const updated = await prisma.screen.update({
      where: { id: screen.id },
      data: { name: name || 'Pantalla', location, status: 'offline' }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error linking screen' });
  }
});

// Asignar Lista de Precios y Medios a la pantalla
router.post('/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { priceListId, mediaIds, layout, transition, mediaDuration } = req.body;

    const screen = await prisma.screen.findUnique({ where: { id } });
    if (!screen) return res.status(404).json({ error: 'Screen not found' });

    const duration = Number(mediaDuration) > 0 ? Number(mediaDuration) : 10;
    const items = [
      ...(priceListId ? [{ priceListId, order: 0, duration: PRICE_LIST_DURATION }] : []),
      ...(mediaIds || []).map((mId: string, index: number) => ({
        mediaId: mId,
        order: index + 1,
        duration
      }))
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
        data: { name: `Playlist - Screen ${id}`, items: { create: items } }
      });
      return playlist.id;
    });

    const updated = await prisma.screen.update({
      where: { id },
      data: {
        playlistId,
        layout: layout || 'split',
        transition: transition || 'fade',
        mediaDuration: duration
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error assigning content' });
  }
});

// Get all screens
router.get('/', async (req, res) => {
  try {
    const screens = await prisma.screen.findMany({
      include: {
        playlist: {
          include: {
            items: {
              include: { media: true, priceList: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    });
    res.json(screens.map(withLiveStatus));
  } catch (error) {
    res.status(500).json({ error: 'Error fetching screens' });
  }
});

// Create a screen
router.post('/', async (req, res) => {
  try {
    const { name, location } = req.body;
    const newScreen = await prisma.screen.create({
      data: { name, location }
    });
    res.status(201).json(newScreen);
  } catch (error) {
    res.status(500).json({ error: 'Error creating screen' });
  }
});

// Get a specific screen configuration (for the player app)
router.get('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const screen = await prisma.screen.findUnique({
      where: { id },
      include: {
        playlist: {
          include: {
            items: {
              include: { media: true, priceList: { include: { items: true } } },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    });

    if (!screen) return res.status(404).json({ error: 'Screen not found' });

    // Registrar actividad del reproductor sin escribir en la base en cada polling
    const stale = !screen.lastSeenAt || Date.now() - screen.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS;
    if (stale || screen.pairingCode) {
      await prisma.screen.update({
        where: { id },
        data: { lastSeenAt: new Date(), status: 'online', pairingCode: null }
      });
    }

    // lastSeenAt/status cambian en cada sync; se excluyen para que el reproductor
    // no detecte un "cambio" y reinicie la reproducción innecesariamente.
    const { lastSeenAt, status, pairingCode, ...config } = screen;
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Error syncing screen' });
  }
});

// Update a screen
router.put('/:id', async (req, res) => {
  try {
    const { name, location, playlistId } = req.body;
    const updated = await prisma.screen.update({
      where: { id: req.params.id },
      data: { name, location, playlistId }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error updating screen' });
  }
});

// Delete a screen
router.delete('/:id', async (req, res) => {
  try {
    await prisma.screen.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting screen' });
  }
});

export default router;
