import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

const MediaUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [mediaList, setMediaList] = useState<any[]>([]);

  const fetchMedia = async () => {
    try {
      const res = await fetch(`${API_URL}/api/media`);
      if (res.ok) {
        setMediaList(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus('Selecciona un archivo primero.');
      return;
    }

    setStatus('Subiendo...');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/api/media/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setStatus('¡Archivo subido exitosamente!');
        setFile(null);
        fetchMedia(); // Refrescar lista
      } else {
        setStatus('Error al subir el archivo.');
      }
    } catch (error) {
      setStatus('Error de red al intentar subir.');
    }
  };

  const handleDelete = async (id: string) => {
    if(!window.confirm('¿Eliminar este medio?')) return;
    try {
      const res = await fetch(`${API_URL}/api/media/${id}`, { method: 'DELETE' });
      if (res.ok) fetchMedia();
    } catch (e) {
      console.error('Error deleting media');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Sube tus Promociones (Imágenes o Videos)</h3>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 border rounded-lg bg-gray-50 border-gray-200">
        <input 
          type="file" 
          accept="image/*,video/*" 
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 flex-1
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100 bg-white border p-1"
        />
        <button 
          onClick={handleUpload}
          className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 transition"
        >
          Subir Archivo
        </button>
      </div>
      {status && <p className="text-sm font-medium text-blue-600 mb-6">{status}</p>}

      <h4 className="font-semibold mb-4 text-gray-700">Galería de Medios Subidos</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {mediaList.map(media => (
          <div key={media.id} className="border rounded overflow-hidden shadow-sm relative group">
            {media.type === 'image' ? (
              <img src={`${API_URL}${media.url}`} alt={media.name} className="w-full h-32 object-cover" />
            ) : (
              <video src={`${API_URL}${media.url}`} className="w-full h-32 object-cover" controls />
            )}
            <div className="p-2 bg-gray-50 flex justify-between items-center border-t">
              <span className="text-xs text-gray-600 truncate mr-2" title={media.name}>{media.name}</span>
              <button 
                onClick={() => handleDelete(media.id)} 
                className="text-red-500 hover:text-red-700 text-xs font-bold"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {mediaList.length === 0 && (
          <p className="text-gray-500 text-sm col-span-full">No hay medios subidos. Sube una promoción arriba.</p>
        )}
      </div>
    </div>
  );
};

export default MediaUpload;
