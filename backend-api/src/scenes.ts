import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { MenuItem, PRODUCT_WITH_IMAGE, resolveItem, resolveItems } from './menu';

// Un ciclo (Playlist) es una secuencia de escenas (PlaylistItem). Tipos de escena:
//   prices  Lista de precios (con estilo, filtro por categoría y promos al costado opcionales)
//   offers  Ofertas del catálogo (automáticas o elegidas), en diseño destacado o grilla
//   media   Una imagen o un video a pantalla completa
//   text    Un anuncio de texto

export type SceneType = 'prices' | 'offers' | 'media' | 'text';

export const SCENE_TYPES: SceneType[] = ['prices', 'offers', 'media', 'text'];
export const MENU_STYLES = ['list', 'photo-list', 'cards'];
export const OFFER_DESIGNS = ['hero', 'grid'];
export const TEXT_THEMES = ['red', 'blue', 'green', 'orange', 'purple', 'dark'];
export const MIN_DURATION = 3;
export const MAX_DURATION = 600;
export const MAX_SCENES = 30;
const SINGLE_SCENE_DURATION = 600; // un ciclo de una sola escena no rota; el valor solo es informativo

export interface SceneData {
  type: SceneType;
  name: string | null;
  duration: number;
  enabled: boolean;
  priceListId: string | null;
  mediaId: string | null;
  config: Record<string, unknown>;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Lista de textos sin repetidos. Con keepEmpty se conserva la cadena vacía (categoría "sin categoría").
const strList = (v: unknown, maxItems: number, maxLen: number, keepEmpty = false): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = x.trim().slice(0, maxLen);
    if ((t !== '' || keepEmpty) && !out.includes(t)) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
};

// ---------- Validación ----------

// Valida y normaliza la lista de escenas que envía el editor. Todo lo referenciado debe ser del negocio.
export async function validateScenes(businessId: string, input: unknown): Promise<{ scenes: SceneData[] } | { error: string }> {
  if (!Array.isArray(input)) return { error: 'Las escenas deben ser una lista.' };
  if (input.length > MAX_SCENES) return { error: `Un ciclo puede tener hasta ${MAX_SCENES} escenas.` };

  const scenes: SceneData[] = [];
  for (const [i, raw] of input.entries()) {
    const n = i + 1;
    const type = raw?.type as SceneType;
    if (!SCENE_TYPES.includes(type)) return { error: `Escena ${n}: tipo inválido.` };

    const duration = Math.round(Number(raw?.duration));
    if (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
      return { error: `Escena ${n}: la duración debe estar entre ${MIN_DURATION} y ${MAX_DURATION} segundos.` };
    }
    const cfg = (raw?.config && typeof raw.config === 'object' ? raw.config : {}) as Record<string, unknown>;
    const base = { type, name: str(raw?.name, 60) || null, duration, enabled: raw?.enabled !== false, priceListId: null as string | null, mediaId: null as string | null };

    if (type === 'prices') {
      if (!raw?.priceListId) return { error: `Escena ${n}: elegí una lista de precios.` };
      const style = MENU_STYLES.includes(cfg.style as string) ? (cfg.style as string) : 'list';
      scenes.push({
        ...base,
        priceListId: String(raw.priceListId),
        config: { style, categories: strList(cfg.categories, 50, 60, true), sideMediaIds: strList(cfg.sideMediaIds, 20, 64) }
      });
    } else if (type === 'offers') {
      const source = cfg.source === 'manual' ? 'manual' : 'auto';
      const productIds = strList(cfg.productIds, 50, 64);
      if (source === 'manual' && productIds.length === 0) return { error: `Escena ${n}: elegí al menos un artículo para las ofertas.` };
      const maxItems = Math.min(24, Math.max(1, Math.round(Number(cfg.maxItems) || 8)));
      scenes.push({
        ...base,
        config: {
          source,
          design: OFFER_DESIGNS.includes(cfg.design as string) ? (cfg.design as string) : 'hero',
          categories: strList(cfg.categories, 50, 60, true),
          productIds,
          maxItems,
          title: str(cfg.title, 40) || 'OFERTAS'
        }
      });
    } else if (type === 'media') {
      if (!raw?.mediaId) return { error: `Escena ${n}: elegí una imagen o un video.` };
      scenes.push({ ...base, mediaId: String(raw.mediaId), config: {} });
    } else {
      const title = str(cfg.title, 80);
      if (!title) return { error: `Escena ${n}: el texto del anuncio no puede estar vacío.` };
      scenes.push({
        ...base,
        config: { title, subtitle: str(cfg.subtitle, 160), theme: TEXT_THEMES.includes(cfg.theme as string) ? (cfg.theme as string) : 'red' }
      });
    }
  }

  // Todo lo referenciado debe pertenecer al negocio
  const listIds = [...new Set(scenes.map((s) => s.priceListId).filter((x): x is string => !!x))];
  const mediaIds = [...new Set(scenes.flatMap((s) => [s.mediaId, ...((s.config.sideMediaIds as string[]) ?? [])]).filter((x): x is string => !!x))];
  const productIds = [...new Set(scenes.flatMap((s) => (s.config.productIds as string[]) ?? []))];

  const [lists, media, products] = await Promise.all([
    listIds.length ? prisma.priceList.count({ where: { id: { in: listIds }, businessId } }) : 0,
    mediaIds.length ? prisma.media.count({ where: { id: { in: mediaIds }, businessId } }) : 0,
    productIds.length ? prisma.product.count({ where: { id: { in: productIds }, businessId } }) : 0
  ]);
  if (lists !== listIds.length) return { error: 'Una de las listas de precios no existe.' };
  if (media !== mediaIds.length) return { error: 'Una de las imágenes o videos no existe.' };
  if (products !== productIds.length) return { error: 'Uno de los artículos elegidos no existe.' };

  // Una escena de media debe ser un archivo válido y las de promos al costado también
  return { scenes };
}

