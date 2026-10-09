import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import { parseCsvFile, parsePrice, pick } from '../csv';
import prisma from '../prisma';
import { bid, requireBusiness } from '../auth';
import { PRODUCT_WITH_IMAGE } from '../menu';

const router = Router();
router.use(requireBusiness);
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });

// ---------- Campos de un artículo ----------

const text = (value: unknown, max: number): string | null => {
  const s = typeof value === 'string' ? value.trim() : '';
  return s ? s.slice(0, max) : null;
};

const optionalPrice = (value: unknown): number | null | 'invalid' => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = typeof value === 'number' ? value : parsePrice(String(value));
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
};

const toBool = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  const s = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes', 'y', 's'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return fallback;
};

// Valida y normaliza el cuerpo de un alta/edición. Devuelve los datos o un mensaje de error.
async function readProductBody(body: any, businessId: string) {
  const name = text(body?.name, 200);
  if (!name) return { error: 'El nombre es obligatorio.' };

  const price = typeof body?.price === 'number' ? body.price : parsePrice(String(body?.price ?? ''));
  if (!Number.isFinite(price) || price < 0) return { error: 'El precio debe ser un número válido.' };

  const oldPrice = optionalPrice(body?.oldPrice);
  if (oldPrice === 'invalid') return { error: 'El precio anterior debe ser un número válido.' };

  let imageId: string | null = null;
  if (body?.imageId) {
    const media = await prisma.media.findFirst({ where: { id: String(body.imageId), businessId, type: 'image' } });
    if (!media) return { error: 'La foto elegida no existe o no es una imagen.' };
    imageId = media.id;
  }

  return {
    data: {
      internalCode: text(body?.internalCode, 60),
      barcode: text(body?.barcode, 60),
      name,
      description: text(body?.description, 300),
      price,
      category: text(body?.category, 60),
      unit: text(body?.unit, 24),
      oldPrice,
      badge: text(body?.badge, 24),
      available: toBool(body?.available, true),
      imageId
    }
  };
}

// ---------- Listado ----------

router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { businessId: bid(req) },
      ...PRODUCT_WITH_IMAGE,
      orderBy: { name: 'asc' }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching products' });
  }
});

// ---------- Importar desde CSV (separador , ; o tab; con o sin BOM) ----------

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
        error: 'No se encontró la columna "nombre". Revisá el encabezado de la primera fila (nombre, precio, codigo_interno, codigo_barra, descripcion, categoria, unidad, precio_anterior, etiqueta, disponible).'
      });
    }

    // Una columna ausente no debe borrar el dato de un artículo que se actualiza
    const has = (...aliases: string[]) => aliases.some((a) => a in rows[0]);
    const columns = {
      description: has('descripcion', 'description'),
      internalCode: has('codigo_interno', 'internalcode', 'codigo'),
      barcode: has('codigo_barra', 'codigo_de_barra', 'codigo_de_barras', 'barcode'),
      category: has('categoria', 'category', 'rubro'),
      unit: has('unidad', 'unidad_de_venta', 'unit'),
      oldPrice: has('precio_anterior', 'precio_antes', 'oldprice'),
      badge: has('etiqueta', 'badge'),
      available: has('disponible', 'stock', 'available')
    };

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
        let oldPrice: number | null = null;
        if (columns.oldPrice) {
          const raw = pick(row, 'precio_anterior', 'precio_antes', 'oldprice');
          if (raw) {
            oldPrice = parsePrice(raw);
            if (Number.isNaN(oldPrice)) {
              errors.push(`Fila ${i + 2} (${name}): precio anterior inválido "${raw}"`);
              continue;
            }
          }
        }

        const internalCode = pick(row, 'codigo_interno', 'internalcode', 'codigo') || null;
        const barcode = pick(row, 'codigo_barra', 'codigo_de_barra', 'codigo_de_barras', 'barcode') || null;
        const description = pick(row, 'descripcion', 'description').slice(0, 300) || null;
        const category = pick(row, 'categoria', 'category', 'rubro').slice(0, 60) || null;
        const unit = pick(row, 'unidad', 'unidad_de_venta', 'unit').slice(0, 24) || null;
        const badge = pick(row, 'etiqueta', 'badge').slice(0, 24) || null;
        const available = toBool(pick(row, 'disponible', 'stock', 'available'), true);

        const fields = {
          name, price,
          ...(columns.description ? { description } : {}),
          ...(columns.internalCode ? { internalCode } : {}),
          ...(columns.barcode ? { barcode } : {}),
          ...(columns.category ? { category } : {}),
          ...(columns.unit ? { unit } : {}),
          ...(columns.oldPrice ? { oldPrice } : {}),
          ...(columns.badge ? { badge } : {}),
          ...(columns.available ? { available } : {})
        };

        // Actualizar si ya existe por código interno o de barras; si no, crear
        const keys = [
          ...(internalCode ? [{ internalCode }] : []),
          ...(barcode ? [{ barcode }] : [])
        ];
        const existing = keys.length ? await prisma.product.findFirst({ where: { businessId, OR: keys } }) : null;
        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data: fields });
          updated++;
        } else {
          await prisma.product.create({ data: { businessId, ...fields } });
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

// ---------- Alta, edición y baja ----------

const duplicateMessage = 'El código interno o código de barra ya existe.';

router.post('/', async (req, res) => {
  try {
    const businessId = bid(req);
    const parsed = await readProductBody(req.body, businessId);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const created = await prisma.product.create({ data: { businessId, ...parsed.data }, ...PRODUCT_WITH_IMAGE });
    res.status(201).json(created);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: duplicateMessage });
    res.status(500).json({ error: 'Error creating product' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const businessId = bid(req);
    const existing = await prisma.product.findFirst({ where: { id: String(req.params.id), businessId } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const parsed = await readProductBody(req.body, businessId);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const updated = await prisma.product.update({ where: { id: existing.id }, data: parsed.data, ...PRODUCT_WITH_IMAGE });
    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: duplicateMessage });
    res.status(500).json({ error: 'Error updating product' });
  }
});

// Cambio rápido de disponibilidad (sin stock) sin reenviar todo el artículo
router.patch('/:id/availability', async (req, res) => {
  const result = await prisma.product.updateMany({
    where: { id: String(req.params.id), businessId: bid(req) },
    data: { available: toBool(req.body?.available, true) }
  });
  if (result.count === 0) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true });
});

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
