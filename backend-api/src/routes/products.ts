import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import { parseCsvFile, parsePrice, pick } from '../csv';
import prisma from '../prisma';
import { bid, requireBusiness } from '../auth';

const router = Router();
router.use(requireBusiness);
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });

// Obtener todos los productos
router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { businessId: bid(req) },
      orderBy: { name: 'asc' }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching products' });
  }
});

// Importar productos desde CSV (separador , ; o tab; con o sin BOM)
router.post('/upload-csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = req.file.path;
  const businessId = bid(req);

  try {
    const rows = await parseCsvFile(filePath);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'El archivo no tiene filas de datos.' });
    }
    if (!('nombre' in rows[0]) && !('name' in rows[0])) {
      return res.status(400).json({
        error: 'No se encontró la columna "nombre". Revisá el encabezado de la primera fila (nombre, precio, codigo_interno, codigo_barra, descripcion).'
      });
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const [i, row] of rows.entries()) {
      try {
        const name = pick(row, 'nombre', 'name');
        const price = parsePrice(pick(row, 'precio', 'price'));
        if (!name) {
          errors.push(`Fila ${i + 2}: falta el nombre`);
          continue;
        }
        if (Number.isNaN(price)) {
          errors.push(`Fila ${i + 2} (${name}): precio inválido "${pick(row, 'precio', 'price')}"`);
          continue;
        }
        const internalCode = pick(row, 'codigo_interno', 'internalcode', 'codigo') || null;
        const barcode = pick(row, 'codigo_barra', 'codigo_de_barra', 'codigo_de_barras', 'barcode') || null;
        const description = pick(row, 'descripcion', 'description') || null;
        const data = { businessId, internalCode, barcode, name, price, description };

        // Actualizar si ya existe por código interno o de barras; si no, crear
        const keys = [
          ...(internalCode ? [{ internalCode }] : []),
          ...(barcode ? [{ barcode }] : [])
        ];
        const existing = keys.length ? await prisma.product.findFirst({ where: { businessId, OR: keys } }) : null;
        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.product.create({ data });
          created++;
        }
      } catch (error) {
        errors.push(`Fila ${i + 2}: error al guardar el artículo`);
        console.error('CSV row error:', error);
      }
    }

    res.status(201).json({ success: true, count: created + updated, created, updated, errors });
  } catch (error) {
    console.error('CSV Import Error:', error);
    res.status(500).json({ error: 'Error processing CSV data' });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

// Crear producto
router.post('/', async (req, res) => {
  try {
    const { internalCode, barcode, name, description, price } = req.body;
    const newProduct = await prisma.product.create({
      data: {
        businessId: bid(req),
        internalCode: internalCode || null,
        barcode: barcode || null,
        name,
        description: description || null,
        price: parseFloat(price)
      }
    });
    res.status(201).json(newProduct);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'El código interno o código de barra ya existe.' });
    }
    res.status(500).json({ error: 'Error creating product' });
  }
});

// Actualizar producto
router.put('/:id', async (req, res) => {
  try {
    const { internalCode, barcode, name, description, price } = req.body;
    const existing = await prisma.product.findFirst({ where: { id: String(req.params.id), businessId: bid(req) } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: {
        internalCode: internalCode || null,
        barcode: barcode || null,
        name,
        description: description || null,
        price: parseFloat(price)
      }
    });
    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'El código interno o código de barra ya existe.' });
    }
    res.status(500).json({ error: 'Error updating product' });
  }
});

// Eliminar producto
router.delete('/:id', async (req, res) => {
  try {
    const result = await prisma.product.deleteMany({ where: { id: String(req.params.id), businessId: bid(req) } });
    if (result.count === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting product' });
  }
});

export default router;
