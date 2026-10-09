import { Router } from 'express';
import prisma from '../prisma';
import { bid, requireBusiness } from '../auth';

const router = Router();
router.use(requireBusiness);

router.get('/', async (req, res) => {
  try {
    const playlists = await prisma.playlist.findMany({
      where: { businessId: bid(req) },
      include: { items: true }
    });
    res.json(playlists);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching playlists' });
  }
});

router.post('/', async (req, res) => {
  try {
    const businessId = bid(req);
    const { name, items } = req.body; // items: [{ mediaId, priceListId, order, duration }]
    const list: any[] = Array.isArray(items) ? items : [];

    // Los medios y listas referenciados deben pertenecer al negocio
    const mediaIds = [...new Set(list.map((i) => i.mediaId).filter(Boolean).map(String))];
    const priceListIds = [...new Set(list.map((i) => i.priceListId).filter(Boolean).map(String))];
    const [mediaOk, listsOk] = await Promise.all([
      prisma.media.count({ where: { id: { in: mediaIds }, businessId } }),
      prisma.priceList.count({ where: { id: { in: priceListIds }, businessId } })
    ]);
    if (mediaOk !== mediaIds.length || listsOk !== priceListIds.length) {
      return res.status(400).json({ error: 'Medios o listas inválidos' });
    }

    const newPlaylist = await prisma.playlist.create({
      data: {
        name,
        businessId,
        items: {
          create: list.map((i) => ({
            mediaId: i.mediaId || null,
            priceListId: i.priceListId || null,
            order: Number(i.order) || 0,
            duration: Number(i.duration) > 0 ? Number(i.duration) : 10
          }))
        }
      }
    });
    res.status(201).json(newPlaylist);
  } catch (error) {
    res.status(500).json({ error: 'Error creating playlist' });
  }
});

export default router;
