import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

const PriceListManager = () => {
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [newListName, setNewListName] = useState('');
  
  // Selection state for adding products
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const fetchData = async () => {
    try {
      const [resLists, resCat] = await Promise.all([
        fetch(`${API_URL}/api/pricelists`),
        fetch(`${API_URL}/api/products`)
      ]);
      if (resLists.ok) setPriceLists(await resLists.json());
      if (resCat.ok) setCatalog(await resCat.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createList = async () => {
    if (!newListName) return;
    try {
      await fetch(`${API_URL}/api/pricelists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newListName })
      });
      setNewListName('');
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteList = async (listId: string) => {
    if(!window.confirm('¿Eliminar lista completa?')) return;
    await fetch(`${API_URL}/api/pricelists/${listId}`, { method: 'DELETE' });
    fetchData();
  };

  const addProductToList = async () => {
    if (!selectedListId || !selectedProductId) return;
    const product = catalog.find(p => p.id === selectedProductId);
    if (!product) return;

    try {
      await fetch(`${API_URL}/api/pricelists/${selectedListId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: product.name,
          price: product.price,
          description: product.description,
          order: 0
        })
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteItem = async (itemId: string) => {
    if(!window.confirm('¿Quitar producto de la lista?')) return;
    await fetch(`${API_URL}/api/pricelists/items/${itemId}`, { method: 'DELETE' });
    fetchData();
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Constructor de Listas de Pantalla</h3>
      <p className="text-sm text-gray-600 mb-6">Agrupa tus artículos en diferentes listas (Ej: "Menú Desayuno", "Menú Hamburguesas") para mostrarlos en distintas pantallas.</p>
      
      {/* Crear y Armar Lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        
        {/* Crear Lista */}
        <div className="p-5 border rounded-lg bg-gray-50 border-gray-200 shadow-sm">
          <h4 className="font-semibold mb-3 text-blue-700">1. Crear Nueva Lista</h4>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Ej: Menú de Bebidas" 
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="border p-2 rounded flex-1 text-sm"
            />
            <button onClick={createList} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">Crear</button>
          </div>
        </div>

        {/* Añadir Producto a Lista */}
        <div className="p-5 border rounded-lg bg-green-50 border-green-200 shadow-sm">
          <h4 className="font-semibold mb-3 text-green-700">2. Agregar Artículo a una Lista</h4>
          <div className="flex flex-col gap-2">
            <select 
              value={selectedListId} 
              onChange={e => setSelectedListId(e.target.value)}
              className="border p-2 rounded text-sm w-full bg-white"
            >
              <option value="">-- Selecciona la Lista --</option>
              {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
            <div className="flex gap-2">
              <select 
                value={selectedProductId} 
                onChange={e => setSelectedProductId(e.target.value)}
                className="border p-2 rounded text-sm flex-1 bg-white"
              >
                <option value="">-- Selecciona el Artículo (Catálogo) --</option>
                {catalog.map(cat => <option key={cat.id} value={cat.id}>{cat.name} - ${cat.price}</option>)}
              </select>
              <button onClick={addProductToList} className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700">Agregar</button>
            </div>
          </div>
        </div>

      </div>

      {/* Visualización y ABM */}
      <div>
        <h4 className="font-semibold mb-4 text-gray-800">Tus Listas Armadas ({priceLists.length})</h4>
        {priceLists.length === 0 ? <p className="text-gray-500 text-sm">No hay listas aún. Crea una arriba.</p> : null}
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {priceLists.map((list) => (
            <div key={list.id} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-gray-800 text-white p-3 flex justify-between items-center">
                <h5 className="font-bold">{list.name}</h5>
                <button 
                  onClick={() => deleteList(list.id)}
                  className="text-red-300 text-sm font-medium hover:text-red-100 transition"
                >
                  Eliminar Lista
                </button>
              </div>
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3 w-20">Precio</th>
                    <th className="p-3 w-16 text-right">Quitar</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items?.map((item: any) => (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-900">{item.productName}</td>
                      <td className="p-3 text-green-700 font-semibold">${item.price}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => deleteItem(item.id)} className="text-red-500 hover:text-red-700 text-lg leading-none" title="Quitar de la lista">&times;</button>
                      </td>
                    </tr>
                  ))}
                  {(!list.items || list.items.length === 0) && (
                    <tr><td colSpan={3} className="p-4 text-center text-gray-500 italic">Esta lista está vacía.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PriceListManager;
