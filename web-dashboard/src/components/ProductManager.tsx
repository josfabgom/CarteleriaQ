import React, { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../config';
import { apiFetch } from '../api';

interface Product {
  id: string;
  internalCode: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  unit: string | null;
  oldPrice: number | null;
  badge: string | null;
  available: boolean;
  imageId: string | null;
  image: { id: string; url: string } | null;
}

interface MediaItem { id: string; name: string; url: string; type: string }

const emptyForm = {
  id: '', internalCode: '', barcode: '', name: '', description: '', price: '',
  category: '', unit: '', oldPrice: '', badge: '', available: true, imageId: ''
};

const UNIT_SUGGESTIONS = ['unidad', 'kg', '100 g', 'litro', 'docena', 'pack', 'metro', 'porción'];
const BADGE_SUGGESTIONS = ['OFERTA', 'NUEVO', 'DESTACADO', 'PROMO'];

// Precio con separador de miles: 12900 -> "12.900"
const money = (n: number) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);

const ProductManager = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [images, setImages] = useState<MediaItem[]>([]);
  const [formData, setFormData] = useState(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [statusOk, setStatusOk] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Filtros del listado
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);

  // Importación CSV
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadOk, setUploadOk] = useState(true);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/api/products');
      if (res.ok) setProducts(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchImages = async () => {
    try {
      const res = await apiFetch('/api/media');
      if (res.ok) setImages((await res.json()).filter((m: MediaItem) => m.type === 'image'));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchImages();
  }, []);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [products]
  );
  const units = useMemo(() => [...new Set([...UNIT_SUGGESTIONS, ...products.map((p) => p.unit).filter((u): u is string => !!u)])], [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter === '__none__' ? !!p.category : categoryFilter && p.category !== categoryFilter) return false;
      if (onlyOutOfStock && p.available) return false;
      if (!q) return true;
      return [p.name, p.internalCode, p.barcode, p.description, p.category].some((v) => v && v.toLowerCase().includes(q));
    });
  }, [products, search, categoryFilter, onlyOutOfStock]);

  const selectedImage = formData.imageId
    ? (images.find((i) => i.id === formData.imageId) ?? products.find((p) => p.id === formData.id)?.image ?? null)
    : null;

  const setField = (name: string, value: string | boolean) => setFormData((f) => ({ ...f, [name]: value }));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setField(e.target.name, e.target.value);

  const handlePhotoUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploadingPhoto(true);
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await apiFetch('/api/media/upload', { method: 'POST', body });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        await fetchImages();
        setField('imageId', data.id);
        setPickerOpen(false);
      } else {
        setStatusOk(false);
        setStatus(data?.error || 'No se pudo subir la foto.');
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusOk(true);
    setStatus('Guardando...');

    const payload = {
      internalCode: formData.internalCode,
      barcode: formData.barcode,
      name: formData.name,
      description: formData.description,
      price: parseFloat(formData.price),
      category: formData.category,
      unit: formData.unit,
      oldPrice: formData.oldPrice === '' ? null : parseFloat(formData.oldPrice),
      badge: formData.badge,
      available: formData.available,
      imageId: formData.imageId || null
    };

    try {
      const res = await apiFetch(isEditing ? `/api/products/${formData.id}` : '/api/products', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setStatus('¡Guardado!');
        setFormData(emptyForm);
        setIsEditing(false);
        fetchProducts();
      } else {
        const err = await res.json().catch(() => null);
        setStatusOk(false);
        setStatus(`Error: ${err?.error || 'no se pudo guardar'}`);
      }
    } catch {
      setStatusOk(false);
      setStatus('Error de red.');
    }
  };

  const handleEdit = (p: Product) => {
    setFormData({
      id: p.id,
      internalCode: p.internalCode || '',
      barcode: p.barcode || '',
      name: p.name || '',
      description: p.description || '',
      price: p.price?.toString() || '',
      category: p.category || '',
      unit: p.unit || '',
      oldPrice: p.oldPrice?.toString() || '',
      badge: p.badge || '',
      available: p.available,
      imageId: p.imageId || ''
    });
    setIsEditing(true);
    setStatus('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (p: Product) => {
    if (!window.confirm(`¿Eliminar "${p.name}"?\n\nTambién se quitará de todas las listas de pantalla donde esté.`)) return;
    await apiFetch(`/api/products/${p.id}`, { method: 'DELETE' });
    fetchProducts();
  };

  const toggleAvailability = async (p: Product) => {
    setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, available: !p.available } : x))); // se ve al instante
    const res = await apiFetch(`/api/products/${p.id}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: !p.available })
    });
    if (!res.ok) fetchProducts();
  };

  const cancelEdit = () => {
    setFormData(emptyForm);
    setIsEditing(false);
    setStatus('');
  };

  const handleUploadCSV = async () => {
    if (!uploadFile) return;
    setUploadOk(true);
    setUploadErrors([]);
    setUploadStatus('Subiendo e importando artículos...');
    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const res = await apiFetch('/api/products/upload-csv', { method: 'POST', body: formData });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        const errors: string[] = data?.errors || [];
        setUploadOk(errors.length === 0);
        setUploadStatus(
          `Importación terminada: ${data?.created ?? 0} nuevos, ${data?.updated ?? 0} actualizados` +
          (errors.length ? `, ${errors.length} fila(s) rechazada(s).` : '.')
        );
        setUploadErrors(errors);
        setUploadFile(null);
        fetchProducts();
      } else {
        setUploadOk(false);
        setUploadStatus(data?.error || 'Error al importar el archivo CSV.');
      }
    } catch {
      setUploadOk(false);
      setUploadStatus('Error de conexión.');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Catálogo de Artículos</h3>

      {/* Importación CSV */}
      <div className="mb-8 p-6 border rounded-lg bg-gray-50 border-gray-200 shadow-sm">
        <h4 className="font-semibold mb-2 text-blue-700">Importar Artículos desde CSV</h4>
        <p className="text-sm text-gray-500 mb-3">
          Primera fila con los encabezados <code>nombre</code> y <code>precio</code> (obligatorios) y, opcionalmente, <code>codigo_interno</code>,
          {' '}<code>codigo_barra</code>, <code>descripcion</code>, <code>categoria</code>, <code>unidad</code>, <code>precio_anterior</code>,
          {' '}<code>etiqueta</code> y <code>disponible</code> (si/no). Acepta separador coma o punto y coma (Excel). Si el código ya existe, el artículo se actualiza.
        </p>
        <div className="flex flex-col md:flex-row gap-4 mb-2 items-center">
          <input type="file" accept=".csv" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="border p-2 rounded flex-1 bg-white" />
          <button onClick={handleUploadCSV} className="bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700 transition">Subir e Importar</button>
        </div>
        {uploadStatus && <p className={`text-sm font-medium ${uploadOk ? 'text-blue-600' : 'text-red-600'}`}>{uploadStatus}</p>}
        {uploadErrors.length > 0 && (
          <ul className="mt-2 text-sm text-red-600 list-disc pl-5 max-h-40 overflow-y-auto">
            {uploadErrors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}
            {uploadErrors.length > 50 && <li>…y {uploadErrors.length - 50} más</li>}
          </ul>
        )}
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="mb-8 p-6 border border-gray-200 rounded-lg bg-gray-50 shadow-sm">
        <h4 className="font-semibold mb-4 text-blue-700">{isEditing ? 'Editar Artículo' : 'Nuevo Artículo'}</h4>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Foto */}
          <div className="lg:w-48 flex-shrink-0">
            <label className="block text-sm text-gray-600 mb-1">Foto</label>
            <div className="w-48 h-36 border rounded bg-white flex items-center justify-center overflow-hidden">
              {selectedImage ? (
                <img src={`${API_URL}${selectedImage.url}`} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-400 text-sm text-center px-2">Sin foto</span>
              )}
            </div>
            <div className="flex gap-2 mt-2 text-sm">
              <button type="button" onClick={() => setPickerOpen(true)} className="px-3 py-1 border rounded bg-white hover:bg-gray-100">Elegir…</button>
              {formData.imageId ? (
                <button type="button" onClick={() => setField('imageId', '')} className="px-3 py-1 text-red-600 hover:underline">Quitar</button>
              ) : null}
            </div>
          </div>

          {/* Datos */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Nombre (obligatorio)</label>
              <input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Precio (obligatorio)</label>
              <input type="number" step="0.01" min="0" name="price" value={formData.price} onChange={handleInputChange} required className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Unidad de venta</label>
              <input type="text" name="unit" list="unit-list" value={formData.unit} onChange={handleInputChange} placeholder="kg, unidad, litro…" className="w-full border p-2 rounded" />
              <datalist id="unit-list">{units.map((u) => <option key={u} value={u} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Categoría</label>
              <input type="text" name="category" list="category-list" value={formData.category} onChange={handleInputChange} placeholder="Ej: Vacuno, Bebidas…" className="w-full border p-2 rounded" />
              <datalist id="category-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Precio anterior (tachado)</label>
              <input type="number" step="0.01" min="0" name="oldPrice" value={formData.oldPrice} onChange={handleInputChange} placeholder="Solo en ofertas" className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Etiqueta</label>
              <input type="text" name="badge" list="badge-list" value={formData.badge} onChange={handleInputChange} maxLength={24} placeholder="OFERTA, NUEVO…" className="w-full border p-2 rounded" />
              <datalist id="badge-list">{BADGE_SUGGESTIONS.map((b) => <option key={b} value={b} />)}</datalist>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                <input type="checkbox" checked={formData.available} onChange={(e) => setField('available', e.target.checked)} className="h-4 w-4" />
                Hay stock
              </label>
            </div>
            <div className="lg:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Descripción</label>
              <input type="text" name="description" value={formData.description} onChange={handleInputChange} maxLength={300} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Código interno</label>
              <input type="text" name="internalCode" value={formData.internalCode} onChange={handleInputChange} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Código de barras</label>
              <input type="text" name="barcode" value={formData.barcode} onChange={handleInputChange} className="w-full border p-2 rounded" />
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 mt-5">
          <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded shadow hover:bg-blue-700 transition">{isEditing ? 'Actualizar' : 'Guardar'}</button>
          {isEditing && <button type="button" onClick={cancelEdit} className="text-gray-500 hover:text-gray-800">Cancelar</button>}
          {status && <span className={`text-sm ml-4 font-medium ${statusOk ? 'text-blue-600' : 'text-red-600'}`}>{status}</span>}
        </div>
      </form>

      {/* Listado */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h4 className="font-semibold text-gray-700 mr-2">Artículos ({filtered.length}{filtered.length !== products.length ? ` de ${products.length}` : ''})</h4>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="border p-2 rounded text-sm w-48" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border p-2 rounded text-sm bg-white">
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__none__">Sin categoría</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={onlyOutOfStock} onChange={(e) => setOnlyOutOfStock(e.target.checked)} /> Solo sin stock
          </label>
        </div>

        <div className="overflow-x-auto border rounded border-gray-200">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-3 w-16">Foto</th>
                <th className="p-3">Artículo</th>
                <th className="p-3">Categoría</th>
                <th className="p-3">Precio</th>
                <th className="p-3 text-center">Stock</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className={`border-t hover:bg-gray-50 ${p.available ? '' : 'opacity-60'}`}>
                  <td className="p-2">
                    {p.image ? (
                      <img src={`${API_URL}${p.image.url}`} alt="" className="w-12 h-12 object-cover rounded" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-200 text-gray-400 flex items-center justify-center font-bold">{p.name.charAt(0).toUpperCase()}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-gray-900">
                      {p.name}
                      {p.badge && <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">{p.badge}</span>}
                    </div>
                    <div className="text-xs text-gray-500">{[p.internalCode, p.description].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td className="p-3">{p.category || <span className="text-gray-400">—</span>}</td>
                  <td className="p-3 whitespace-nowrap">
                    {p.oldPrice != null && p.oldPrice > p.price && <span className="text-gray-400 line-through mr-2">{money(p.oldPrice)}</span>}
                    <span className="font-semibold text-green-700">{money(p.price)}</span>
                    {p.unit && <span className="text-gray-500"> / {p.unit}</span>}
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => toggleAvailability(p)} title="Cambiar disponibilidad"
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${p.available ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {p.available ? 'Disponible' : 'Sin stock'}
                    </button>
                  </td>
                  <td className="p-3 text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => handleEdit(p)} className="text-blue-500 hover:text-blue-700 font-medium">Editar</button>
                    <button onClick={() => handleDelete(p)} className="text-red-500 hover:text-red-700 font-medium">Eliminar</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-gray-500">{products.length === 0 ? 'No hay artículos cargados.' : 'Ningún artículo coincide con el filtro.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selector de foto */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h4 className="font-bold text-gray-800">Elegir foto</h4>
              <label className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm cursor-pointer hover:bg-blue-700">
                {uploadingPhoto ? 'Subiendo…' : 'Subir foto nueva'}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingPhoto} onChange={(e) => handlePhotoUpload(e.target.files?.[0])} />
              </label>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-3 md:grid-cols-5 gap-3">
              {images.length === 0 && <p className="col-span-full text-gray-500 text-sm">Todavía no subiste imágenes. Usá "Subir foto nueva".</p>}
              {images.map((img) => (
                <button type="button" key={img.id} onClick={() => { setField('imageId', img.id); setPickerOpen(false); }}
                  className={`border-2 rounded overflow-hidden ${formData.imageId === img.id ? 'border-blue-600' : 'border-transparent hover:border-gray-300'}`} title={img.name}>
                  <img src={`${API_URL}${img.url}`} alt={img.name} className="w-full h-24 object-cover" />
                </button>
              ))}
            </div>
            <div className="p-3 border-t text-right">
              <button type="button" onClick={() => setPickerOpen(false)} className="px-4 py-1.5 border rounded hover:bg-gray-50 text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManager;