// Reemplaza todas las escenas de un ciclo (atómico)
export async function replaceScenes(tx: Prisma.TransactionClient, playlistId: string, scenes: SceneData[]) {
  await tx.playlistItem.deleteMany({ where: { playlistId } });
  if (scenes.length === 0) return;
  await tx.playlistItem.createMany({
    data: scenes.map((s, order) => ({
      playlistId, order, type: s.type, name: s.name, duration: s.duration, enabled: s.enabled,
      priceListId: s.priceListId, mediaId: s.mediaId, config: s.config as Prisma.InputJsonValue
    }))
  });
}

// ---------- Plantillas de inicio ----------

export type Template = 'prices' | 'prices-offers' | 'full';

export async function starterScenes(businessId: string, template: Template): Promise<SceneData[]> {
  const list = await prisma.priceList.findFirst({ where: { businessId }, orderBy: { createdAt: 'asc' } });
  const images = await prisma.media.findMany({ where: { businessId, type: 'image' }, orderBy: { createdAt: 'desc' }, take: 3 });

  const scenes: SceneData[] = [];
  const base = { name: null, enabled: true, priceListId: null as string | null, mediaId: null as string | null };
  if (list) {
    scenes.push({ ...base, type: 'prices', duration: template === 'prices' ? 30 : 25, priceListId: list.id, config: { style: 'list', categories: [], sideMediaIds: [] } });
  }
  if (template !== 'prices') {
    scenes.push({ ...base, type: 'offers', duration: 12, config: { source: 'auto', design: 'hero', categories: [], productIds: [], maxItems: 8, title: 'OFERTAS' } });
  }
  if (template === 'full') {
    for (const img of images) scenes.push({ ...base, type: 'media', duration: 8, mediaId: img.id, config: {} });
  }
  return scenes;
}

// ---------- Lo que recibe la TV ----------

export interface OfferItem extends MenuItem { discountPercent: number | null }

const isOffer = (p: { price: number; oldPrice: number | null; badge: string | null }) =>
  (p.oldPrice != null && p.oldPrice > p.price) || /oferta|promo/i.test(p.badge ?? '');

const discountOf = (p: { price: number; oldPrice: number | null }): number | null =>
  p.oldPrice != null && p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : null;

const inCategories = (category: string | null, categories: string[]) =>
  categories.length === 0 || (category ? categories.includes(category) : categories.includes(''));

