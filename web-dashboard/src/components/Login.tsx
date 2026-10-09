import React, { useState } from 'react';
import { API_URL } from '../config';
import { Me, setToken } from '../api';

interface Props {
  onLogin: (me: Me) => void;
}

const Login = ({ onLogin }: Props) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'No se pudo iniciar sesión');
        return;
      }
      setToken(data.token);
      onLogin({ username: data.username, role: data.role, business: data.business });
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-sm rounded-lg shadow-xl p-8">
        <h1 className="text-2xl font-bold text-gray-800 text-center">Cartelería Q</h1>
        <p className="text-gray-500 text-sm text-center mb-6">Ingresá a tu panel de gestión</p>

        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="username">Usuario</label>
        <input
          id="username"
          className="w-full border rounded p-2 mb-4"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
        />

        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          className="w-full border rounded p-2 mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full bg-blue-600 text-white font-medium py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
};

export default Login;
