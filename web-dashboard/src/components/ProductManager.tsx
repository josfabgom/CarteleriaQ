import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

const ProductManager = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [formData, setFormData] = useState({ id: '', internalCode: '', barcode: '', name: '', description: '', price: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState('');

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/products`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Guardando...');
    
    try {
      const url = isEditing 
        ? `${API_URL}/api/products/${formData.id}` 
        : `${API_URL}/api/products`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setStatus('¡Guardado exitosamente!');
        setFormData({ id: '', internalCode: '', barcode: '', name: '', description: '', price: '' });
        setIsEditing(false);
        fetchProducts();
      } else {
        const err = await res.json();
        setStatus(`Error: ${err.error}`);
      }
    } catch (error) {
      setStatus('Error de red.');
    }
  };

  const handleEdit = (product: any) => {
    setFormData({
      id: product.id,
      internalCode: product.internalCode || '',
      barcode: product.barcode || '',
      name: product.name || '',
      description: product.description || '',
      price: product.price?.toString() || ''
    });
    setIsEditing(true);
    setStatus('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este artículo?')) return;
    await fetch(`${API_URL}/api/products/${id}`, { method: 'DELETE' });
    fetchProducts();
  };

  const cancelEdit = () => {
    setFormData({ id: '', internalCode: '', barcode: '', name: '', description: '', price: '' });
    setIsEditing(false);
    setStatus('');
  };

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');

  const handleUploadCSV = async () => {
    if (!uploadFile) return;
    setUploadStatus('Subiendo e importando artículos...');
    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const res = await fetch(`${API_URL}/api/products/upload-csv`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setUploadStatus('¡Importación completada con éxito!');
        setUploadFile(null);
        fetchProducts();
      } else {
        setUploadStatus('Error al importar el archivo CSV.');
      }
    } catch (error) {
      setUploadStatus('Error de conexión.');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Catálogo de Artículos</h3>
      
      {/* Sección Subida CSV */}
      <div className="mb-8 p-6 border rounded-lg bg-gray-50 border-gray-200 shadow-sm">
        <h4 className="font-semibold mb-2 text-blue-700">Importar Artículos desde CSV</h4>
        <p className="text-sm text-gray-500 mb-3">
          El CSV debe tener las columnas: <code>codigo_interno</code>, <code>codigo_barra</code>, <code>nombre</code>, <code>descripcion</code>, <code>precio</code>
        </p>
        <div className="flex flex-col md:flex-row gap-4 mb-2 items-center">
          <input 
            type="file" 
            accept=".csv"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            className="border p-2 rounded flex-1 bg-white"
          />
          <button 
            onClick={handleUploadCSV}
            className="bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700 transition"
          >
            Subir e Importar
          </button>
        </div>
        {uploadStatus && <p className="text-sm font-medium text-blue-600">{uploadStatus}</p>}
      </div>

      {/* Formulario ABM */}
      <form onSubmit={handleSubmit} className="mb-8 p-6 border border-gray-200 rounded-lg bg-gray-50 shadow-sm">
        <h4 className="font-semibold mb-4 text-blue-700">{isEditing ? 'Editar Artículo' : 'Nuevo Artículo'}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Código Interno</label>
            <input type="text" name="internalCode" value={formData.internalCode} onChange={handleInputChange} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Código de Barra</label>
            <input type="text" name="barcode" value={formData.barcode} onChange={handleInputChange} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Nombre (Obligatorio)</label>
            <input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Precio ($) (Obligatorio)</label>
            <input type="number" step="0.01" name="price" value={formData.price} onChange={handleInputChange} required className="w-full border p-2 rounded" />
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <label className="block text-sm text-gray-600 mb-1">Descripción</label>
            <input type="text" name="description" value={formData.description} onChange={handleInputChange} className="w-full border p-2 rounded" />
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded shadow hover:bg-blue-700 transition">
            {isEditing ? 'Actualizar' : 'Guardar'}
          </button>
          {isEditing && (
            <button type="button" onClick={cancelEdit} className="text-gray-500 hover:text-gray-800">
              Cancelar
            </button>
          )}
          {status && <span className="text-sm ml-4 font-medium text-blue-600">{status}</span>}
        </div>
      </form>

      {/* Tabla de Artículos */}
      <div>
        <h4 className="font-semibold mb-3 text-gray-700">Artículos Registrados ({products.length})</h4>
        <div className="overflow-x-auto border rounded border-gray-200">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-3">Código Int.</th>
                <th className="p-3">Código Barra</th>
                <th className="p-3">Nombre</th>
                <th className="p-3">Descripción</th>
                <th className="p-3">Precio</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">{p.internalCode || '-'}</td>
                  <td className="p-3 font-mono text-xs">{p.barcode || '-'}</td>
                  <td className="p-3 font-medium text-gray-900">{p.name}</td>
                  <td className="p-3 truncate max-w-[200px]">{p.description || '-'}</td>
                  <td className="p-3 font-semibold text-green-700">${p.price}</td>
                  <td className="p-3 text-right space-x-3">
                    <button onClick={() => handleEdit(p)} className="text-blue-500 hover:text-blue-700 font-medium">Editar</button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-700 font-medium">Eliminar</button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-gray-500">No hay artículos cargados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductManager;
