import React, { useEffect, useState } from 'react';
import { apiFetch, formatBytes } from '../api';

interface Business {
  id: string;
  name: string;
  active: boolean;
  username: string | null;
  maxScreens: number;
  storageLimitMb: number;
  screens: number;
  storageUsedBytes: number;
  createdAt: string;
}

const emptyForm = { name: '', username: '', password: '', maxScreens: 3, storageLimitMb: 1024 };

// Genera una contraseña legible para entregar al cliente
const generatePassword = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

const Bar = ({ used, total, danger }: { used: number; total: number; danger?: boolean }) => {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="h-2 bg-gray-200 rounded">
      <div className={`h-2 rounded ${danger || pct >= 90 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

const BusinessManager = () => {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [editing, setEditing] = useState<Business | null>(null);
  const [editForm, setEditForm] = useState({ name: '', maxScreens: 3, storageLimitMb: 1024, password: '' });

  const load = async () => {
    const res = await apiFetch('/api/admin/businesses');
    if (res.ok) setBusinesses(await res.json());
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setCreated(null);
    const res = await apiFetch('/api/admin/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage({ ok: false, text: data?.error || 'No se pudo crear el negocio' });
      return;
    }
    setCreated({ username: form.username.trim().toLowerCase(), password: form.password });
    setForm(emptyForm);
    load();
  };

  const startEdit = (b: Business) => {
    setEditing(b);
    setEditForm({ name: b.name, maxScreens: b.maxScreens, storageLimitMb: b.storageLimitMb, password: '' });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const body: Record<string, unknown> = {
      name: editForm.name,
      maxScreens: editForm.maxScreens,
      storageLimitMb: editForm.storageLimitMb
    };
    if (editForm.password) body.password = editForm.password;
    const res = await apiFetch(`/api/admin/businesses/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage({ ok: false, text: data?.error || 'No se pudo guardar' });
      return;
    }
    setMessage({ ok: true, text: editForm.password ? 'Cambios guardados y contraseña actualizada.' : 'Cambios guardados.' });
    setEditing(null);
    load();
  };

  const toggleActive = async (b: Business) => {
    await apiFetch(`/api/admin/businesses/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !b.active })
    });
    load();
  };

  const handleDelete = async (b: Business) => {
    const typed = window.prompt(
      `Se borrarán el negocio "${b.name}", su usuario, pantallas, listas, productos y archivos. Esta acción no se puede deshacer.\n\nEscribí el nombre del negocio para confirmar:`
    );
    if (typed !== b.name) return;
    const res = await apiFetch(`/api/admin/businesses/${b.id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Nuevo negocio</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del negocio</label>
            <input className="w-full border rounded p-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input className="w-full border rounded p-2" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña (mín. 8)</label>
            <div className="flex gap-2">
              <input className="w-full border rounded p-2 font-mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="off" />
              <button type="button" onClick={() => setForm({ ...form, password: generatePassword() })}
                className="px-3 border rounded text-sm hover:bg-gray-50 whitespace-nowrap">Generar</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Máximo de pantallas</label>
            <input type="number" min={1} className="w-full border rounded p-2" value={form.maxScreens}
              onChange={(e) => setForm({ ...form, maxScreens: Number(e.target.value) })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Almacenamiento (MB)</label>
            <input type="number" min={1} className="w-full border rounded p-2" value={form.storageLimitMb}
              onChange={(e) => setForm({ ...form, storageLimitMb: Number(e.target.value) })} />
          </div>
        </div>

        <button type="submit" disabled={!form.name.trim() || !form.username.trim() || form.password.length < 8}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
          Crear negocio
        </button>

        {message && <p className={`text-sm mt-3 ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}
        {created && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded text-sm">
            <p className="font-medium text-green-800">Negocio creado. Entregá estos datos al cliente (la contraseña no se vuelve a mostrar):</p>
            <p className="mt-2 font-mono">Usuario: {created.username}</p>
            <p className="font-mono">Contraseña: {created.password}</p>
          </div>
        )}
      </form>

      <div className="space-y-4">
        <h3 className="text-xl font-bold text-gray-800">Negocios ({businesses.length})</h3>
        {businesses.length === 0 && <p className="text-gray-500">Todavía no hay negocios.</p>}

        {businesses.map((b) => (
          <div key={b.id} className={`bg-white p-5 rounded-lg shadow-sm border ${b.active ? 'border-gray-100' : 'border-red-200 bg-red-50'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-800">
                  {b.name}
                  {!b.active && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Suspendido</span>}
                </h4>
                <p className="text-sm text-gray-500">Usuario: <span className="font-mono">{b.username}</span></p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <button onClick={() => startEdit(b)} className="px-3 py-1 border rounded hover:bg-gray-50">Editar</button>
                <button onClick={() => toggleActive(b)} className="px-3 py-1 border rounded hover:bg-gray-50">
                  {b.active ? 'Suspender' : 'Reactivar'}
                </button>
                <button onClick={() => handleDelete(b)} className="px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50">Eliminar</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Pantallas</span><span>{b.screens} / {b.maxScreens}</span>
                </div>
                <Bar used={b.screens} total={b.maxScreens} />
              </div>
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Almacenamiento</span><span>{formatBytes(b.storageUsedBytes)} / {formatBytes(b.storageLimitMb * 1024 * 1024)}</span>
                </div>
                <Bar used={b.storageUsedBytes} total={b.storageLimitMb * 1024 * 1024} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveEdit} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Editar {editing.name}</h3>

            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input className="w-full border rounded p-2 mb-3" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Máx. pantallas</label>
                <input type="number" min={1} className="w-full border rounded p-2" value={editForm.maxScreens}
                  onChange={(e) => setEditForm({ ...editForm, maxScreens: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Espacio (MB)</label>
                <input type="number" min={1} className="w-full border rounded p-2" value={editForm.storageLimitMb}
                  onChange={(e) => setEditForm({ ...editForm, storageLimitMb: Number(e.target.value) })} />
              </div>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña (opcional)</label>
            <div className="flex gap-2 mb-4">
              <input className="w-full border rounded p-2 font-mono" value={editForm.password} autoComplete="off"
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Dejar vacío para no cambiarla" />
              <button type="button" onClick={() => setEditForm({ ...editForm, password: generatePassword() })}
                className="px-3 border rounded text-sm hover:bg-gray-50 whitespace-nowrap">Generar</button>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={!!editForm.password && editForm.password.length < 8}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default BusinessManager;
