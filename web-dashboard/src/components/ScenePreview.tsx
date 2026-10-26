import React, { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';

// Vista previa: el reproductor real de la TV (/player?preview=1) dentro de un cuadro 16:9.
// El panel le manda las escenas ya armadas por el servidor y recibe cuál se está mostrando.

interface PreviewScene { id: string; type: string; name: string | null; duration: number; title?: string }
interface PreviewData { title?: string; cycleName?: string | null; transition: string; mediaDuration: number; scenes: PreviewScene[] }

const TYPE: Record<string, { icon: string; label: string }> = {
  prices: { icon: '💲', label: 'Precios' },
  offers: { icon: '🔥', label: 'Ofertas' },
  media: { icon: '🖼️', label: 'Imagen / video' },
  text: { icon: '📝', label: 'Anuncio' },
  board: { icon: '📺', label: 'Cartelera completa' }
};

const playerUrl = `${API_URL}/player/index.html?preview=1`;
const playerOrigin = (() => {
  try { return new URL(API_URL || window.location.origin, window.location.href).origin; } catch { return window.location.origin; }
})();

interface Props {
  title: string;
  /** Pide al servidor lo que recibiría la TV (pantalla, ciclo guardado o escenas sin guardar) */
  loader: () => Promise<Response>;
  /** Escena con la que empieza */
  startIndex?: number;
  onClose: () => void;
}

const ScenePreview = ({ title, loader, startIndex = 0, onClose }: Props) => {
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(-1);
  const [paused, setPaused] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);
  const loaderRef = useRef(loader);

  useEffect(() => {
    let cancelled = false;
    loaderRef.current()
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && body) setData(body);
        else setError(body?.error || 'No se pudo generar la vista previa.');
      })
      .catch(() => { if (!cancelled) setError('No se pudo conectar con el servidor.'); });
    return () => { cancelled = true; };
  }, []);

  // Mensajes del reproductor: listo / escena que se está mostrando
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      if (ev.data?.type === 'preview:ready') setReady(true);
      else if (ev.data?.type === 'preview:scene') setActive(ev.data.index);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const send = (msg: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage(msg, playerOrigin);

  // Entregar el contenido una sola vez, cuando el reproductor y los datos están listos
  useEffect(() => {
    if (ready && data && !loadedRef.current) {
      loadedRef.current = true;
      send({ type: 'preview:load', data, index: startIndex });
    }
  }, [ready, data, startIndex]);

  const toggle = () => { send({ type: paused ? 'preview:play' : 'preview:pause' }); setPaused(!paused); };
  const fullscreen = () => { stageRef.current?.requestFullscreen?.().catch(() => undefined); };
  const sceneLabel = (s: PreviewScene) => s.name || (s.title ? s.title : TYPE[s.type]?.label) || 'Escena';
  const total = data?.scenes.length ?? 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800 text-lg truncate">{title}</h3>
            <p className="text-xs text-gray-500">
              Así se ve en la TV (16:9){data?.cycleName ? ` · Ciclo: ${data.cycleName}` : ''}. Los videos se ven sin sonido.
            </p>
          </div>
          <button onClick={onClose} className="ml-auto px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">Cerrar</button>
        </div>

        <div className="p-4 space-y-4">
          <div ref={stageRef} className="relative w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              ref={iframeRef}
              src={playerUrl}
              title="Vista previa de la pantalla"
              className="absolute inset-0 w-full h-full border-0"
              onLoad={() => setTimeout(() => setReady(true), 600)}
            />
            {!data && !error && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm pointer-events-none">Cargando vista previa…</div>}
            {error && <div className="absolute inset-0 flex items-center justify-center text-red-300 text-sm p-6 text-center">{error}</div>}
          </div>

          {data && total === 0 && (
            <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-3">
              No hay escenas con contenido para mostrar hoy. La TV muestra el fondo de espera.
            </p>
          )}

          {total > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => send({ type: 'preview:prev' })} className="px-3 py-1.5 border rounded hover:bg-gray-50" title="Escena anterior">⏮</button>
                <button onClick={toggle} className="px-4 py-1.5 border rounded hover:bg-gray-50 font-medium w-28">{paused ? '▶ Continuar' : '⏸ Pausar'}</button>
                <button onClick={() => send({ type: 'preview:next' })} className="px-3 py-1.5 border rounded hover:bg-gray-50" title="Escena siguiente">⏭</button>
                <span className="text-sm text-gray-600 ml-2">{active >= 0 ? `Escena ${active + 1} de ${total}` : `${total} escena(s)`}</span>
                <button onClick={fullscreen} className="ml-auto px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">⛶ Pantalla completa</button>
              </div>

              <div className="flex flex-wrap gap-2">
                {data!.scenes.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => { send({ type: 'preview:goto', index: i }); setPaused(false); }}
                    className={`text-left px-3 py-2 rounded-lg border text-sm ${active === i ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className="font-medium text-gray-800">{i + 1}. {TYPE[s.type]?.icon} {sceneLabel(s)}</div>
                    <div className="text-xs text-gray-500">{TYPE[s.type]?.label} · {s.duration} s</div>
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="text-xs text-gray-500">
            La vista previa usa la versión más reciente del reproductor. Una TV puede tardar unos minutos en actualizarse sola.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ScenePreview;
