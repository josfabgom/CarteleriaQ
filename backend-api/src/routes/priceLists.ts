import { Router } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import { parseCsvFile, parsePrice, pick } from '../csv';
import prisma from '../prisma';
import { bid, requireBusiness } from '../auth';
import { PRODUCT_WITH_IMAGE, resolveItem } from '../menu';

const router = Router();
router.use(requireBusiness);

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });

const text = (value: unknown, max: number): string | null => {
  const s = typeof value === 'string' ? value.trim() : '';
  return s ? s.slice(0, max) : null;
};

const ITEMS_INCLUDE: Prisma.PriceListInclude = {
  items: { include: { product: PRODUCT_WITH_IMAGE }, orderBy: [{ order: 'asc' }, { productName: 'asc' }] }
};

// Lista con sus artículos ya resueltos (los enlazados muestran los datos vivos del catálogo)
const present = (list: any) => ({ ...list, items: list.items.map(resolveItem) });

// Obtener las listas de precios del negocio
router.get('/', async (req, res) => {
  try {
    const lists = await prisma.priceList.findMany({
      where: { businessId: bid(req) },
      include: ITEMS_INCLUDE,
      orderBy: { createdAt: 'asc' }
    });
    res.json(lists.map(present));
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

// Cambiar nombre y opciones de visualización
router.put('/:id', async (req, res) => {
  try {
    const data: Record<string, unknown> = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim().slice(0, 100);
    if (typeof req.body?.groupByCategory === 'boolean') data.groupByCategory = req.body.groupByCategory;
    if (typeof req.body?.hideUnavailable === 'boolean') data.hideUnavailable = req.body.hideUnavailable;

    const result = await prisma.priceList.updateMany({ where: { id: String(req.params.id), businessId: bid(req) }, data });
    if (result.count === 0) return res.status(404).json({ error: 'List not found' });
    res.json(await prisma.priceList.findUniqueOrThrow({ where: { id: String(req.params.id) } }));
  } catch (error) {
    res.status(500).json({ error: 'Error updating price list' });
  }
});

// Subir un CSV para crear una lista de precios (columnas: nombre, precio, descripcion, categoria, unidad)
router.post('/upload-csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = req.file.path;
  const listName = req.body.name || 'Lista Importada';

  try {
    const rows = await parseCsvFile(filePath);

    const newPriceList = await prisma.priceList.create({
      data: {
        name: listName,
        businessId: bid(req),
        items: {
          create: rows.map((row, index) => ({
            productName: pick(row, 'nombre', 'name') || 'Producto Desconocido',
            price: parsePrice(pick(row, 'precio', 'price')) || 0,
            description: pick(row, 'descripcion', 'description'),
            category: pick(row, 'categoria', 'category', 'rubro').slice(0, 60) || null,
            unit: pick(row, 'unidad', 'unidad_de_venta', 'unit').slice(0, 24) || null,
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

// Agregar varios artículos del catálogo a una lista (quedan enlazados: si cambia su precio, cambia en la pantalla)
router.post('/:listId/items/from-catalog', async (req, res) => {
  try {
    const businessId = bid(req);
    const list = await prisma.priceList.findFirst({ where: { id: String(req.params.listId), businessId } });
    if (!list) return res.status(404).json({ error: 'List not found' });

    const ids: string[] = Array.isArray(req.body?.productIds) ? [...new Set<string>(req.body.productIds.map(String))] : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Elegí al menos un artículo.' });

    const products = await prisma.product.findMany({ where: { id: { in: ids }, businessId }, select: { id: true, name: true, price: true } });
    const already = new Set(
      (await prisma.priceItem.findMany({ where: { priceListId: list.id, productId: { in: products.map((p) => p.id) } }, select: { productId: true } }))
        .map((i) => i.productId)
    );
    const toAdd = products.filter((p) => !already.has(p.id));

    const last = await prisma.priceItem.aggregate({ where: { priceListId: list.id }, _max: { order: true } });
    let order = (last._max.order ?? -1) + 1;
    await prisma.priceItem.createMany({
      data: toAdd.map((p) => ({ priceListId: list.id, productId: p.id, productName: p.name, price: p.price, order: order++ }))
    });
    res.status(201).json({ added: toAdd.length, skipped: ids.length - toAdd.length });
  } catch (error) {
    res.status(500).json({ error: 'Error adding items' });
  }
});

// Agregar un artículo a una lista: enlazado al catálogo (productId) o manual (campos propios)
router.post('/:listId/items', async (req, res) => {
  try {
    const businessId = bid(req);
    const list = await prisma.priceList.findFirst({ where: { id: String(req.params.listId), businessId } });
    if (!list) return res.status(404).json({ error: 'List not found' });

    const last = await prisma.priceItem.aggregate({ where: { priceListId: list.id }, _max: { order: true } });
    const order = Number.isInteger(Number(req.body?.order)) && Number(req.body.order) > 0 ? Number(req.body.order) : (last._max.order ?? -1) + 1;

    if (req.body?.productId) {
      const product = await prisma.product.findFirst({ where: { id: String(req.body.productId), businessId } });
      if (!product) return res.status(404).json({ error: 'Product not found' });
      const existing = await prisma.priceItem.findFirst({ where: { priceListId: list.id, productId: product.id } });
      if (existing) return res.status(409).json({ error: 'Ese artículo ya está en la lista.' });
      const item = await prisma.priceItem.create({
        data: { priceListId: list.id, productId: product.id, productName: product.name, price: product.price, order }
      });
      return res.status(201).json(item);
    }

    const productName = text(req.body?.productName, 200);
    const price = typeof req.body?.price === 'number' ? req.body.price : parsePrice(String(req.body?.price ?? ''));
    if (!productName) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'El precio debe ser un número válido.' });

    const item = await prisma.priceItem.create({
      data: {
        priceListId: list.id,
        productName,
        price,
        description: text(req.body?.description, 300),
        unit: text(req.body?.unit, 24),
        category: text(req.body?.category, 60),
        badge: text(req.body?.badge, 24),
        oldPrice: req.body?.oldPrice ? parsePrice(String(req.body.oldPrice)) : null,
        order
      }
    });
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: 'Error creating item' });
  }
});

// Actualizar un artículo de una lista. Los enlazados al catálogo solo cambian de posición: su dato se edita en el catálogo.
router.put('/items/:id', async (req, res) => {
  try {
    const item = await prisma.priceItem.findFirst({ where: { id: String(req.params.id), priceList: { businessId: bid(req) } } });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const data: Record<string, unknown> = {};
    if (req.body?.order !== undefined && Number.isInteger(Number(req.body.order))) data.order = Number(req.body.order);

    if (!item.productId) {
      const name = text(req.body?.productName, 200);
      if (name) data.productName = name;
      if (req.body?.price !== undefined) {
        const price = typeof req.body.price === 'number' ? req.body.price : parsePrice(String(req.body.price));
        if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'El precio debe ser un número válido.' });
        data.price = price;
      }
      for (const [key, max] of [['description', 300], ['unit', 24], ['category', 60], ['badge', 24]] as const) {
        if (req.body?.[key] !== undefined) data[key] = text(req.body[key], max);
      }
      if (req.body?.oldPrice !== undefined) data.oldPrice = req.body.oldPrice ? parsePrice(String(req.body.oldPrice)) : null;
      if (typeof req.body?.available === 'boolean') data.available = req.body.available;
    } else if (Object.keys(req.body ?? {}).some((k) => k !== 'order')) {
      return res.status(400).json({ error: 'Este artículo está enlazado al catálogo: editalo desde el catálogo.' });
    }

    res.json(await prisma.priceItem.update({ where: { id: item.id }, data }));
  } catch (error) {
    res.status(500).json({ error: 'Error updating item' });
  }
});

// Quitar un artículo de una lista (no lo borra del catálogo)
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
