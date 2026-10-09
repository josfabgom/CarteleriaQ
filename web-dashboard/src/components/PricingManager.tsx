import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';

interface Meta { categories: { name: string; count: number }[]; withoutCategory: number; units: string[] }
interface Row { type: 'product' | 'priceItem'; id: string; name: string; category: string | null; oldPrice: number; newPrice: number }
interface Preview { description: string; count: number; shown: number; rows: Row[] }
interface Change {
  id: string; description: string; status: string; scheduledFor: string | null; appliedAt: string | null;
  affectedCount: number; errorMessage: string | null; undoSummary: string | null; createdAt: string;
  items?: { id: string; name: string; oldPrice: number; newPrice: number }[];
}
interface ProductLite { id: string; name: string; category: string | null; price: number }

const money = (n: number) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const STEPS = [0, 1, 5, 10, 50, 100, 500, 1000];

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Programado', cls: 'bg-blue-100 text-blue-700' },
  applying: { label: 'Aplicando…', cls: 'bg-yellow-100 text-yellow-700' },
  applied: { label: 'Aplicado', cls: 'bg-green-100 text-green-700' },
  undone: { label: 'Deshecho', cls: 'bg-gray-200 text-gray-600' },
  cancelled: { label: 'Cancelado', cls: 'bg-gray-200 text-gray-600' },
  failed: { label: 'Falló', cls: 'bg-red-100 text-red-700' }
};

