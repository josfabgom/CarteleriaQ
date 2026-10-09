import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

const ScreenManager = () => {
  const [screens, setScreens] = useState<any[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [newScreenName, setNewScreenName] = useState('');
  const [newScreenLocation, setNewScreenLocation] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [mediaList, setMediaList] = useState<any[]>([]);
  
  const [selectedPriceList, setSelectedPriceList] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [selectedLayout, setSelectedLayout] = useState('split');
  const [selectedTransition, setSelectedTransition] = useState('fade');
  const [mediaDuration, setMediaDuration] = useState(10);

  const fetchScreens = async () => {
    try {
      const res = await fetch(`${API_URL}/api/screens`);
      if (res.ok) setScreens(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchScreens();
  }, []);

  const handleLinkScreen = async () => {
    if (!pairingCode || !newScreenName) {
      setStatusMsg('Por favor ingresa el código y el nombre.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/screens/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pairingCode.trim(), name: newScreenName.trim(), location: newScreenLocation.trim() })
      });
      
      if (res.ok) {
        setPairingCode('');
        setNewScreenName('');
        setNewScreenLocation('');
        setStatusMsg('¡Pantalla vinculada con éxito!');
        fetchScreens();
      } else {
        const data = await res.json();
        setStatusMsg(`Error: ${data.error}`);
      }
    } catch (e) {
      setStatusMsg('Error de red al vincular.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta pantalla? Deberás volver a vincularla.')) return;
    try {
      await fetch(`${API_URL}/api/screens/${id}`, { method: 'DELETE' });
      fetchScreens();
    } catch (e) {
      console.error(e);
    }
  };

  const openAssignModal = async (screenId: string) => {
    setSelectedScreenId(screenId);
    setShowModal(true);
    const screen = screens.find(s => s.id === screenId);
    
    // Set current values if they exist in screen
    setSelectedPriceList(screen?.playlist?.items?.find((i:any) => i.priceList)?.priceListId || '');
    setSelectedMedia(screen?.playlist?.items?.filter((i:any) => i.media).map((i:any) => i.mediaId) || []);
    setSelectedLayout(screen?.layout || 'split');
    setSelectedTransition(screen?.transition || 'fade');
    setMediaDuration(screen?.mediaDuration || 10);
    
    // Fetch options
    const [resPL, resMedia] = await Promise.all([
      fetch(`${API_URL}/api/pricelists`),
      fetch(`${API_URL}/api/media`)
    ]);
    if (resPL.ok) setPriceLists(await resPL.json());
    if (resMedia.ok) setMediaList(await resMedia.json());
  };

  const toggleMediaSelection = (id: string) => {
    setSelectedMedia(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const handleSaveAssignment = async () => {
    if (!selectedScreenId) return;
    try {
      await fetch(`${API_URL}/api/screens/${selectedScreenId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          priceListId: selectedPriceList, 
          mediaIds: selectedMedia,
          layout: selectedLayout,
          transition: selectedTransition,
          mediaDuration: mediaDuration
        })
      });
      setShowModal(false);
      fetchScreens();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6 relative">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-800">Gestión de Pantallas</h3>
      </div>

      <p className="text-gray-600 mb-6 text-sm">
        Para agregar una nueva pantalla, instálale la App Reproductora, espera a que muestre el <b>Código de Vinculación (6 caracteres)</b> e ingresalo aquí abajo junto a sus datos.
      </p>

      {/* Vincular Pantalla */}
      <div className="mb-8 p-4 bg-gray-50 border rounded-lg flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-[0.5]">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Código de la TV</label>
          <input 
            type="text" 
            placeholder="Ej: A1B2C3" 
            value={pairingCode}
            onChange={(e) => setPairingCode(e.target.value.toUpperCase().trim())}
            maxLength={6}
            className="w-full border p-2 rounded text-sm text-center font-bold tracking-widest uppercase"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre Identificador</label>
          <input 
            type="text" 
            placeholder="Ej: TV Mostrador" 
            value={newScreenName}
            onChange={(e) => setNewScreenName(e.target.value)}
            className="w-full border p-2 rounded text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Ubicación (Opcional)</label>
          <input 
            type="text" 
            placeholder="Ej: Local Centro" 
            value={newScreenLocation}
            onChange={(e) => setNewScreenLocation(e.target.value)}
            className="w-full border p-2 rounded text-sm"
          />
        </div>
        <button 
          onClick={handleLinkScreen}
          className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 transition font-medium"
        >
          Vincular Pantalla
        </button>
      </div>
      {statusMsg && <p className="mb-6 -mt-4 text-sm font-medium text-blue-600">{statusMsg}</p>}

      {/* Lista de Pantallas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {screens.map(screen => (
          <div key={screen.id} className="border border-gray-200 rounded-lg p-5 shadow-sm relative bg-white hover:border-blue-300 transition">
            <div className={`absolute top-4 right-4 h-3 w-3 rounded-full ${screen.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} title={screen.status}></div>
            
            <h4 className="font-bold text-lg text-gray-800 mb-1 truncate pr-6">{screen.name}</h4>
            <p className="text-xs text-gray-500 font-mono mb-4 truncate">{screen.id}</p>
            
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Ubicación</label>
                <div className="bg-gray-50 p-2 rounded text-sm text-gray-700 mt-1 border truncate">
                  {screen.location || 'Sin especificar'}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Contenido Asignado</label>
                {screen.playlist ? (
                  <div className="mt-1 p-2 bg-green-50 text-green-800 border border-green-200 rounded text-sm">
                    {(() => {
                      const plItems = screen.playlist.items || [];
                      const plPriceList = plItems.find((i: any) => i.priceList)?.priceList;
                      const plMedias = plItems.filter((i: any) => i.media).map((i: any) => i.media);

                      return (
                        <div className="flex flex-col gap-1 text-xs">
                          <div>
                            <span className="font-semibold">Menú:</span> {plPriceList ? plPriceList.name : 'Ninguno'}
                          </div>
                          <div>
                            <span className="font-semibold">Promociones:</span> {plMedias.length > 0 ? plMedias.map((m: any) => m.name).join(', ') : 'Ninguna'}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-2 rounded text-sm mt-1 border truncate bg-orange-50 text-orange-800 border-orange-200">
                    ⚠️ Sin contenido, asigna ahora
                  </div>
                )}
              </div>
            </div>

            <div className="flex space-x-2 border-t border-gray-100 pt-4">
              <button onClick={() => openAssignModal(screen.id)} className="flex-1 bg-blue-50 text-blue-700 py-1.5 rounded text-sm font-medium hover:bg-blue-100 border border-blue-200">Asignar Contenido</button>
              <button onClick={() => handleDelete(screen.id)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-red-100">Eliminar</button>
            </div>
          </div>
        ))}
        {screens.length === 0 && (
          <div className="col-span-full text-center p-8 text-gray-500 bg-gray-50 rounded border border-dashed">
            No tienes pantallas registradas. Vincula una nueva en el formulario superior.
          </div>
        )}
      </div>

      {/* Modal de Asignación */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-800">Asignar Contenido a la Pantalla</h2>
              <p className="text-gray-500 text-sm mt-1">Configura el diseño, animaciones y contenido que se mostrará.</p>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {/* Controles de Diseño y Animación */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                <div>
                  <label className="block text-xs font-semibold text-blue-800 mb-1">Diseño (Layout)</label>
                  <select 
                    value={selectedLayout} 
                    onChange={e => setSelectedLayout(e.target.value)}
                    className="w-full border p-2 rounded text-sm bg-white"
                  >
                    <option value="split">Dividido (60% Promo / 40% Menú)</option>
                    <option value="full-media">Solo Promociones (Pantalla Completa)</option>
                    <option value="full-menu">Solo Menú (Pantalla Completa)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-blue-800 mb-1">Transición</label>
                  <select 
                    value={selectedTransition} 
                    onChange={e => setSelectedTransition(e.target.value)}
                    className="w-full border p-2 rounded text-sm bg-white"
                  >
                    <option value="fade">Fundido Suave (Fade)</option>
                    <option value="slide">Deslizar (Slide)</option>
                    <option value="zoom">Acercamiento (Zoom Ken Burns)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-blue-800 mb-1">Tiempo por Imagen</label>
                  <select 
                    value={mediaDuration} 
                    onChange={e => setMediaDuration(Number(e.target.value))}
                    className="w-full border p-2 rounded text-sm bg-white"
                  >
                    <option value={5}>5 Segundos</option>
                    <option value={10}>10 Segundos</option>
                    <option value={15}>15 Segundos</option>
                    <option value={30}>30 Segundos</option>
                    <option value={60}>1 Minuto</option>
                  </select>
                </div>
              </div>

              <div className="mb-6">
                <label className="block font-semibold text-gray-700 mb-2">1. Selecciona la Lista de Precios (Menú)</label>
                <select 
                  value={selectedPriceList} 
                  onChange={e => setSelectedPriceList(e.target.value)}
                  className="w-full border p-3 rounded-lg bg-gray-50"
                >
                  <option value="">-- Sin Menú de Precios --</option>
                  {priceLists.map(pl => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-2">2. Selecciona las Promociones (Carrusel de Medios)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {mediaList.map(m => {
                    const isSelected = selectedMedia.includes(m.id);
                    return (
                      <div 
                        key={m.id} 
                        onClick={() => toggleMediaSelection(m.id)}
                        className={`cursor-pointer border-2 rounded-lg p-2 relative transition ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                      >
                        {isSelected && <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">✓</div>}
                        <div className="h-20 bg-gray-200 rounded mb-2 overflow-hidden flex items-center justify-center">
                           {m.type === 'image' ? <img src={`${API_URL}${m.url}`} className="object-cover h-full w-full" /> : <span className="text-xs text-gray-500">🎥 Video</span>}
                        </div>
                        <p className="text-xs text-center truncate text-gray-700" title={m.name}>{m.name}</p>
                      </div>
                    )
                  })}
                  {mediaList.length === 0 && <p className="text-sm text-gray-500">No hay medios subidos. Ve a la pestaña Medios para subir fotos o videos.</p>}
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
              <button onClick={() => setShowModal(false)} className="px-5 py-2 rounded text-gray-600 hover:bg-gray-200 font-medium">Cancelar</button>
              <button onClick={handleSaveAssignment} className="px-5 py-2 rounded bg-green-600 text-white hover:bg-green-700 font-medium shadow">Guardar y Enviar a Pantalla</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ScreenManager;
