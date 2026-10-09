// Prueba de la migración de ciclos del formato anterior a escenas.
// Uso: DATABASE_URL=postgresql://usuario:clave@localhost:5432/base JWT_SECRET=x npx tsx scripts/test-scenes-migration.ts
import prisma from '../src/prisma';
import { buildScenes, migrateLegacyPlaylists } from '../src/scenes';

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
};

(async () => {
  const stamp = Date.now().toString(36);
  const business = await prisma.business.create({ data: { name: `Migración ${stamp}` } });
  const businessId = business.id;
  try {
    const list = await prisma.priceList.create({ data: { name: 'Lista', businessId, items: { create: [{ productName: 'Pizza', price: 100, order: 0 }] } } });
    const m1 = await prisma.media.create({ data: { name: 'a.png', type: 'image', url: '/uploads/a.png', size: 1, businessId } });
    const m2 = await prisma.media.create({ data: { name: 'b.png', type: 'image', url: '/uploads/b.png', size: 1, businessId } });

    const legacy = async (screenName: string | null, layout: string, withList: boolean, menuStyle = 'list', mediaDuration = 10) => {
      const playlist = await prisma.playlist.create({
        data: {
          name: screenName ? 'Playlist - Screen abc' : 'Playlist suelta', businessId,
          items: { create: [
            ...(withList ? [{ priceListId: list.id, order: 0, duration: 60, type: 'legacy' }] : []),
            { mediaId: m1.id, order: 1, duration: 8, type: 'legacy' },
            { mediaId: m2.id, order: 2, duration: 12, type: 'legacy' }
          ] }
        }
      });
      if (screenName) await prisma.screen.create({ data: { name: screenName, status: 'offline', businessId, playlistId: playlist.id, layout, menuStyle, mediaDuration } });
      return playlist.id;
    };

    const split = await legacy('TV split', 'split', true, 'cards');
    const fullMenu = await legacy('TV menu', 'full-menu', true, 'photo-list');
    const fullMedia = await legacy('TV promos', 'full-media', false, 'list', 7);
    const orphan = await legacy(null, 'split', true);
    const shared = await legacy('TV compartida 1', 'split', true);
    await prisma.screen.create({ data: { name: 'TV compartida 2', status: 'offline', businessId, playlistId: shared } });

    const migrated = await migrateLegacyPlaylists();
    check('migra los 5 ciclos', migrated >= 5, String(migrated));

    const scenesOf = (id: string) => prisma.playlistItem.findMany({ where: { playlistId: id }, orderBy: { order: 'asc' } });
    const s = await scenesOf(split);
    check('split: una escena de precios con las 2 promos al costado y el estilo de la pantalla',
      s.length === 1 && s[0].type === 'prices' && (s[0].config as any).style === 'cards' && (s[0].config as any).sideMediaIds.length === 2, JSON.stringify(s.map((x) => [x.type, x.config])));
    const fm = await scenesOf(fullMenu);
    check('full-menu: precios sin promos', fm.length === 1 && fm[0].type === 'prices' && (fm[0].config as any).sideMediaIds.length === 0 && (fm[0].config as any).style === 'photo-list');
    const fmed = await scenesOf(fullMedia);
    check('full-media: una escena por imagen, con su duración', fmed.length === 2 && fmed.every((x) => x.type === 'media') && fmed[0].duration === 8 && fmed[1].duration === 12);
    check('ya no quedan elementos del formato anterior', (await prisma.playlistItem.count({ where: { playlistId: { in: [split, fullMenu, fullMedia, orphan, shared] }, type: 'legacy' } })) === 0);

    const p1 = await prisma.playlist.findUniqueOrThrow({ where: { id: split } });
    check('el ciclo de una sola pantalla pasa a ser propio y se renombra', p1.private === true && p1.name === 'Ciclo de TV split', `${p1.private} ${p1.name}`);
    const po = await prisma.playlist.findUniqueOrThrow({ where: { id: orphan } });
    check('un ciclo sin pantalla no se marca como propio ni se renombra', po.private === false && po.name === 'Playlist suelta');
    const ps = await prisma.playlist.findUniqueOrThrow({ where: { id: shared } });
    check('un ciclo usado por 2 pantallas queda compartido', ps.private === false && ps.name === 'Playlist - Screen abc');

    const tv = await buildScenes(split, businessId);
    check('la TV recibe lo mismo que antes (precios + promos al costado)', tv.length === 1 && (tv[0] as any).type === 'prices' && (tv[0] as any).side.length === 2 && (tv[0] as any).priceList.items.length === 1);
    check('es idempotente: una segunda pasada no migra nada nuevo de este negocio', (await migrateLegacyPlaylists()) === 0);
  } finally {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  }
  console.log(`\n${passed} correctas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => { console.error(e); process.exit(1); });
