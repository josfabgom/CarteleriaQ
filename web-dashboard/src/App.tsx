import React, { useCallback, useEffect, useState } from 'react';
import { Me, apiFetch, formatBytes, getToken, setToken } from './api';
import Account from './components/Account';
import BusinessManager from './components/BusinessManager';
import Login from './components/Login';
import MediaUpload from './components/MediaUpload';
import PriceListManager from './components/PriceListManager';
import PricingManager from './components/PricingManager';
import ProductManager from './components/ProductManager';
import ScreenManager from './components/ScreenManager';

const BUSINESS_NAV = [
  { id: 'dashboard', label: 'Inicio' },
  { id: 'pantallas', label: 'Pantallas' },
  { id: 'medios', label: 'Medios & Promociones' },
  { id: 'articulos', label: 'Catálogo de Artículos' },
  { id: 'ajuste', label: 'Ajuste de precios' },
  { id: 'precios', label: 'Listas de Pantalla' },
  { id: 'cuenta', label: 'Mi cuenta' }
];

const ADMIN_NAV = [
  { id: 'negocios', label: 'Negocios' },
  { id: 'cuenta', label: 'Mi cuenta' }
];

const UsageBar = ({ label, text, used, total }: { label: string; text: string; used: number; total: number }) => {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded">
        <div className={`h-1.5 rounded ${pct >= 90 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const App = () => {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(!!getToken());
  const [activeTab, setActiveTab] = useState('dashboard');

  const refreshMe = useCallback(async () => {
    const res = await apiFetch('/api/auth/me');
    if (res.ok) setMe(await res.json());
  }, []);

  // Restaurar la sesión al abrir la página
  useEffect(() => {
    if (!getToken()) return;
    refreshMe().finally(() => setChecking(false));
  }, [refreshMe]);

  // apiFetch avisa cuando la sesión deja de valer
  useEffect(() => {
    const onLogout = () => setMe(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  // El uso del plan cambia al subir medios o vincular pantallas
  useEffect(() => {
    if (me?.role === 'business') refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleLogin = (user: Me) => {
    setMe(user);
    setActiveTab(user.role === 'superadmin' ? 'negocios' : 'dashboard');
  };

  const handleLogout = () => {
    setToken(null);
    setMe(null);
  };

  if (checking) return <div className="min-h-screen bg-gray-900" />;
  if (!me) return <Login onLogin={handleLogin} />;

  const isAdmin = me.role === 'superadmin';
  const nav = isAdmin ? ADMIN_NAV : BUSINESS_NAV;
  const usage = me.business?.usage;

  return (
    <div className="flex h-screen bg-gray-100">

      {/* Sidebar Lateral */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6 text-center border-b border-gray-800">
          <h1 className="text-xl font-bold tracking-wider">Cartelería Q</h1>
          <p className="text-gray-400 text-sm mt-1">{isAdmin ? 'Administración' : me.business?.name}</p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center px-4 py-3 rounded transition-colors ${activeTab === item.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
            >
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          {usage && (
            <>
              <UsageBar label="Pantallas" text={`${usage.screens} / ${usage.maxScreens}`} used={usage.screens} total={usage.maxScreens} />
              <UsageBar
                label="Espacio"
                text={`${formatBytes(usage.storageUsedBytes)} / ${formatBytes(usage.storageLimitBytes)}`}
                used={usage.storageUsedBytes}
                total={usage.storageLimitBytes}
              />
            </>
          )}
          <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
            <span className="truncate mr-2">{me.username}</span>
            <button onClick={handleLogout} className="text-gray-300 hover:text-white underline">Salir</button>
          </div>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">

          {activeTab === 'negocios' && isAdmin && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Negocios</h2>
              <BusinessManager />
            </div>
          )}

          {activeTab === 'cuenta' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Mi cuenta</h2>
              <Account />
            </div>
          )}

          {/* Vista: Dashboard / Inicio */}
          {activeTab === 'dashboard' && !isAdmin && (
            <div>
              <header className="mb-8">
                <h2 className="text-3xl font-bold text-gray-800">Bienvenido</h2>
                <p className="text-gray-600 mt-2">Selecciona un módulo en el menú lateral para comenzar a administrar el contenido de tus pantallas.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
                <div onClick={() => setActiveTab('pantallas')} className="bg-white p-6 shadow-sm rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h3 className="text-lg font-semibold mb-2 text-blue-600">Pantallas</h3>
                  <p className="text-gray-500 text-sm">Gestiona los dispositivos conectados y su programación.</p>
                </div>
                <div onClick={() => setActiveTab('medios')} className="bg-white p-6 shadow-sm rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h3 className="text-lg font-semibold mb-2 text-blue-600">Medios</h3>
                  <p className="text-gray-500 text-sm">Subí imágenes y videos para tus promociones.</p>
                </div>
                <div onClick={() => setActiveTab('articulos')} className="bg-white p-6 shadow-sm rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h3 className="text-lg font-semibold mb-2 text-blue-600">Artículos</h3>
                  <p className="text-gray-500 text-sm">Tus artículos con foto, unidad, categoría y precio.</p>
                </div>
                <div onClick={() => setActiveTab('ajuste')} className="bg-white p-6 shadow-sm rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h3 className="text-lg font-semibold mb-2 text-blue-600">Ajuste de precios</h3>
                  <p className="text-gray-500 text-sm">Subí o bajá precios por porcentaje, con redondeo, programado y con deshacer.</p>
                </div>
                <div onClick={() => setActiveTab('precios')} className="bg-white p-6 shadow-sm rounded-lg border border-gray-100 cursor-pointer hover:shadow-md transition">
                  <h3 className="text-lg font-semibold mb-2 text-blue-600">Listas</h3>
                  <p className="text-gray-500 text-sm">Armá las listas que se muestran en cada pantalla.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pantallas' && !isAdmin && (
            <div>
              <ScreenManager />
            </div>
          )}

          {activeTab === 'medios' && !isAdmin && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Biblioteca de Medios</h2>
              <MediaUpload />
            </div>
          )}

          {activeTab === 'articulos' && !isAdmin && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Inventario Global</h2>
              <ProductManager />
            </div>
          )}

          {activeTab === 'ajuste' && !isAdmin && (
            <div>
              <PricingManager />
            </div>
          )}

          {activeTab === 'precios' && !isAdmin && (
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
