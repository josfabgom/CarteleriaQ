import React, { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../config';
import { apiFetch } from '../api';

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  category: string | null;
  unit: string | null;
  available: boolean;
  image: { url: string } | null;
}

interface ListItem {
  id: string;
  linked: boolean;
  name: string;
  price: number;
  unit: string | null;
  oldPrice: number | null;
  badge: string | null;
  category: string | null;
  available: boolean;
  imageUrl: string | null;
}

interface PriceList {
  id: string;
  name: string;
  groupByCategory: boolean;
  hideUnavailable: boolean;
  items: ListItem[];
}

const money = (n: number) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);

const PriceListManager = () => {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [newListName, setNewListName] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Selector de artículos del catálogo
  const [pickerListId, setPickerListId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Artículo manual
  const [manualListId, setManualListId] = useState<string | null>(null);
  const [manual, setManual] = useState({ name: '', price: '', unit: '', category: '' });

  const fetchData = async () => {
    try {
      const [resLists, resCat] = await Promise.all([apiFetch('/api/pricelists'), apiFetch('/api/products')]);
      if (resLists.ok) setPriceLists(await resLists.json());
      if (resCat.ok) setCatalog(await resCat.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const categories = useMemo(
    () => [...new Set(catalog.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [catalog]
  );

  const pickerList = priceLists.find((l) => l.id === pickerListId) || null;
  const alreadyInPicker = useMemo(() => new Set(pickerList?.items.filter((i) => i.linked).map((i) => i.name) ?? []), [pickerList]);

  const visibleCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((p) => {
      if (categoryFilter === '__none__' ? !!p.category : categoryFilter && p.category !== categoryFilter) return false;
      return !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
    });
  }, [catalog, search, categoryFilter]);

  const createList = async () => {
    if (!newListName.trim()) return;
    await apiFetch('/api/pricelists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName.trim() })
    });
    setNewListName('');
    fetchData();
  };

  const deleteList = async (list: PriceList) => {
    if (!window.confirm(`¿Eliminar la lista "${list.name}"?\n\nLos artículos del catálogo no se borran.`)) return;
    await apiFetch(`/api/pricelists/${list.id}`, { method: 'DELETE' });
    fetchData();
  };

  const setOption = async (list: PriceList, key: 'groupByCategory' | 'hideUnavailable', value: boolean) => {
    setPriceLists((all) => all.map((l) => (l.id === list.id ? { ...l, [key]: value } : l)));
    await apiFetch(`/api/pricelists/${list.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    });
  };

  const openPicker = (listId: string) => {
    setPickerListId(listId);
    setSelected(new Set());
    setSearch('');
    setCategoryFilter('');
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addSelected = async () => {
    if (!pickerListId || selected.size === 0) return;
    const res = await apiFetch(`/api/pricelists/${pickerListId}/items/from-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: [...selected] })
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setMessage({ ok: true, text: `${data.added} artículo(s) agregado(s)${data.skipped ? ` (${data.skipped} ya estaban en la lista)` : ''}.` });
      setPickerListId(null);
      fetchData();
    } else {
      setMessage({ ok: false, text: data?.error || 'No se pudo agregar.' });
    }
  };

  const addManual = async () => {
    if (!manualListId || !manual.name.trim() || manual.price === '') return;
    const res = await apiFetch(`/api/pricelists/${manualListId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName: manual.name, price: parseFloat(manual.price), unit: manual.unit, category: manual.category })
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setManual({ name: '', price: '', unit: '', category: '' });
      setManualListId(null);
      setMessage({ ok: true, text: 'Artículo manual agregado.' });
      fetchData();
    } else {
      setMessage({ ok: false, text: data?.error || 'No se pudo agregar.' });
    }
  };

  const updateManualPrice = async (item: ListItem, value: string) => {
    const price = parseFloat(value);
    if (!Number.isFinite(price) || price === item.price) return;
    await apiFetch(`/api/pricelists/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price })
    });
    fetchData();
  };

  const deleteItem = async (item: ListItem) => {
    if (!window.confirm(`¿Quitar "${item.name}" de la lista?${item.linked ? '\n\nNo se borra del catálogo.' : ''}`)) return;
    await apiFetch(`/api/pricelists/items/${item.id}`, { method: 'DELETE' });
    fetchData();
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <h3 className="text-xl font-bold mb-2 text-gray-800">Listas para Pantallas</h3>
      <p className="text-sm text-gray-600 mb-6">
        Armá listas con tus artículos (por ejemplo "Mostrador", "Ofertas de la semana") y asignalas a las pantallas. Los artículos que agregás
        <strong> desde el catálogo quedan enlazados</strong>: si cambia su precio, foto o stock, se actualiza solo en todas las pantallas.
      </p>

      {message && (
        <p className={`text-sm font-medium mb-4 ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
      )}

      <div className="p-5 border rounded-lg bg-gray-50 border-gray-200 shadow-sm mb-8 max-w-xl">
        <h4 className="font-semibold mb-3 text-blue-700">Crear nueva lista</h4>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ej: Precios del día"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createList()}
            className="border p-2 rounded flex-1 text-sm"
          />
          <button onClick={createList} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">Crear</button>
        </div>
      </div>

      <h4 className="font-semibold mb-4 text-gray-800">Tus listas ({priceLists.length})</h4>
      {priceLists.length === 0 && <p className="text-gray-500 text-sm">No hay listas aún. Creá una arriba.</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {priceLists.map((list) => (
          <div key={list.id} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-gray-800 text-white p-3 flex justify-between items-center">
              <h5 className="font-bold">{list.name}</h5>
              <button onClick={() => deleteList(list)} className="text-red-300 text-sm font-medium hover:text-red-100 transition">Eliminar lista</button>
            </div>

            <div className="p-3 bg-gray-50 border-b flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2 text-gray-700" title="Muestra los artículos separados por categoría, con un título para cada una">
                <input type="checkbox" checked={list.groupByCategory} onChange={(e) => setOption(list, 'groupByCategory', e.target.checked)} />
                Agrupar por categoría
              </label>
              <label className="flex items-center gap-2 text-gray-700" title="Si está apagado, los artículos sin stock se muestran atenuados con la etiqueta AGOTADO">
                <input type="checkbox" checked={list.hideUnavailable} onChange={(e) => setOption(list, 'hideUnavailable', e.target.checked)} />
                Ocultar los sin stock
              </label>
              <span className="flex-1" />
              <button onClick={() => openPicker(list.id)} className="bg-green-600 text-white px-3 py-1.5 rounded font-medium hover:bg-green-700">+ Del catálogo</button>
              <button onClick={() => setManualListId(manualListId === list.id ? null : list.id)} className="px-3 py-1.5 border rounded bg-white hover:bg-gray-100">+ Manual</button>
            </div>

            {manualListId === list.id && (
              <div className="p-3 bg-yellow-50 border-b grid grid-cols-2 md:grid-cols-5 gap-2 text-sm items-end">
                <input placeholder="Nombre" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} className="border p-2 rounded col-span-2" />
                <input placeholder="Precio" type="number" step="0.01" min="0" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} className="border p-2 rounded" />
                <input placeholder="Unidad (kg…)" value={manual.unit} onChange={(e) => setManual({ ...manual, unit: e.target.value })} className="border p-2 rounded" />
                <button onClick={addManual} className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700">Agregar</button>
                <p className="col-span-full text-xs text-gray-500">Un artículo manual tiene su propio precio, independiente del catálogo (no se actualiza solo).</p>
              </div>
            )}

            <table className="w-full text-left text-sm text-gray-600">
              <tbody>
                {list.items.map((item) => (
                  <tr key={item.id} className={`border-t hover:bg-gray-50 ${item.available ? '' : 'opacity-60'}`}>
                    <td className="p-2 w-14">
                      {item.imageUrl ? (
                        <img src={`${API_URL}${item.imageUrl}`} alt="" className="w-10 h-10 object-cover rounded" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-200 text-gray-400 flex items-center justify-center font-bold text-sm">{item.name.charAt(0).toUpperCase()}</div>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="font-medium text-gray-900">
                        {item.name}
                        {item.badge && <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">{item.badge}</span>}
                        {!item.available && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-semibold">Sin stock</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.linked ? '🔗 Catálogo' : '✎ Manual'}{item.category ? ` · ${item.category}` : ''}
                      </div>
                    </td>
                    <td className="p-2 whitespace-nowrap text-right">
                      {item.oldPrice != null && item.oldPrice > item.price && <span className="text-gray-400 line-through mr-2 text-xs">{money(item.oldPrice)}</span>}
                      {item.linked ? (
                        <span className="text-green-700 font-semibold">{money(item.price)}{item.unit ? <span className="text-gray-500 font-normal"> / {item.unit}</span> : null}</span>
                      ) : (
                        <input type="number" step="0.01" min="0" defaultValue={item.price} key={item.price}
                          onBlur={(e) => updateManualPrice(item, e.target.value)} className="border rounded p-1 w-24 text-right text-green-700 font-semibold" />
                      )}
                    </td>
                    <td className="p-2 w-10 text-right">
                      <button onClick={() => deleteItem(item)} className="text-red-500 hover:text-red-700 text-lg leading-none" title="Quitar de la lista">&times;</button>
                    </td>
                  </tr>
                ))}
                {list.items.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-gray-500 italic">Esta lista está vacía. Agregá artículos del catálogo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Selector de artículos del catálogo */}
      {pickerList && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setPickerListId(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <h4 className="font-bold text-gray-800 mb-3">Agregar a "{pickerList.name}"</h4>
              <div className="flex flex-wrap gap-2 items-center">
                <input type="search" autoFocus placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="border p-2 rounded text-sm flex-1 min-w-[10rem]" />
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border p-2 rounded text-sm bg-white">
                  <option value="">Todas las categorías</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="__none__">Sin categoría</option>
                </select>
                <button type="button" className="text-sm text-blue-600 hover:underline"
                  onClick={() => setSelected((s) => new Set([...s, ...visibleCatalog.filter((p) => !alreadyInPicker.has(p.name)).map((p) => p.id)]))}>
                  Marcar los visibles
                </button>
                <button type="button" className="text-sm text-gray-500 hover:underline" onClick={() => setSelected(new Set())}>Limpiar</button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {catalog.length === 0 && <p className="p-6 text-gray-500 text-sm">El catálogo está vacío. Cargá artículos en "Catálogo de Artículos".</p>}
              {visibleCatalog.map((p) => {
                const already = alreadyInPicker.has(p.name);
                return (
                  <label key={p.id} className={`flex items-center gap-3 px-4 py-2 border-b cursor-pointer hover:bg-gray-50 ${already ? 'opacity-50' : ''}`}>
                    <input type="checkbox" disabled={already} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4" />
                    {p.image ? (
                      <img src={`${API_URL}${p.image.url}`} alt="" className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-200 text-gray-400 flex items-center justify-center font-bold text-sm">{p.name.charAt(0).toUpperCase()}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.category || 'Sin categoría'}{!p.available ? ' · Sin stock' : ''}</div>
                    </div>
                    <div className="text-green-700 font-semibold whitespace-nowrap">{money(p.price)}{p.unit ? <span className="text-gray-500 font-normal"> / {p.unit}</span> : null}</div>
                    {already && <span className="text-xs text-gray-500">ya está</span>}
                  </label>
                );
              })}
              {catalog.length > 0 && visibleCatalog.length === 0 && <p className="p-6 text-gray-500 text-sm">Ningún artículo coincide.</p>}
            </div>

            <div className="p-3 border-t flex items-center justify-between">
              <span className="text-sm text-gray-600">{selected.size} seleccionado(s)</span>
              <div className="space-x-2">
                <button type="button" onClick={() => setPickerListId(null)} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancelar</button>
                <button type="button" onClick={addSelected} disabled={selected.size === 0} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50">Agregar a la lista</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceListManager;
