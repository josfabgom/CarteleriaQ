import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import csv from 'csv-parser';
import prisma from '../prisma';
import { bid, requireBusiness } from '../auth';

const router = Router();
router.use(requireBusiness);

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });

// Obtener las listas de precios del negocio
router.get('/', async (req, res) => {
  try {
    const lists = await prisma.priceList.findMany({
      where: { businessId: bid(req) },
      include: { items: { orderBy: { order: 'asc' } } }
    });
    res.json(lists);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching price lists' });
  }
});

// Crear una nueva lista de precios vacía
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const newList = await prisma.priceList.create({
      data: { name, businessId: bid(req) }
    });
    res.status(201).json(newList);
  } catch (error) {
    res.status(500).json({ error: 'Error creating price list' });
  }
});

// Subir un CSV para crear una lista de precios (columnas: nombre, precio, descripcion)
router.post('/upload-csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = req.file.path;
  const listName = req.body.name || 'Lista Importada';

  const rows: any[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data: any) => rows.push(data))
        .on('end', () => resolve())
        .on('error', reject);
    });

    const newPriceList = await prisma.priceList.create({
      data: {
        name: listName,
        businessId: bid(req),
        items: {
          create: rows.map((row, index) => ({
            productName: row.nombre || row.name || 'Producto Desconocido',
            price: parseFloat(String(row.precio || row.price || '0').replace(',', '.')) || 0,
            description: row.descripcion || row.description || '',
            order: index
          }))
        }
      }
    });
    res.status(201).json(newPriceList);
  } catch (error) {
    res.status(500).json({ error: 'Error processing CSV data' });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

// Agregar producto a una lista
router.post('/:listId/items', async (req, res) => {
  try {
    const { productName, price, description, order } = req.body;
    const list = await prisma.priceList.findFirst({ where: { id: String(req.params.listId), businessId: bid(req) } });
    if (!list) return res.status(404).json({ error: 'List not found' });

    const newItem = await prisma.priceItem.create({
      data: {
        priceListId: list.id,
        productName,
        price: parseFloat(price),
        description,
        order: parseInt(order) || 0
      }
    });
    res.json(newItem);
  } catch (error) {
    res.status(500).json({ error: 'Error creating item' });
  }
});

// Actualizar producto de una lista
router.put('/items/:id', async (req, res) => {
  try {
    const { productName, price, description, order } = req.body;
    const result = await prisma.priceItem.updateMany({
      where: { id: String(req.params.id), priceList: { businessId: bid(req) } },
      data: {
        productName,
        price: parseFloat(price),
        description,
        order: parseInt(order) || 0
      }
    });
    if (result.count === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(await prisma.priceItem.findUniqueOrThrow({ where: { id: String(req.params.id) } }));
  } catch (error) {
    res.status(500).json({ error: 'Error updating item' });
  }
});

// Eliminar producto de una lista
router.delete('/items/:id', async (req, res) => {
  try {
    const result = await prisma.priceItem.deleteMany({
      where: { id: String(req.params.id), priceList: { businessId: bid(req) } }
    });
    if (result.count === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting item' });
  }
});

// Eliminar lista completa
router.delete('/:id', async (req, res) => {
  try {
    const result = await prisma.priceList.deleteMany({ where: { id: String(req.params.id), businessId: bid(req) } });
    if (result.count === 0) return res.status(404).json({ error: 'List not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting list' });
  }
});

export default router;
