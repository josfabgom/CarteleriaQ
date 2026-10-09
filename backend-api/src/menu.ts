// Resolución de los artículos de una lista de pantalla: enlazados al catálogo (datos vivos) o manuales.

export interface MenuItem {
  id: string;
  productId: string | null;
  linked: boolean;
  productName: string; // nombre original (compatibilidad con reproductores anteriores)
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  oldPrice: number | null;
  badge: string | null;
  category: string | null;
  available: boolean;
  imageUrl: string | null;
  order: number;
}

// Un PriceItem con su product (e imagen) incluidos
export function resolveItem(item: any): MenuItem {
  const p = item.product;
  const src = p ?? item;
  return {
    id: item.id,
    productId: item.productId ?? null,
    linked: !!p,
    productName: p ? p.name : item.productName,
    name: p ? p.name : item.productName,
    description: src.description ?? null,
    price: src.price,
    unit: src.unit ?? null,
    oldPrice: src.oldPrice ?? null,
    badge: src.badge ?? null,
    category: src.category ?? null,
    available: src.available !== false,
    imageUrl: p?.image?.url ?? null,
    order: item.order
  };
}

// Items listos para mostrar; con hideUnavailable se quitan los que no tienen stock
export function resolveItems(priceList: { items: any[]; hideUnavailable?: boolean }): MenuItem[] {
  const items = priceList.items.map(resolveItem);
  return priceList.hideUnavailable ? items.filter((i) => i.available) : items;
}

export const PRODUCT_WITH_IMAGE = { include: { image: { select: { id: true, url: true } } } } as const;
