import React, { useState } from 'react';
import { apiFetch } from '../api';

const Account = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const res = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setMessage({ ok: true, text: 'Contraseña actualizada.' });
      setCurrentPassword('');
      setNewPassword('');
    } else {
      setMessage({ ok: false, text: data?.error || 'No se pudo cambiar la contraseña' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md max-w-md">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Cambiar contraseña</h3>

      <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña actual</label>
      <input type="password" className="w-full border rounded p-2 mb-4" value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />

      <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña nueva (mínimo 8 caracteres)</label>
      <input type="password" className="w-full border rounded p-2 mb-4" value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />

      {message && <p className={`text-sm mb-4 ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}

      <button type="submit" disabled={!currentPassword || newPassword.length < 8}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
        Guardar
      </button>
    </form>
  );
};

export default Account;
