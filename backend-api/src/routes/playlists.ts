import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const playlists = await prisma.playlist.findMany({
      include: { items: true }
    });
    res.json(playlists);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching playlists' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, items } = req.body;
    const newPlaylist = await prisma.playlist.create({
      data: {
        name,
        items: {
          create: items // [{ mediaId, order, duration }]
        }
      }
    });
    res.status(201).json(newPlaylist);
  } catch (error) {
    res.status(500).json({ error: 'Error creating playlist' });
  }
});

export default router;
