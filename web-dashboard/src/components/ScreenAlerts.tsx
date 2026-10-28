import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

interface DownScreen { id: string; name: string; location: string | null; minutes: number; neverConnected: boolean }

export const fmtOffline = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} días`;
};

// Aviso en todas las pestañas cuando una pantalla deja de dar señal
const ScreenAlerts = ({ onOpen }: { onOpen: () => void }) => {
  const [down, setDown] = useState<DownScreen[]>([]);
  const [threshold, setThreshold] = useState(10);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await apiFetch('/api/screens/alerts');
        if (!res.ok || !alive) return;
        const data = await res.json();
        setDown(data.down);
        setThreshold(data.thresholdMinutes);
      } catch { /* sin conexión con el servidor: se reintenta */ }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (down.length === 0) return null;
  return (
    <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold">
          ⚠ {down.length === 1 ? '1 pantalla sin señal' : `${down.length} pantallas sin señal`} <span className="font-normal text-red-600">(más de {threshold} min)</span>
        </p>
        <button onClick={onOpen} className="text-sm underline whitespace-nowrap">Ver pantallas</button>
      </div>
      <ul className="mt-2 text-sm space-y-0.5">
        {down.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong>{s.location ? ` · ${s.location}` : ''} — {s.neverConnected ? 'nunca se conectó' : `sin señal hace ${fmtOffline(s.minutes)}`}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ScreenAlerts;
