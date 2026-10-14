import React, { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../config';
import { apiFetch } from '../api';

interface Summary {
  mode: string; at: string; total: number; created: number; updated: number; unchanged: number; restored: number; hidden: number; conflicts: number;
}
interface IntegrationKey {
  id: string; name: string; prefix: string; linked: boolean; fingerprint: string | null;
  lastSeenAt: string | null; lastSyncAt: string | null; lastSummary: Summary | null; revoked: boolean; online: boolean; createdAt: string;
}

const ago = (iso: string | null): string => {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'hace unos segundos';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
};

const IntegrationManager = () => {
  const [keys, setKeys] = useState<IntegrationKey[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/integrations/keys');
    if (res.ok) setKeys(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const server = API_URL || window.location.origin;
  const configText = (key: string) => JSON.stringify({ servidor: server, claveIntegracion: key, rutaBase: 'C:\\Itegra\\Datos', cadaMinutos: 5, tiposDeArticulo: ['P', 'N'] }, null, 2);

  const create = async () => {
    setMessage(null);
    const res = await apiFetch('/api/integrations/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) { setMessage({ ok: false, text: data?.error || 'No se pudo crear la clave.' }); return; }
    setCreated({ name: data.name, key: data.key });
    setCopied(false);
    setName('');
    load();
  };

  const act = async (k: IntegrationKey, what: 'unbind' | 'revoke') => {
    const text = what === 'revoke'
      ? `¿Revocar la clave "${k.name}"? El worker que la usa dejará de sincronizar.`
      : `¿Desvincular la base de "${k.name}"? Hacelo solo si cambió la PC o se reinstaló Itegra: la clave se atará a la próxima base que la use.`;
    if (!window.confirm(text)) return;
    const res = await apiFetch(what === 'revoke' ? `/api/integrations/keys/${k.id}` : `/api/integrations/keys/${k.id}/unbind`, { method: what === 'revoke' ? 'DELETE' : 'POST' });
    if (!res.ok) setMessage({ ok: false, text: 'No se pudo completar la acción.' });
    load();
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  };

  const status = (k: IntegrationKey) => {
    if (k.revoked) return { label: 'Revocada', cls: 'bg-gray-100 text-gray-500' };
    if (!k.lastSeenAt) return { label: 'Sin usar todavía', cls: 'bg-yellow-100 text-yellow-800' };
    if (k.online) return { label: 'Conectada', cls: 'bg-green-100 text-green-800' };
    return { label: 'Sin señal', cls: 'bg-red-100 text-red-700' };
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-bold mb-1 text-gray-800">Integración con Itegra</h3>
        <p className="text-sm text-gray-600 mb-4">
          Un programa instalado en la PC donde corre Itegra (el <strong>worker</strong>) lee los artículos de la base y los sube solos a este negocio: <strong>código, nombre, precio y unidad</strong>.
          La <strong>categoría</strong> se asigna automáticamente la primera vez; la categoría, la foto, la etiqueta y el precio anterior que cargues acá <strong>no se pisan</strong>.
          Los artículos que dejan de existir en Itegra quedan sin stock (no se borran).
        </p>
        <ol className="text-sm text-gray-700 list-decimal pl-5 space-y-1 mb-5">
          <li>Generá una clave para esa PC (abajo). Cada clave pertenece <strong>solo a este negocio</strong>.</li>
          <li>Copiá el archivo de configuración que se muestra y guardalo como <code>worker.config.json</code> junto al worker.</li>
          <li>En la PC, ejecutá <code>node worker.js --previsualizar</code> para ver qué se cargaría y, si está bien, <code>node worker.js --aplicar</code>.</li>
          <li>Ejecutá <code>instalar-tarea.bat</code> como administrador: queda funcionando solo, cada pocos minutos.</li>
        </ol>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[14rem]">
            <label className="block text-sm text-gray-600 mb-1">Nombre de la clave</label>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} placeholder="Ej: PC del mostrador" maxLength={60} className="border p-2 rounded w-full" />
          </div>
          <button onClick={create} disabled={!name.trim()} className="bg-blue-600 text-white px-5 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">Generar clave</button>
        </div>
        {message && <p className={`mt-3 text-sm font-medium ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}
      </div>

      {created && (
        <div className="bg-amber-50 border border-amber-300 p-6 rounded-lg">
          <h4 className="font-bold text-amber-900 mb-1">Clave «{created.name}» creada</h4>
          <p className="text-sm text-amber-900 mb-3"><strong>Guardala ahora:</strong> no se vuelve a mostrar. Si la perdés, revocá esta y generá otra.</p>
          <pre className="bg-gray-900 text-green-300 text-xs p-4 rounded overflow-x-auto">{configText(created.key)}</pre>
          <div className="mt-3 flex gap-3 items-center">
            <button onClick={() => copy(configText(created.key))} className="px-4 py-2 bg-amber-600 text-white rounded font-medium hover:bg-amber-700">Copiar configuración</button>
            <button onClick={() => setCreated(null)} className="px-4 py-2 border rounded hover:bg-white">Ya la guardé</button>
            {copied && <span className="text-sm text-green-700">¡Copiado!</span>}
          </div>
          <p className="text-xs text-amber-800 mt-3">Ajustá <code>rutaBase</code> a la carpeta donde Itegra guarda su base (la que tiene <code>Datos.script</code>).</p>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="font-bold text-gray-800">Claves</h4>
        {keys.length === 0 && <p className="text-gray-500 text-sm">Todavía no generaste ninguna clave.</p>}
        {keys.map((k) => {
          const st = status(k);
          const s = k.lastSummary;
          return (
            <div key={k.id} className={`bg-white p-5 rounded-lg shadow-sm border border-gray-100 ${k.revoked ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-3">
                <h5 className="font-semibold text-gray-800">{k.name}</h5>
                <code className="text-xs text-gray-500">{k.prefix}…</code>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${st.cls}`}>{st.label}</span>
                {!k.revoked && (
                  <span className={`text-xs px-2 py-1 rounded ${k.linked ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {k.linked ? 'Atada a una base de Itegra' : 'Todavía sin base asociada'}
                  </span>
                )}
                <div className="ml-auto flex gap-2 text-sm">
                  {!k.revoked && k.linked && <button onClick={() => act(k, 'unbind')} className="px-3 py-1 border rounded hover:bg-gray-50">Desvincular base</button>}
                  {!k.revoked && <button onClick={() => act(k, 'revoke')} className="px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50">Revocar</button>}
                </div>
              </div>
              {!k.revoked && (
                <div className="text-sm text-gray-600 mt-3 space-y-1">
                  <div>Última señal: <strong>{ago(k.lastSeenAt)}</strong> · Última sincronización aplicada: <strong>{ago(k.lastSyncAt)}</strong></div>
                  {s && (
                    <div>
                      {s.mode === 'preview' ? 'Vista previa' : 'Último resultado'}: {s.total} artículos leídos — <strong>{s.created}</strong> nuevos, <strong>{s.updated}</strong> actualizados, {s.unchanged} sin cambios
                      {s.hidden > 0 && <>, <strong>{s.hidden}</strong> sin stock</>}{s.restored > 0 && <>, {s.restored} repuestos</>}{s.conflicts > 0 && <>, <span className="text-orange-600">{s.conflicts} omitidos (ya cargados a mano con ese código)</span></>}
                      {s.mode === 'preview' && <span className="text-orange-600"> · todavía no se aplicó</span>}
                    </div>
                  )}
                  {k.online === false && k.lastSeenAt && <div className="text-red-600">El worker no da señales hace rato: revisá que la PC de Itegra esté prendida y con internet.</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default IntegrationManager;
