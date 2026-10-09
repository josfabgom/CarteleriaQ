import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import csv from 'csv-parser';
import prisma from '../prisma';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Obtener todas las listas de precios
router.get('/', async (req, res) => {
  try {
    const lists = await prisma.priceList.findMany({
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
      data: { name }
    });
    res.status(201).json(newList);
  } catch (error) {
    res.status(500).json({ error: 'Error creating price list' });
  }
});

// Subir un CSV para actualizar/crear una lista de precios
router.post('/upload-csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const listName = req.body.name || 'Lista Importada';
  
  const results: any[] = [];
  
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data: any) => results.push(data))
    .on('end', async () => {
      try {
        // Crear la lista y los ítems
        // Asume que el CSV tiene columnas: nombre, precio, descripcion
        const newPriceList = await prisma.priceList.create({
          data: {
            name: listName,
            items: {
              create: results.map((row, index) => ({
                productName: row.nombre || row.name || 'Producto Desconocido',
                price: parseFloat(row.precio || row.price || '0'),
                description: row.descripcion || row.description || '',
                order: index
              }))
            }
          }
        });
        
        fs.unlinkSync(req.file!.path); // Limpiar archivo temporal
        res.status(201).json(newPriceList);
      } catch (error) {
        res.status(500).json({ error: 'Error processing CSV data' });
      }
    });
});

// ABM Básico de Productos (PriceItems)
// Crear producto en una lista
router.post('/:listId/items', async (req, res) => {
  try {
    const { productName, price, description, order } = req.body;
    const newItem = await prisma.priceItem.create({
      data: {
        priceListId: req.params.listId,
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

// Actualizar producto
router.put('/items/:id', async (req, res) => {
  try {
    const { productName, price, description, order } = req.body;
    const updated = await prisma.priceItem.update({
      where: { id: req.params.id },
      data: {
        productName,
        price: parseFloat(price),
        description,
        order: parseInt(order) || 0
      }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error updating item' });
  }
});

// Eliminar producto
router.delete('/items/:id', async (req, res) => {
  try {
    await prisma.priceItem.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting item' });
  }
});

// Eliminar lista completa
router.delete('/:id', async (req, res) => {
  try {
    await prisma.priceList.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting list' });
  }
});

export default router;
