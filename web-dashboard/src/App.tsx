import React, { useState } from 'react';
import MediaUpload from './components/MediaUpload';
import PriceListManager from './components/PriceListManager';
import ProductManager from './components/ProductManager';
import ScreenManager from './components/ScreenManager';

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex h-screen bg-gray-100">
      
      {/* Sidebar Lateral */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6 text-center border-b border-gray-800">
          <h1 className="text-xl font-bold tracking-wider">Cartelería Q</h1>
          <p className="text-gray-400 text-sm mt-1">Panel de Gestión</p>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center px-4 py-3 rounded transition-colors ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <span className="font-medium">Inicio</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('pantallas')}
            className={`w-full flex items-center px-4 py-3 rounded transition-colors ${activeTab === 'pantallas' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <span className="font-medium">Pantallas</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('medios')}
            className={`w-full flex items-center px-4 py-3 rounded transition-colors ${activeTab === 'medios' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <span className="font-medium">Medios & Promociones</span>
          </button>

          <button 
            onClick={() => setActiveTab('articulos')}
            className={`w-full flex items-center px-4 py-3 rounded transition-colors ${activeTab === 'articulos' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <span className="font-medium">Catálogo de Artículos</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('precios')}
            className={`w-full flex items-center px-4 py-3 rounded transition-colors ${activeTab === 'precios' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <span className="font-medium">Listas de Pantalla</span>
          </button>
        </nav>
        
        <div className="p-4 border-t border-gray-800 text-xs text-center text-gray-500">
          v1.0.0
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          
          {/* Vista: Dashboard / Inicio */}
          {activeTab === 'dashboard' && (
            <div>
              <header className="mb-8">
                <h2 className="text-3xl font-bold text-gray-800">Bienvenido</h2>
                <p className="text-gray-600 mt-2">Selecciona un módulo en el menú lateral para comenzar a administrar el contenido de tus pantallas.</p>
              </header>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div onClick={() => setActiveTab('pantallas')} className="bg-white p-6 shadow-sm rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h3 className="text-lg font-semibold mb-2 text-blue-600">Pantallas</h3>
                  <p className="text-gray-500 text-sm">Gestiona los dispositivos conectados y su programación.</p>
                </div>
                <div onClick={() => setActiveTab('medios')} className="bg-white p-6 shadow-sm rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h3 className="text-lg font-semibold mb-2 text-blue-600">Medios</h3>
                  <p className="text-gray-500 text-sm">Sube imágenes y videos (Promociones).</p>
                </div>
                <div onClick={() => setActiveTab('articulos')} className="bg-white p-6 shadow-sm rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h3 className="text-lg font-semibold mb-2 text-blue-600">Artículos</h3>
                  <p className="text-gray-500 text-sm">Administra tu inventario y precios base (ABM general).</p>
                </div>
                <div onClick={() => setActiveTab('precios')} className="bg-white p-6 shadow-sm rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h3 className="text-lg font-semibold mb-2 text-blue-600">Listas</h3>
                  <p className="text-gray-500 text-sm">Crea listas de precios específicas para pantallas vía CSV.</p>
                </div>
              </div>
            </div>
          )}

          {/* Vista: Pantallas */}
          {activeTab === 'pantallas' && (
            <div>
              <ScreenManager />
            </div>
          )}

          {/* Vista: Medios */}
          {activeTab === 'medios' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Biblioteca de Medios</h2>
              <MediaUpload />
            </div>
          )}

          {/* Vista: Artículos */}
          {activeTab === 'articulos' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Inventario Global</h2>
              <ProductManager />
            </div>
          )}

          {/* Vista: Listas de Precios */}
          {activeTab === 'precios' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Listas para Pantallas</h2>
              <PriceListManager />
            </div>
          )}

        </div>
      </main>

    </div>
  );
};

export default App;
