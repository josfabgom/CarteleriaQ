import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL } from '../config';
import { apiFetch } from '../api';

type SceneType = 'prices' | 'offers' | 'media' | 'text';

interface Scene {
  key: string;
  type: SceneType;
  name: string;
  duration: number;
  enabled: boolean;
  priceListId: string | null;
  mediaId: string | null;
  config: any;
}

interface CycleSummary {
  id: string; name: string; private: boolean; scenes: number; types: string[]; totalSeconds: number;
  screens: { id: string; name: string }[];
}
interface ListLite { id: string; name: string; items: { category: string | null }[] }
interface MediaLite { id: string; name: string; url: string; type: string }
interface ProductLite { id: string; name: string; price: number; oldPrice: number | null; badge: string | null; category: string | null; available: boolean; image: { url: string } | null }
interface PreviewScene { id: string; enabled: boolean; shown: boolean; count: number }

const TYPE_INFO: Record<SceneType, { label: string; icon: string; color: string; bar: string }> = {
  prices: { label: 'Precios', icon: '💲', color: 'bg-blue-100 text-blue-800', bar: 'bg-blue-500' },
  offers: { label: 'Ofertas', icon: '🔥', color: 'bg-red-100 text-red-800', bar: 'bg-red-500' },
  media: { label: 'Imagen / video', icon: '🖼️', color: 'bg-purple-100 text-purple-800', bar: 'bg-purple-500' },
  text: { label: 'Anuncio', icon: '📝', color: 'bg-green-100 text-green-800', bar: 'bg-green-500' }
};
const STYLE_LABEL: Record<string, string> = { list: 'Lista', 'photo-list': 'Lista con fotos', cards: 'Tarjetas con fotos' };
const THEMES: Record<string, string> = {
  red: 'from-red-800 to-red-500', blue: 'from-blue-900 to-blue-500', green: 'from-green-900 to-green-500',
  orange: 'from-orange-800 to-orange-400', purple: 'from-purple-900 to-purple-500', dark: 'from-slate-900 to-slate-600'
};

let keyCounter = 0;
const newKey = () => `s${Date.now().toString(36)}${keyCounter++}`;

