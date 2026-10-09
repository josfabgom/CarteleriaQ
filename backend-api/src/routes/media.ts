import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import prisma from '../prisma';
import { bid, requireBusiness } from '../auth';
import { MAX_FILE_SIZE, UPLOAD_DIR } from '../config';
import { getUsage } from '../usage';

const router = Router();
router.use(requireBusiness);

// Cada negocio guarda sus archivos en uploads/<businessId>/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, bid(req));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Nombre aleatorio: no se puede adivinar la URL de un archivo ajeno
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

// Valida la cuota y limita el tamaño del archivo al espacio que le queda al negocio
const uploadWithQuota = async (req: Request, res: Response, next: NextFunction) => {
  const usage = await getUsage(bid(req));
  const remaining = usage.storageLimitBytes - usage.storageUsedBytes;
  if (remaining <= 0) {
    return res.status(413).json({ error: 'No te queda espacio de almacenamiento. Eliminá medios o pedí un plan mayor.' });
  }

  const upload = multer({
    storage,
    limits: { fileSize: Math.min(MAX_FILE_SIZE, remaining) },
    fileFilter: (_req, file, cb) => {
      if (/^(image|video)\//.test(file.mimetype)) return cb(null, true);
      cb(new Error('Solo se permiten imágenes o videos'));
    }
  }).single('file');

  upload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      const limitMb = Math.floor(Math.min(MAX_FILE_SIZE, remaining) / (1024 * 1024));
      return res.status(413).json({ error: `El archivo supera el espacio disponible (máx. ${limitMb} MB).` });
    }
    res.status(400).json({ error: err.message });
  });
};

router.get('/', async (req, res) => {
  try {
    const media = await prisma.media.findMany({ where: { businessId: bid(req) }, orderBy: { createdAt: 'desc' } });
    res.json(media);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching media' });
  }
});

router.post('/upload', uploadWithQuota, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const businessId = bid(req);

    const newMedia = await prisma.media.create({
      data: {
        businessId,
        name: path.basename(req.file.originalname),
        type: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
        url: `/uploads/${businessId}/${req.file.filename}`,
        size: req.file.size
      }
    });
    res.status(201).json(newMedia);
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Error uploading media' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const businessId = bid(req);
    const media = await prisma.media.findFirst({ where: { id: String(req.params.id), businessId } });
    if (!media) return res.status(404).json({ error: 'Media not found' });

    await prisma.media.delete({ where: { id: media.id } });
    fs.unlink(path.join(UPLOAD_DIR, businessId, path.basename(media.url)), () => {});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting media' });
  }
});

export default router;
