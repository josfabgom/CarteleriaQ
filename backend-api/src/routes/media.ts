import { Router } from 'express';
import multer from 'multer';
import prisma from '../prisma';
import path from 'path';
import fs from 'fs';

const router = Router();

const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^\w.\-]+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes o videos'));
  }
});

router.get('/', async (req, res) => {
  try {
    const media = await prisma.media.findMany();
    res.json(media);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching media' });
  }
});

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const newMedia = await prisma.media.create({
      data: {
        name: req.file.originalname,
        type: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
        url: `/uploads/${req.file.filename}`,
        size: req.file.size
      }
    });
    res.status(201).json(newMedia);
  } catch (error) {
    res.status(500).json({ error: 'Error uploading media' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: req.params.id } });
    if (!media) return res.status(404).json({ error: 'Media not found' });
    
    // Delete file from disk
    const filePath = path.join(uploadDir, path.basename(media.url));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    await prisma.media.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting media' });
  }
});

export default router;