const fmtDuration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ''}`.trim() : `${s} s`);
const isOfferProduct = (p: ProductLite) => p.available && ((p.oldPrice != null && p.oldPrice > p.price) || /oferta|promo/i.test(p.badge ?? ''));

const defaultScene = (type: SceneType, lists: ListLite[]): Scene => {
  const base = { key: newKey(), type, name: '', enabled: true, priceListId: null as string | null, mediaId: null as string | null };
  if (type === 'prices') return { ...base, duration: 20, priceListId: lists[0]?.id ?? null, config: { style: 'list', categories: [], sideMediaIds: [] } };
  if (type === 'offers') return { ...base, duration: 12, config: { source: 'auto', design: 'hero', categories: [], productIds: [], maxItems: 8, title: 'OFERTAS' } };
  if (type === 'media') return { ...base, duration: 10, config: {} };
  return { ...base, duration: 8, config: { title: '', subtitle: '', theme: 'red' } };
};

const Thumb = ({ m, className = 'w-full h-20' }: { m: MediaLite; className?: string }) =>
  m.type === 'image' ? (
    <img src={`${API_URL}${m.url}`} alt={m.name} className={`${className} object-cover`} />
  ) : (
    <div className={`${className} bg-gray-800 text-white flex items-center justify-center text-2xl`} title={m.name}>🎬</div>
  );

const CycleManager = ({ openCycleId, onOpened }: { openCycleId?: string | null; onOpened?: () => void }) => {
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  const [lists, setLists] = useState<ListLite[]>([]);
  const [media, setMedia] = useState<MediaLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Nuevo ciclo
  const [newName, setNewName] = useState('');
  const [template, setTemplate] = useState('prices-offers');

  // Editor
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [dirty, setDirty] = useState(false);
  const [usedBy, setUsedBy] = useState<{ id: string; name: string }[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [status, setStatus] = useState<PreviewScene[] | null>(null);
  const [modal, setModal] = useState<{ scene: Scene; isNew: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    const [c, l, m, p] = await Promise.all([apiFetch('/api/cycles'), apiFetch('/api/pricelists'), apiFetch('/api/media'), apiFetch('/api/products')]);
    if (c.ok) setCycles(await c.json());
    if (l.ok) setLists(await l.json());
    if (m.ok) setMedia(await m.json());
    if (p.ok) setProducts(await p.json());
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openEditor = useCallback(async (id: string, keepMessage = false) => {
    const res = await apiFetch(`/api/cycles/${id}`);
    if (!res.ok) { setMessage({ ok: false, text: 'No se pudo abrir el ciclo.' }); return; }
    const data = await res.json();
    setEditingId(id);
    setName(data.name);
    setIsPrivate(data.private);
    setUsedBy(data.screens);
    setScenes(data.scenes.map((s: any) => ({ key: s.id, type: s.type, name: s.name ?? '', duration: s.duration, enabled: s.enabled, priceListId: s.priceListId, mediaId: s.mediaId, config: s.config ?? {} })));
    setDirty(false);
    if (!keepMessage) setMessage(null);
    const prev = await apiFetch(`/api/cycles/${id}/preview`);
    setStatus(prev.ok ? (await prev.json()).scenes : null);
  }, []);

  // Salto desde la pantalla de "Pantallas" ("Editar ciclo")
  useEffect(() => {
    if (openCycleId) { openEditor(openCycleId); onOpened?.(); }
  }, [openCycleId, openEditor, onOpened]);

  const closeEditor = () => {
    if (dirty && !window.confirm('Tenés cambios sin guardar. ¿Salir igual?')) return;
    setEditingId(null);
    loadAll();
  };

  const createCycle = async () => {
    if (!newName.trim()) return;
    const res = await apiFetch('/api/cycles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), template: template || undefined }) });
    const data = await res.json().catch(() => null);
    if (res.ok) { setNewName(''); await loadAll(); openEditor(data.id); }
    else setMessage({ ok: false, text: data?.error || 'No se pudo crear el ciclo.' });
  };

  const duplicate = async (c: CycleSummary) => {
    const res = await apiFetch(`/api/cycles/${c.id}/duplicate`, { method: 'POST' });
    if (res.ok) { setMessage({ ok: true, text: `Ciclo duplicado: "${c.name} (copia)".` }); loadAll(); }
    else setMessage({ ok: false, text: (await res.json().catch(() => null))?.error || 'No se pudo duplicar.' });
  };

  const remove = async (c: CycleSummary) => {
    const used = c.screens.length ? `\n\nLo usan ${c.screens.length} pantalla(s) (${c.screens.map((s) => s.name).join(', ')}): quedarán sin contenido.` : '';
    if (!window.confirm(`¿Eliminar el ciclo "${c.name}"?${used}`)) return;
    await apiFetch(`/api/cycles/${c.id}`, { method: 'DELETE' });
    loadAll();
  };

  // ---------- Editor ----------
  const mutate = (fn: (list: Scene[]) => Scene[]) => { setScenes(fn); setDirty(true); setStatus(null); };
  const move = (i: number, d: -1 | 1) => mutate((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const patch = (i: number, p: Partial<Scene>) => mutate((l) => l.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const removeScene = (i: number) => mutate((l) => l.filter((_, k) => k !== i));
  const copyScene = (i: number) => mutate((l) => { const n = [...l]; n.splice(i + 1, 0, { ...l[i], key: newKey(), config: JSON.parse(JSON.stringify(l[i].config)) }); return n; });

  const totalEnabled = scenes.filter((s) => s.enabled).reduce((sum, s) => sum + s.duration, 0);

  const save = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      if (!name.trim()) { setMessage({ ok: false, text: 'Poné un nombre al ciclo.' }); return; }
      const payload = scenes.map((s) => ({ type: s.type, name: s.name, duration: s.duration, enabled: s.enabled, priceListId: s.priceListId, mediaId: s.mediaId, config: s.config }));
      const [r1, r2] = await Promise.all([
        apiFetch(`/api/cycles/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
        apiFetch(`/api/cycles/${editingId}/scenes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenes: payload }) })
      ]);
      if (r1.ok && r2.ok) {
        setMessage({ ok: true, text: usedBy.length ? `Guardado. Las ${usedBy.length} pantalla(s) que lo usan se actualizan en unos segundos.` : 'Guardado.' });
        await openEditor(editingId, true);
      } else {
        setMessage({ ok: false, text: (await (r2.ok ? r1 : r2).json().catch(() => null))?.error || 'No se pudo guardar.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const summary = (s: Scene): string => {
    if (s.type === 'prices') {
      const list = lists.find((l) => l.id === s.priceListId);
      const cats: string[] = s.config.categories ?? [];
      const side = (s.config.sideMediaIds ?? []).length;
      return [list?.name ?? '⚠ lista eliminada', STYLE_LABEL[s.config.style] ?? 'Lista', cats.length ? `Solo ${cats.map((c) => c || 'sin categoría').join(', ')}` : null, side ? `${side} promo(s) al costado` : null].filter(Boolean).join(' · ');
    }
    if (s.type === 'offers') {
      const manual = s.config.source === 'manual';
      const cats: string[] = s.config.categories ?? [];
      return [manual ? `Elegidas a mano (${(s.config.productIds ?? []).length})` : 'Automáticas', s.config.design === 'grid' ? 'Grilla' : 'Una por una (destacada)', !manual && cats.length ? `Solo ${cats.join(', ')}` : null].filter(Boolean).join(' · ');
    }
    if (s.type === 'media') {
      const m = media.find((x) => x.id === s.mediaId);
      return m ? `${m.type === 'video' ? 'Video' : 'Imagen'}: ${m.name}` : '⚠ archivo eliminado';
    }
    return `"${s.config.title || '(sin texto)'}"${s.config.subtitle ? ` — ${s.config.subtitle}` : ''}`;
  };

  // ---------- Lista de ciclos ----------
  if (!editingId) {
    return (
      <div className="space-y-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-bold mb-1 text-gray-800">Ciclos de pantalla</h3>
          <p className="text-sm text-gray-600 mb-5">
            Un ciclo es una secuencia de escenas (precios, ofertas, imágenes, anuncios) que rotan en la pantalla. Armalo una vez y asignalo a <strong>todas las pantallas que quieras</strong>:
            si lo cambiás, todas se actualizan.
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[14rem]">
              <label className="block text-sm text-gray-600 mb-1">Nombre del nuevo ciclo</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createCycle()} placeholder="Ej: Ciclo carnicería" className="border p-2 rounded w-full" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Empezar con</label>
              <select value={template} onChange={(e) => setTemplate(e.target.value)} className="border p-2 rounded bg-white">
                <option value="prices-offers">Precios + ofertas</option>
                <option value="prices">Solo precios</option>
                <option value="full">Precios + ofertas + promos</option>
                <option value="">Vacío</option>
              </select>
            </div>
            <button onClick={createCycle} disabled={!newName.trim()} className="bg-blue-600 text-white px-5 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">Crear ciclo</button>
          </div>
          {message && <p className={`mt-3 text-sm font-medium ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}
        </div>

        {cycles.length === 0 && <p className="text-gray-500">Todavía no hay ciclos. Creá el primero arriba.</p>}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {cycles.map((c) => (
            <div key={c.id} className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-bold text-gray-800 truncate">{c.name}</h4>
                  <p className="text-xs text-gray-500">
                    {c.private ? 'Propio de una pantalla' : 'Compartible'} · {c.scenes} escena(s) · {fmtDuration(c.totalSeconds)}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {c.types.map((t) => <span key={t} title={TYPE_INFO[t as SceneType]?.label} className={`text-xs px-2 py-1 rounded ${TYPE_INFO[t as SceneType]?.color ?? 'bg-gray-100'}`}>{TYPE_INFO[t as SceneType]?.icon}</span>)}
                </div>
              </div>
              <p className="text-sm mt-3 text-gray-600">
                {c.screens.length ? <>En: {c.screens.map((s) => <span key={s.id} className="inline-block bg-gray-100 rounded px-2 py-0.5 mr-1 text-xs">{s.name}</span>)}</> : <span className="text-orange-600">No está asignado a ninguna pantalla.</span>}
              </p>
              <div className="flex gap-3 mt-4 text-sm">
                <button onClick={() => openEditor(c.id)} className="bg-blue-50 text-blue-700 px-4 py-1.5 rounded font-medium border border-blue-200 hover:bg-blue-100">Editar</button>
                <button onClick={() => duplicate(c)} className="px-3 py-1.5 border rounded hover:bg-gray-50">Duplicar</button>
                <span className="flex-1" />
                <button onClick={() => remove(c)} className="text-red-500 hover:text-red-700 font-medium">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Editor del ciclo ----------
  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-lg shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={closeEditor} className="text-blue-600 hover:underline text-sm">← Ciclos</button>
          <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="border p-2 rounded text-lg font-bold flex-1 min-w-[12rem]" />
          <button onClick={save} disabled={!dirty || saving} className="bg-green-600 text-white px-5 py-2 rounded font-medium hover:bg-green-700 disabled:opacity-40">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          {dirty && <button onClick={() => editingId && openEditor(editingId)} className="text-gray-500 hover:underline text-sm">Descartar</button>}
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Duración del ciclo completo: <strong>{fmtDuration(totalEnabled)}</strong> · {scenes.filter((s) => s.enabled).length} escena(s) activa(s)
          {isPrivate && <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">Ciclo propio de una pantalla</span>}
        </p>
        <p className="text-sm mt-1">
          {usedBy.length ? <>Usado por: {usedBy.map((s) => <span key={s.id} className="inline-block bg-gray-100 rounded px-2 py-0.5 mr-1 text-xs">{s.name}</span>)}</> : <span className="text-orange-600">No está asignado a ninguna pantalla (asignalo desde "Pantallas").</span>}
        </p>
        {message && <p className={`mt-2 text-sm font-medium ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}

        {/* Línea de tiempo */}
        {scenes.length > 0 && (
          <div className="mt-4">
            <div className="flex h-9 rounded overflow-hidden border">
              {scenes.map((s, i) => (
                <div key={s.key} style={{ flex: s.duration }} title={`${TYPE_INFO[s.type].label} · ${s.duration} s`}
                  className={`${TYPE_INFO[s.type].bar} ${s.enabled ? '' : 'opacity-30'} text-white text-xs flex items-center justify-center border-r border-white/60 last:border-0 overflow-hidden`}>
                  <span className="truncate px-1">{i + 1} {TYPE_INFO[s.type].icon}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {scenes.length === 0 && <p className="text-gray-500 bg-white p-6 rounded-lg border border-dashed text-center">Este ciclo no tiene escenas. Agregá la primera con los botones de abajo.</p>}
        {scenes.map((s, i) => {
          const st = status?.[i];
          return (
            <div key={s.key} className={`bg-white rounded-lg shadow-sm border p-4 flex flex-wrap items-center gap-3 ${s.enabled ? 'border-gray-100' : 'opacity-60 border-dashed'}`}>
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-800 disabled:opacity-20 leading-none" title="Subir">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === scenes.length - 1} className="text-gray-400 hover:text-gray-800 disabled:opacity-20 leading-none" title="Bajar">▼</button>
              </div>
              <span className="w-6 text-center font-bold text-gray-400">{i + 1}</span>
              <span className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${TYPE_INFO[s.type].color}`}>{TYPE_INFO[s.type].icon} {TYPE_INFO[s.type].label}</span>
              <div className="flex-1 min-w-[12rem]">
                {s.name && <div className="font-medium text-gray-800">{s.name}</div>}
                <div className="text-sm text-gray-600">{summary(s)}</div>
                {st && st.enabled && (
                  <div className={`text-xs mt-0.5 ${st.shown ? 'text-green-600' : 'text-orange-600'}`}>
                    {st.shown ? (s.type === 'media' || s.type === 'text' ? '✓ Se muestra' : `✓ Se muestra hoy · ${st.count} artículo(s)`) : s.type === 'offers' ? '⚠ Hoy no hay ofertas: esta escena se omite' : '⚠ No tiene artículos para mostrar: se omite'}
                  </div>
                )}
              </div>
              <label className="flex items-center gap-1 text-sm text-gray-600" title="Segundos que dura esta escena">
                <input type="number" min={3} max={600} value={s.duration} onChange={(e) => patch(i, { duration: Math.max(3, Math.min(600, parseInt(e.target.value) || 3)) })} className="border rounded p-1 w-16 text-right" /> s
              </label>
              <label className="flex items-center gap-1 text-sm text-gray-600" title="Si lo apagás, la escena se saltea sin borrarla">
                <input type="checkbox" checked={s.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} /> Activa
              </label>
              <div className="flex gap-3 text-sm">
                <button onClick={() => setModal({ scene: JSON.parse(JSON.stringify(s)), isNew: false })} className="text-blue-600 hover:underline">Editar</button>
                <button onClick={() => copyScene(i)} className="text-gray-600 hover:underline">Duplicar</button>
                <button onClick={() => removeScene(i)} className="text-red-500 hover:underline">Quitar</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-dashed">
        <p className="text-sm text-gray-600 mb-3">Agregar escena:</p>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(TYPE_INFO) as SceneType[]).map((t) => (
            <button key={t} onClick={() => setModal({ scene: defaultScene(t, lists), isNew: true })} className={`px-4 py-2 rounded font-medium text-sm border ${TYPE_INFO[t].color} hover:opacity-80`}>
              {TYPE_INFO[t].icon} {TYPE_INFO[t].label}
            </button>
          ))}
        </div>
      </div>

      {modal && (
        <SceneModal
          scene={modal.scene} isNew={modal.isNew} lists={lists} media={media} products={products}
          onClose={() => setModal(null)}
          onSave={(saved) => {
            if (modal.isNew) mutate((l) => [...l, ...saved]);
            else mutate((l) => l.map((x) => (x.key === saved[0].key ? saved[0] : x)));
            setModal(null);
          }}
        />
      )}
    </div>
  );
};

// ---------- Formulario de una escena ----------
interface ModalProps {
  scene: Scene; isNew: boolean; lists: ListLite[]; media: MediaLite[]; products: ProductLite[];
  onClose: () => void; onSave: (scenes: Scene[]) => void;
}

const SceneModal = ({ scene, isNew, lists, media, products, onClose, onSave }: ModalProps) => {
  const [s, setS] = useState<Scene>(scene);
  const [picked, setPicked] = useState<string[]>(scene.type === 'media' && scene.mediaId ? [scene.mediaId] : []);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const cfg = s.config;
  const setCfg = (p: any) => setS((x) => ({ ...x, config: { ...x.config, ...p } }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const list = lists.find((l) => l.id === s.priceListId);
  const categories = useMemo(() => {
    const src = s.type === 'prices' ? (list?.items.map((i) => i.category) ?? []) : products.map((p) => p.category);
    return [...new Set(src.filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  }, [s.type, list, products]);
  const hasUncategorized = s.type === 'prices' ? !!list?.items.some((i) => !i.category) : products.some((p) => !p.category);

  const offerProducts = useMemo(() => products.filter(isOfferProduct), [products]);
  const autoOffers = offerProducts.filter((p) => !(cfg.categories ?? []).length || (cfg.categories as string[]).includes(p.category ?? ''));

  const filteredProducts = products.filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const images = media.filter((m) => m.type === 'image');

  const submit = () => {
    setError('');
    if (!Number.isFinite(s.duration) || s.duration < 3) { setError('La duración mínima es de 3 segundos.'); return; }
    if (s.type === 'prices' && !s.priceListId) { setError('Elegí una lista de precios.'); return; }
    if (s.type === 'offers' && cfg.source === 'manual' && !(cfg.productIds ?? []).length) { setError('Elegí al menos un artículo.'); return; }
    if (s.type === 'text' && !String(cfg.title ?? '').trim()) { setError('Escribí el texto del anuncio.'); return; }
    if (s.type === 'media') {
      if (picked.length === 0) { setError('Elegí al menos un archivo.'); return; }
      if (isNew) { onSave(picked.map((id) => ({ ...s, key: newKey(), mediaId: id, config: {} }))); return; }
      onSave([{ ...s, mediaId: picked[0] }]);
      return;
    }
    onSave([s]);
  };

  const chip = (active: boolean) => `px-3 py-1 rounded-full border text-sm cursor-pointer ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center gap-3">
          <span className={`text-sm font-semibold px-3 py-1 rounded ${TYPE_INFO[s.type].color}`}>{TYPE_INFO[s.type].icon} {TYPE_INFO[s.type].label}</span>
          <h4 className="font-bold text-gray-800 text-lg">{isNew ? 'Nueva escena' : 'Editar escena'}</h4>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-gray-600 mb-1">{s.type === 'prices' ? 'Título en pantalla (opcional)' : 'Nombre interno (opcional)'}</label>
              <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} maxLength={60} placeholder={s.type === 'prices' ? 'Si lo dejás vacío se usa el nombre de la lista' : ''} className="border p-2 rounded w-full" />
            </div>
            <div>
              <label className="block text-gray-600 mb-1">Duración (segundos)</label>
              <input type="number" min={3} max={600} value={s.duration} onChange={(e) => setS({ ...s, duration: parseInt(e.target.value) || 0 })} className="border p-2 rounded w-full" />
            </div>
          </div>

          {s.type === 'prices' && (
            <>
              <div>
                <label className="block text-gray-600 mb-1">Lista de precios</label>
                <select value={s.priceListId ?? ''} onChange={(e) => { setS({ ...s, priceListId: e.target.value || null }); setCfg({ categories: [] }); }} className="border p-2 rounded w-full bg-white">
                  <option value="">— Elegí una lista —</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.items.length})</option>)}
                </select>
                {lists.length === 0 && <p className="text-orange-600 mt-1">Todavía no tenés listas. Creálas en "Listas de Pantalla".</p>}
              </div>
              <div>
                <label className="block text-gray-600 mb-2">Estilo</label>
                <div className="grid grid-cols-3 gap-3">
                  {[['list', 'Lista', 'Nombre y precio. La más compacta.'], ['photo-list', 'Lista con fotos', 'Miniatura, nombre y precio.'], ['cards', 'Tarjetas con fotos', 'Foto grande por artículo.']].map(([v, t, d]) => (
                    <button type="button" key={v} onClick={() => setCfg({ style: v })} className={`text-left border-2 rounded-lg p-3 ${cfg.style === v ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                      <div className="font-semibold text-gray-800">{t}</div><div className="text-xs text-gray-500">{d}</div>
                    </button>
                  ))}
                </div>
              </div>
              {(categories.length > 0 || hasUncategorized) && (
                <div>
                  <label className="block text-gray-600 mb-1">Mostrar solo estas categorías <span className="text-gray-400">(ninguna marcada = todas)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => <button type="button" key={c} onClick={() => setCfg({ categories: toggle(cfg.categories ?? [], c) })} className={chip((cfg.categories ?? []).includes(c))}>{c}</button>)}
                    {hasUncategorized && <button type="button" onClick={() => setCfg({ categories: toggle(cfg.categories ?? [], '') })} className={chip((cfg.categories ?? []).includes(''))}>Sin categoría</button>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Útil para repartir una lista larga en varias escenas (una por categoría).</p>
                </div>
              )}
              <div>
                <label className="block text-gray-600 mb-1">Promos al costado <span className="text-gray-400">(la lista ocupa el 40 % y las imágenes rotan en el otro lado)</span></label>
                <div className="grid grid-cols-4 md:grid-cols-6 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                  {media.length === 0 && <p className="col-span-full text-gray-500">No hay imágenes ni videos cargados.</p>}
                  {media.map((m) => {
                    const on = (cfg.sideMediaIds ?? []).includes(m.id);
                    return (
                      <button type="button" key={m.id} onClick={() => setCfg({ sideMediaIds: toggle(cfg.sideMediaIds ?? [], m.id) })} className={`relative border-2 rounded overflow-hidden ${on ? 'border-blue-600' : 'border-transparent hover:border-gray-300'}`}>
                        <Thumb m={m} className="w-full h-16" />
                        {on && <span className="absolute top-1 right-1 bg-blue-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {s.type === 'offers' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-600 mb-2">¿Qué ofertas mostrar?</label>
                  <div className="space-y-2">
                    <button type="button" onClick={() => setCfg({ source: 'auto' })} className={`w-full text-left border-2 rounded-lg p-3 ${cfg.source !== 'manual' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="font-semibold">Automáticas</div><div className="text-xs text-gray-500">Todo artículo con precio anterior mayor al actual o con etiqueta OFERTA. Se actualizan solas.</div>
                    </button>
                    <button type="button" onClick={() => setCfg({ source: 'manual' })} className={`w-full text-left border-2 rounded-lg p-3 ${cfg.source === 'manual' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="font-semibold">Elegir artículos</div><div className="text-xs text-gray-500">Vos decidís cuáles y en qué orden.</div>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-600 mb-2">Diseño</label>
                  <div className="space-y-2">
                    <button type="button" onClick={() => setCfg({ design: 'hero' })} className={`w-full text-left border-2 rounded-lg p-3 ${cfg.design !== 'grid' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="font-semibold">Destacada</div><div className="text-xs text-gray-500">Una oferta a la vez, a pantalla grande, con el descuento en un círculo.</div>
                    </button>
                    <button type="button" onClick={() => setCfg({ design: 'grid' })} className={`w-full text-left border-2 rounded-lg p-3 ${cfg.design === 'grid' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="font-semibold">Grilla</div><div className="text-xs text-gray-500">Varias ofertas juntas en tarjetas con el descuento.</div>
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-600 mb-1">Título en pantalla</label>
                  <input value={cfg.title ?? ''} onChange={(e) => setCfg({ title: e.target.value })} maxLength={40} className="border p-2 rounded w-full" />
                </div>
                {cfg.source !== 'manual' && (
                  <div>
                    <label className="block text-gray-600 mb-1">Máximo de ofertas</label>
                    <select value={cfg.maxItems ?? 8} onChange={(e) => setCfg({ maxItems: Number(e.target.value) })} className="border p-2 rounded w-full bg-white">
                      {[3, 4, 6, 8, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {cfg.source !== 'manual' ? (
                <>
                  {categories.length > 0 && (
                    <div>
                      <label className="block text-gray-600 mb-1">Solo de estas categorías <span className="text-gray-400">(ninguna = todas)</span></label>
                      <div className="flex flex-wrap gap-2">{categories.map((c) => <button type="button" key={c} onClick={() => setCfg({ categories: toggle(cfg.categories ?? [], c) })} className={chip((cfg.categories ?? []).includes(c))}>{c}</button>)}</div>
                    </div>
                  )}
                  <div className={`p-3 rounded border ${autoOffers.length ? 'bg-green-50 border-green-200 text-green-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
                    {autoOffers.length
                      ? <>Hoy hay <strong>{autoOffers.length}</strong> oferta(s): {autoOffers.slice(0, 6).map((p) => p.name).join(', ')}{autoOffers.length > 6 ? '…' : ''}</>
                      : <>Hoy no hay ofertas: esta escena se omite hasta que haya. Para crear una, cargá un <strong>precio anterior</strong> o la etiqueta <strong>OFERTA</strong> en el catálogo.</>}
                  </div>
                </>
              ) : (
                <div>
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar artículo…" className="border p-2 rounded w-full mb-2" />
                  <div className="max-h-56 overflow-y-auto border rounded">
                    {filteredProducts.map((p) => {
                      const order = (cfg.productIds ?? []).indexOf(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 cursor-pointer hover:bg-gray-50">
                          <input type="checkbox" checked={order >= 0} onChange={() => setCfg({ productIds: toggle(cfg.productIds ?? [], p.id) })} />
                          {order >= 0 && <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">{order + 1}</span>}
                          <span className="flex-1 truncate">{p.name}</span>
                          {isOfferProduct(p) && <span className="text-xs bg-red-100 text-red-700 px-2 rounded-full">oferta</span>}
                          <span className="text-gray-500">${new Intl.NumberFormat('es-AR').format(p.price)}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">El número indica el orden en que se muestran. Los artículos sin stock se omiten.</p>
                </div>
              )}
            </>
          )}

          {s.type === 'media' && (
            <div>
              <label className="block text-gray-600 mb-1">
                {isNew ? 'Elegí uno o varios archivos (se crea una escena por cada uno)' : 'Archivo'}
              </label>
              <div className="grid grid-cols-4 md:grid-cols-5 gap-3 max-h-72 overflow-y-auto border rounded p-3">
                {media.length === 0 && <p className="col-span-full text-gray-500">Todavía no subiste imágenes ni videos (menú "Medios & Promociones").</p>}
                {media.map((m) => {
                  const on = picked.includes(m.id);
                  return (
                    <button type="button" key={m.id} onClick={() => setPicked(isNew ? toggle(picked, m.id) : [m.id])} className={`relative border-2 rounded overflow-hidden text-left ${on ? 'border-blue-600' : 'border-transparent hover:border-gray-300'}`}>
                      <Thumb m={m} className="w-full h-20" />
                      <div className="text-xs truncate px-1 py-0.5 bg-white">{m.name}</div>
                      {on && <span className="absolute top-1 right-1 bg-blue-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">✓</span>}
                    </button>
                  );
                })}
              </div>
              {images.length === 0 && media.length > 0 && <p className="text-xs text-gray-500 mt-1">Los videos se reproducen en bucle durante la duración de la escena.</p>}
            </div>
          )}

          {s.type === 'text' && (
            <>
              <div>
                <label className="block text-gray-600 mb-1">Texto principal</label>
                <input value={cfg.title ?? ''} onChange={(e) => setCfg({ title: e.target.value })} maxLength={80} placeholder="Ej: Hoy 10% de descuento pagando en efectivo" className="border p-2 rounded w-full" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Texto secundario (opcional)</label>
                <input value={cfg.subtitle ?? ''} onChange={(e) => setCfg({ subtitle: e.target.value })} maxLength={160} className="border p-2 rounded w-full" />
              </div>
              <div>
                <label className="block text-gray-600 mb-2">Color</label>
                <div className="flex gap-2">
                  {Object.keys(THEMES).map((t) => (
                    <button type="button" key={t} onClick={() => setCfg({ theme: t })} className={`w-12 h-12 rounded-lg bg-gradient-to-br ${THEMES[t]} border-4 ${cfg.theme === t ? 'border-gray-800' : 'border-transparent'}`} title={t} />
                  ))}
                </div>
              </div>
              <div className={`rounded-lg bg-gradient-to-br ${THEMES[cfg.theme ?? 'red']} text-white text-center p-8`}>
                <div className="text-2xl font-black">{cfg.title || 'Vista previa del anuncio'}</div>
                {cfg.subtitle && <div className="mt-2 opacity-90">{cfg.subtitle}</div>}
              </div>
            </>
          )}

          {error && <p className="text-red-600 font-medium">{error}</p>}
        </div>

        <div className="p-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50">Cancelar</button>
          <button onClick={submit} className="px-5 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700">{isNew ? 'Agregar al ciclo' : 'Aplicar'}</button>
        </div>
      </div>
    </div>
  );
};

export default CycleManager;