export async function buildScenes(playlistId: string | null, businessId: string): Promise<Record<string, unknown>[]> {
  if (!playlistId) return [];
  const items = await prisma.playlistItem.findMany({
    where: { playlistId, enabled: true, type: { not: 'legacy' } },
    orderBy: { order: 'asc' },
    include: {
      media: true,
      priceList: { include: { items: { include: { product: PRODUCT_WITH_IMAGE }, orderBy: [{ order: 'asc' }, { productName: 'asc' }] } } }
    }
  });

  const out: Record<string, unknown>[] = [];
  for (const it of items) {
    const cfg = (it.config ?? {}) as Record<string, any>;
    const head = { id: it.id, type: it.type, name: it.name, duration: it.duration };

    if (it.type === 'prices' && it.priceList) {
      const categories: string[] = cfg.categories ?? [];
      const menuItems = resolveItems(it.priceList).filter((m) => inCategories(m.category, categories));
      if (menuItems.length === 0) continue;
      const sideIds: string[] = cfg.sideMediaIds ?? [];
      const side = sideIds.length
        ? (await prisma.media.findMany({ where: { id: { in: sideIds }, businessId } }))
            .sort((a, b) => sideIds.indexOf(a.id) - sideIds.indexOf(b.id))
            .map((m) => ({ id: m.id, type: m.type, url: m.url, name: m.name }))
        : [];
      out.push({
        ...head,
        style: cfg.style ?? 'list',
        priceList: { id: it.priceList.id, name: it.priceList.name, groupByCategory: it.priceList.groupByCategory, items: menuItems },
        side
      });
    } else if (it.type === 'offers') {
      const categories: string[] = cfg.categories ?? [];
      let products;
      if (cfg.source === 'manual') {
        const ids: string[] = cfg.productIds ?? [];
        const found = await prisma.product.findMany({ where: { id: { in: ids }, businessId, available: true }, ...PRODUCT_WITH_IMAGE });
        products = ids.map((id) => found.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
      } else {
        const candidates = await prisma.product.findMany({
          where: { businessId, available: true, OR: [{ oldPrice: { not: null } }, { badge: { contains: 'oferta', mode: 'insensitive' } }, { badge: { contains: 'promo', mode: 'insensitive' } }] },
          ...PRODUCT_WITH_IMAGE
        });
        products = candidates
          .filter((p) => isOffer(p) && inCategories(p.category, categories))
          .sort((a, b) => (discountOf(b) ?? 0) - (discountOf(a) ?? 0) || a.name.localeCompare(b.name))
          .slice(0, cfg.maxItems ?? 8);
      }
      const offerItems: OfferItem[] = products.map((p, i) => ({
        ...resolveItem({ id: p.id, productId: p.id, product: p, order: i }),
        discountPercent: discountOf(p)
      }));
      if (offerItems.length === 0) continue; // sin ofertas vigentes: la escena se omite
      out.push({ ...head, name: it.name || cfg.title || 'OFERTAS', design: cfg.design ?? 'hero', items: offerItems });
    } else if (it.type === 'media' && it.media) {
      out.push({ ...head, media: { id: it.media.id, type: it.media.type, url: it.media.url, name: it.media.name } });
    } else if (it.type === 'text') {
      out.push({ ...head, title: cfg.title ?? '', subtitle: cfg.subtitle ?? '', theme: cfg.theme ?? 'red' });
    }
  }
  return out;
}

// ---------- Migración de los ciclos del formato anterior ----------

// Antes una pantalla tenía una lista de precios + imágenes y el diseño (split/full-media/full-menu) estaba en la pantalla.
// Se convierte a escenas equivalentes para que la TV se vea igual.
export async function migrateLegacyPlaylists(): Promise<number> {
  const playlists = await prisma.playlist.findMany({
    where: { items: { some: { type: 'legacy' } } },
    include: { items: { orderBy: { order: 'asc' } }, screens: true }
  });

  for (const p of playlists) {
    const screen = p.screens[0];
    const layout = screen?.layout ?? 'split';
    const style = MENU_STYLES.includes(screen?.menuStyle ?? '') ? screen!.menuStyle : 'list';
    const mediaItems = p.items.filter((i) => i.mediaId);
    const priceItem = p.items.find((i) => i.priceListId);
    const base = { name: null, enabled: true, priceListId: null as string | null, mediaId: null as string | null };

    const scenes: SceneData[] = [];
    if (priceItem && layout !== 'full-media') {
      scenes.push({
        ...base, type: 'prices', duration: SINGLE_SCENE_DURATION, priceListId: priceItem.priceListId,
        config: { style, categories: [], sideMediaIds: layout === 'split' ? mediaItems.map((m) => m.mediaId as string) : [] }
      });
    } else {
      for (const m of mediaItems) scenes.push({ ...base, type: 'media', duration: Math.max(MIN_DURATION, m.duration), mediaId: m.mediaId, config: {} });
    }

    await prisma.$transaction(async (tx) => {
      await replaceScenes(tx, p.id, scenes);
      const own = p.screens.length === 1 && p.name.startsWith('Playlist - Screen');
      await tx.playlist.update({ where: { id: p.id }, data: { private: own, ...(own ? { name: `Ciclo de ${screen!.name}` } : {}) } });
    });
  }
  return playlists.length;
}