const PricingManager = () => {
  // Configuración del ajuste
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [operation, setOperation] = useState<'percent' | 'amount'>('percent');
  const [amount, setAmount] = useState('');
  const [roundStep, setRoundStep] = useState(0);
  const [roundDirection, setRoundDirection] = useState<'nearest' | 'up' | 'down'>('nearest');
  const [scopeType, setScopeType] = useState<'all' | 'categories' | 'products'>('all');
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [prods, setProds] = useState<Set<string>>(new Set());
  const [includeManual, setIncludeManual] = useState(false);
  const [note, setNote] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');

  const [meta, setMeta] = useState<Meta | null>(null);
  const [catalog, setCatalog] = useState<ProductLite[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [changes, setChanges] = useState<Change[]>([]);
  const [detail, setDetail] = useState<Change | null>(null);

  const value = useMemo(() => {
    const n = parseFloat(amount.replace(',', '.'));
    return Number.isFinite(n) ? (direction === 'down' ? -Math.abs(n) : Math.abs(n)) : NaN;
  }, [amount, direction]);

  const body = useMemo(() => ({
    operation, value, roundStep, roundDirection,
    scope:
      scopeType === 'all' ? { type: 'all', includeManual }
      : scopeType === 'categories' ? { type: 'categories', categories: [...cats] }
      : { type: 'products', productIds: [...prods] }
  }), [operation, value, roundStep, roundDirection, scopeType, includeManual, cats, prods]);

  // Cualquier cambio en el formulario invalida la vista previa
  useEffect(() => { setPreview(null); }, [body]);

  const loadChanges = useCallback(async () => {
    const res = await apiFetch('/api/pricing/changes');
    if (res.ok) setChanges(await res.json());
  }, []);

  useEffect(() => {
    (async () => {
      const [m, p] = await Promise.all([apiFetch('/api/pricing/meta'), apiFetch('/api/products')]);
      if (m.ok) setMeta(await m.json());
      if (p.ok) setCatalog(await p.json());
    })();
    loadChanges();
    const timer = setInterval(loadChanges, 20000); // refleja los cambios programados que el servidor va aplicando
    return () => clearInterval(timer);
  }, [loadChanges]);

  const toggleIn = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const formReady = Number.isFinite(value) && value !== 0 &&
    (scopeType === 'all' || (scopeType === 'categories' && cats.size > 0) || (scopeType === 'products' && prods.size > 0));

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return catalog.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
  }, [catalog, productSearch]);

  const runPreview = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/pricing/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (res.ok) setPreview(data);
      else setMessage({ ok: false, text: data?.error || 'No se pudo calcular la vista previa.' });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!preview) return;
    if (schedule && !scheduledFor) { setMessage({ ok: false, text: 'Elegí la fecha y hora.' }); return; }
    const when_ = schedule ? `programar para el ${when(new Date(scheduledFor).toISOString())}` : 'aplicar ahora';
    if (!window.confirm(`Se modificarán ${preview.count} precio(s).\n\n¿Confirmás ${when_}?`)) return;

    setBusy(true);
    try {
      const res = await apiFetch('/api/pricing/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, note, scheduledFor: schedule ? new Date(scheduledFor).toISOString() : undefined })
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setMessage({ ok: true, text: schedule ? 'Cambio programado. Se aplicará solo a la hora indicada.' : `Listo: se actualizaron ${data.affectedCount} precio(s). Podés deshacerlo desde el historial.` });
        setPreview(null);
        setAmount('');
        setNote('');
        setSchedule(false);
        setScheduledFor('');
        loadChanges();
      } else {
        setMessage({ ok: false, text: data?.error || 'No se pudo aplicar el cambio.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const undo = async (c: Change) => {
    if (!window.confirm(`¿Deshacer este cambio?\n\n${c.description}\n\nSe restauran los precios anteriores, salvo los que modificaste después.`)) return;
    const res = await apiFetch(`/api/pricing/changes/${c.id}/undo`, { method: 'POST' });
    const data = await res.json().catch(() => null);
    setMessage(res.ok
      ? { ok: true, text: `Deshecho: ${data.reverted} precio(s) restaurado(s)${data.skipped ? `, ${data.skipped} omitido(s) porque los cambiaste después` : ''}.` }
      : { ok: false, text: data?.error || 'No se pudo deshacer.' });
    loadChanges();
  };

  const cancel = async (c: Change) => {
    if (!window.confirm('¿Cancelar este cambio programado?')) return;
    const res = await apiFetch(`/api/pricing/changes/${c.id}/cancel`, { method: 'POST' });
    if (!res.ok) setMessage({ ok: false, text: (await res.json().catch(() => null))?.error || 'No se pudo cancelar.' });
    loadChanges();
  };

  const openDetail = async (c: Change) => {
    const res = await apiFetch(`/api/pricing/changes/${c.id}`);
    if (res.ok) setDetail(await res.json());
  };

  const minDateTime = new Date(Date.now() + 2 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-bold mb-1 text-gray-800">Ajuste masivo de precios</h3>
        <p className="text-sm text-gray-600 mb-6">
          Subí o bajá precios de muchos artículos a la vez. Los artículos del catálogo se actualizan en todas las pantallas. Siempre ves una vista previa antes de aplicar, y podés deshacer.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Qué cambio */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h4 className="font-semibold text-blue-700 mb-3">1. ¿Qué cambio querés hacer?</h4>
            <div className="flex flex-wrap gap-3 items-center mb-3">
              <div className="inline-flex rounded overflow-hidden border">
                <button type="button" onClick={() => setDirection('up')} className={`px-4 py-2 text-sm font-medium ${direction === 'up' ? 'bg-green-600 text-white' : 'bg-white text-gray-700'}`}>Subir</button>
                <button type="button" onClick={() => setDirection('down')} className={`px-4 py-2 text-sm font-medium ${direction === 'down' ? 'bg-red-600 text-white' : 'bg-white text-gray-700'}`}>Bajar</button>
              </div>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Valor" className="border p-2 rounded w-28 text-right" />
              <select value={operation} onChange={(e) => setOperation(e.target.value as 'percent' | 'amount')} className="border p-2 rounded bg-white text-sm">
                <option value="percent">% (porcentaje)</option>
                <option value="amount">$ (monto fijo)</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-3 items-center text-sm">
              <span className="text-gray-600">Redondear</span>
              <select value={roundStep} onChange={(e) => setRoundStep(Number(e.target.value))} className="border p-2 rounded bg-white">
                {STEPS.map((s) => <option key={s} value={s}>{s === 0 ? 'Sin redondeo' : `a múltiplos de $${s}`}</option>)}
              </select>
              {roundStep > 0 && (
                <select value={roundDirection} onChange={(e) => setRoundDirection(e.target.value as 'nearest' | 'up' | 'down')} className="border p-2 rounded bg-white">
                  <option value="nearest">al más cercano</option>
                  <option value="up">hacia arriba</option>
                  <option value="down">hacia abajo</option>
                </select>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-3">El precio anterior (el que se muestra tachado) no se modifica con el ajuste.</p>
          </div>

          {/* 2. A qué artículos */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h4 className="font-semibold text-blue-700 mb-3">2. ¿A qué artículos?</h4>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={scopeType === 'all'} onChange={() => setScopeType('all')} /> Todo el catálogo</label>
              {scopeType === 'all' && (
                <label className="flex items-start gap-2 ml-6 text-gray-600">
                  <input type="checkbox" className="mt-1" checked={includeManual} onChange={(e) => setIncludeManual(e.target.checked)} />
                  <span>Incluir también los artículos <em>manuales</em> de las listas (los que no vienen del catálogo)</span>
                </label>
              )}
              <label className="flex items-center gap-2"><input type="radio" checked={scopeType === 'categories'} onChange={() => setScopeType('categories')} /> Solo algunas categorías</label>
              {scopeType === 'categories' && (
                <div className="ml-6 flex flex-wrap gap-2">
                  {meta?.categories.map((c) => (
                    <label key={c.name} className={`px-3 py-1 rounded-full border cursor-pointer ${cats.has(c.name ?? '') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>
                      <input type="checkbox" className="hidden" checked={cats.has(c.name ?? '')} onChange={() => toggleIn(cats, setCats, c.name ?? '')} />
                      {c.name} <span className="opacity-70">({c.count})</span>
                    </label>
                  ))}
                  {meta && meta.withoutCategory > 0 && (
                    <label className={`px-3 py-1 rounded-full border cursor-pointer ${cats.has('') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>
                      <input type="checkbox" className="hidden" checked={cats.has('')} onChange={() => toggleIn(cats, setCats, '')} />
                      Sin categoría <span className="opacity-70">({meta.withoutCategory})</span>
                    </label>
                  )}
                  {meta && meta.categories.length === 0 && meta.withoutCategory === 0 && <span className="text-gray-500">No hay artículos cargados.</span>}
                </div>
              )}
              <label className="flex items-center gap-2"><input type="radio" checked={scopeType === 'products'} onChange={() => setScopeType('products')} /> Artículos que elija</label>
              {scopeType === 'products' && (
                <div className="ml-6">
                  <input type="search" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar artículo…" className="border p-2 rounded w-full mb-2" />
                  <div className="max-h-44 overflow-y-auto border rounded bg-white">
                    {filteredProducts.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 border-b last:border-0 cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={prods.has(p.id)} onChange={() => toggleIn(prods, setProds, p.id)} />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="text-gray-500">{money(p.price)}</span>
                      </label>
                    ))}
                    {filteredProducts.length === 0 && <p className="p-3 text-gray-500">Sin resultados.</p>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{prods.size} elegido(s)</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Nota (opcional, para el historial)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Ej: Suba semanal de proveedores" className="border p-2 rounded w-full" />
          </div>
          <div className="text-sm">
            <label className="block text-gray-600 mb-1">¿Cuándo?</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2"><input type="radio" checked={!schedule} onChange={() => setSchedule(false)} /> Ahora</label>
              <label className="flex items-center gap-2"><input type="radio" checked={schedule} onChange={() => setSchedule(true)} /> Programar</label>
              {schedule && <input type="datetime-local" min={minDateTime} value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="border p-2 rounded" />}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button onClick={runPreview} disabled={!formReady || busy} className="bg-blue-600 text-white px-5 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">Ver vista previa</button>
          {!formReady && <span className="text-sm text-gray-500">Completá el valor y los artículos.</span>}
        </div>

        {message && <p className={`mt-4 text-sm font-medium ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}

        {preview && (
          <div className="mt-6 border rounded-lg overflow-hidden">
            <div className="bg-blue-50 p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-blue-900">Vista previa: {preview.description}</div>
                <div className="text-sm text-blue-800">
                  {preview.count === 0 ? 'Ningún precio cambiaría con esta configuración.' : `Cambiarían ${preview.count} precio(s)${preview.shown < preview.count ? ` (se muestran los primeros ${preview.shown})` : ''}.`}
                </div>
              </div>
              {preview.count > 0 && (
                <button onClick={submit} disabled={busy} className={`px-5 py-2 rounded font-medium text-white disabled:opacity-50 ${schedule ? 'bg-blue-700 hover:bg-blue-800' : 'bg-green-600 hover:bg-green-700'}`}>
                  {schedule ? 'Programar cambio' : 'Aplicar ahora'}
                </button>
              )}
            </div>
            {preview.rows.length > 0 && (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-100 text-gray-700 sticky top-0">
                    <tr><th className="p-2">Artículo</th><th className="p-2">Categoría</th><th className="p-2 text-right">Antes</th><th className="p-2 text-right">Después</th><th className="p-2 text-right">Diferencia</th></tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => {
                      const diff = r.oldPrice > 0 ? ((r.newPrice - r.oldPrice) / r.oldPrice) * 100 : null;
                      return (
                        <tr key={r.type + r.id} className="border-t">
                          <td className="p-2">{r.name}</td>
                          <td className="p-2 text-gray-500">{r.category || '—'}</td>
                          <td className="p-2 text-right text-gray-500">{money(r.oldPrice)}</td>
                          <td className="p-2 text-right font-semibold">{money(r.newPrice)}</td>
                          <td className={`p-2 text-right ${r.newPrice > r.oldPrice ? 'text-green-700' : 'text-red-600'}`}>{diff === null ? '' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Historial y programados */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Programados e historial</h3>
        {changes.length === 0 && <p className="text-gray-500 text-sm">Todavía no hiciste ajustes de precios.</p>}
        <div className="space-y-3">
          {changes.map((c) => {
            const st = STATUS_STYLE[c.status] || { label: c.status, cls: 'bg-gray-200 text-gray-600' };
            return (
              <div key={c.id} className="border rounded-lg p-3 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800">{c.description}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.status === 'pending' && `Se aplicará el ${when(c.scheduledFor)}`}
                    {c.status === 'applied' && `Aplicado el ${when(c.appliedAt)} · ${c.affectedCount} precio(s)`}
                    {c.status === 'undone' && `Aplicado el ${when(c.appliedAt)} y deshecho · ${c.undoSummary || ''}`}
                    {c.status === 'cancelled' && `Programado para el ${when(c.scheduledFor)} y cancelado`}
                    {c.status === 'failed' && (c.errorMessage || 'No se pudo aplicar')}
                    {c.status === 'applying' && 'Procesando…'}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${st.cls}`}>{st.label}</span>
                <div className="space-x-3 text-sm">
                  {(c.status === 'applied' || c.status === 'undone') && <button onClick={() => openDetail(c)} className="text-blue-600 hover:underline">Ver detalle</button>}
                  {c.status === 'applied' && <button onClick={() => undo(c)} className="text-red-600 hover:underline">Deshacer</button>}
                  {c.status === 'pending' && <button onClick={() => cancel(c)} className="text-red-600 hover:underline">Cancelar</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <h4 className="font-bold text-gray-800">Detalle del cambio</h4>
              <p className="text-sm text-gray-600">{detail.description}</p>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-700 sticky top-0"><tr><th className="p-2">Artículo</th><th className="p-2 text-right">Antes</th><th className="p-2 text-right">Después</th></tr></thead>
                <tbody>
                  {detail.items?.map((i) => (
                    <tr key={i.id} className="border-t"><td className="p-2">{i.name}</td><td className="p-2 text-right text-gray-500">{money(i.oldPrice)}</td><td className="p-2 text-right font-semibold">{money(i.newPrice)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t text-right"><button onClick={() => setDetail(null)} className="px-4 py-1.5 border rounded hover:bg-gray-50 text-sm">Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingManager;
