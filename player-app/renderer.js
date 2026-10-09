// Variables de Estado
let screenId = localStorage.getItem('screenId');
let screenToken = localStorage.getItem('screenToken'); // credencial de esta pantalla (la entrega el servidor al vincular)
let pairingCode = '';
let isPaired = !!screenId && !!screenToken; // sin token (instalación anterior) hay que volver a vincular

// Referencias del DOM
const mediaContainer = document.getElementById('media-container');
const priceContainer = document.getElementById('price-container');
const pairingContainer = document.createElement('div');
const priceListContainer = document.getElementById('price-list-container');

// Estilos dinámicos para el contenedor de emparejamiento
pairingContainer.style.position = 'absolute';
pairingContainer.style.top = '0';
pairingContainer.style.left = '0';
pairingContainer.style.width = '100vw';
pairingContainer.style.height = '100vh';
pairingContainer.style.backgroundColor = '#1e3a8a';
pairingContainer.style.color = '#fff';
pairingContainer.style.display = 'flex';
pairingContainer.style.flexDirection = 'column';
pairingContainer.style.alignItems = 'center';
pairingContainer.style.justifyContent = 'center';
pairingContainer.style.zIndex = '9999';
pairingContainer.style.fontFamily = 'sans-serif';
document.body.appendChild(pairingContainer);

// Orden: IP guardada > config.js (CARTELERIA_SERVER) > mismo origen del reproductor.
// En la app nativa (APK) no hay servidor en el origen, así que se pregunta al primer arranque.
const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const isLocalOrigin = window.location.protocol === 'file:' || /localhost|127\.0\.0\.1/.test(window.location.origin);
let serverIp = localStorage.getItem('serverIp')
  || (window.CARTELERIA_SERVER || '').trim()
  || (isNativeApp ? '' : (isLocalOrigin ? 'http://localhost:3000' : window.location.origin));

const API_BASE = () => serverIp;

let currentSyncData = null;
let carouselInterval = null;
let syncInterval = null; // id del timeout del bucle de sincronización

const SYNC_INTERVAL_MS = 10000;
const SYNC_TIMEOUT_MS = 8000;
const MAX_BACKOFF_MS = 60000;
const CONFIG_CACHE_KEY = 'lastConfig';

// Indicador discreto de "sin conexión" (el contenido sigue reproduciéndose)
const offlineBadge = document.createElement('div');
offlineBadge.textContent = 'Sin conexión · OK para cambiar servidor';
offlineBadge.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:9000;padding:4px 10px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font:0.8rem sans-serif;display:none;pointer-events:none';
document.body.appendChild(offlineBadge);
const setOffline = (offline) => { offlineBadge.style.display = offline ? 'block' : 'none'; };

// ---- Configuración del servidor (útil con control remoto: se escribe una sola vez) ----
let setupOpen = false;

function normalizeServerUrl(raw) {
  let v = raw.trim().replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
  const hostPart = v.replace(/^https?:\/\//i, '');
  if (/^http:/i.test(v) && !/:\d+$/.test(hostPart)) v += ':3000'; // puerto por defecto del backend
  return v;
}

async function testServer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${url}/api/health`, { signal: controller.signal, cache: 'no-store' });
    return res.ok;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Con el teclado en pantalla de la TV, el formulario debe quedar arriba para no quedar tapado
function setPairingLayout(top) {
  pairingContainer.style.justifyContent = top ? 'flex-start' : 'center';
  pairingContainer.style.paddingTop = top ? '4vh' : '0';
  pairingContainer.style.boxSizing = 'border-box';
}

function showServerSetup(message, canCancel) {
  setupOpen = true;
  pairingContainer.style.display = 'flex';
  setPairingLayout(true);
  pairingContainer.innerHTML = `
    <h1 style="font-size: 2.2rem; margin-bottom: 10px;">Conectar con el servidor</h1>
    <p style="font-size: 1.15rem; margin-bottom: 6px; color: #93c5fd; text-align: center; max-width: 800px;">
      Escribe la dirección IP de la PC donde corre Cartelería Q (ej. 192.168.1.10).<br>El puerto 3000 se agrega solo.
    </p>
    <p id="setup-msg" style="font-size: 1.1rem; min-height: 3.2em; margin-bottom: 10px; color: #fca5a5; text-align: center; max-width: 800px;"></p>
    <input id="server-input" type="text" inputmode="url" autocomplete="off" placeholder="192.168.1.10" style="padding: 14px; font-size: 1.8rem; width: 520px; max-width: 90vw; color: #000; border-radius: 10px; border: 3px solid transparent; text-align: center;" />
    <div style="margin-top: 16px; display: flex; gap: 16px;">
      <button id="server-connect" style="padding: 14px 36px; font-size: 1.5rem; border-radius: 10px; border: 3px solid transparent; cursor: pointer; color: #000;">Conectar</button>
      ${canCancel ? '<button id="server-cancel" style="padding: 14px 36px; font-size: 1.5rem; border-radius: 10px; border: 3px solid transparent; cursor: pointer; color: #000;">Cancelar</button>' : ''}
    </div>
  `;
  const input = document.getElementById('server-input');
  const msg = document.getElementById('setup-msg');
  const connectBtn = document.getElementById('server-connect');
  const cancelBtn = document.getElementById('server-cancel');
  msg.textContent = message || '';
  input.value = serverIp || '';

  // Resaltar el elemento enfocado (navegación con el D-pad del control)
  pairingContainer.querySelectorAll('input, button').forEach((el) => {
    el.addEventListener('focus', () => { el.style.borderColor = '#facc15'; });
    el.addEventListener('blur', () => { el.style.borderColor = 'transparent'; });
  });

  const connect = async () => {
    const url = normalizeServerUrl(input.value);
    if (!url) { msg.textContent = 'Escribe una dirección.'; return; }
    connectBtn.disabled = true;
    msg.style.color = '#93c5fd';
    msg.textContent = `Probando ${url}…`;
    if (await testServer(url)) {
      localStorage.setItem('serverIp', url);
      serverIp = url;
      setupOpen = false;
      setPairingLayout(false);
      if (syncInterval) clearTimeout(syncInterval);
      syncInterval = null;
      currentSyncData = null;
      pairingContainer.innerHTML = '';
      initPlayer();
    } else {
      connectBtn.disabled = false;
      msg.style.color = '#fca5a5';
      msg.textContent = `No se pudo conectar a ${url}. Revisa la IP, que el servidor esté encendido y que estén en la misma red.`;
      input.focus();
    }
  };

  connectBtn.onclick = connect;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); connect(); } });
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      setupOpen = false;
      setPairingLayout(false);
      pairingContainer.style.display = 'none';
    };
  }
  input.focus();
  input.select();
}

// Con el servidor caído, "OK" en el control abre la configuración (por si cambió la IP)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && offlineBadge.style.display === 'block' && !setupOpen) {
    showServerSetup('', true);
  }
});

// Última configuración recibida, para poder reproducir sin servidor
function saveCachedConfig(data) {
  try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(data)); } catch (e) { /* almacenamiento lleno o no disponible */ }
}
function loadCachedConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && data.id === screenId ? data : null;
  } catch (e) {
    return null;
  }
}

// Resultado: { status: 'ok', data } | { status: 'gone' } (401/404: pantalla borrada o sin acceso) | { status: 'error' } (red o servidor)
async function fetchSync() {
  // Un servidor inalcanzable puede no responder ni rechazar: sin límite la petición quedaría colgada
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE()}/api/screens/${screenId}/sync`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${screenToken}` }
    });
    // 401/404: la pantalla fue borrada o su token ya no vale -> hay que vincular de nuevo
    if (res.status === 401 || res.status === 404) return { status: 'gone' };
    if (!res.ok) return { status: 'error' };
    return { status: 'ok', data: await res.json() };
  } catch (e) {
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

// Bucle de sincronización: nunca desvincula por errores de red, solo si el servidor dice que la pantalla no existe
async function syncLoop(failures = 0) {
  const result = await fetchSync();

  if (result.status === 'gone') {
    console.error('La pantalla ya no existe en el servidor');
    setOffline(false);
    try { localStorage.removeItem(CONFIG_CACHE_KEY); } catch (e) {}
    return resetPlayer();
  }

  let nextFailures = 0;
  if (result.status === 'ok') {
    setOffline(false);
    if (!setupOpen) pairingContainer.style.display = 'none';
    if (JSON.stringify(result.data) !== JSON.stringify(currentSyncData)) {
      saveCachedConfig(result.data);
      startPlayer(result.data);
    }
    syncMediaCache(collectMediaUrls(result.data)); // también reintenta descargas pendientes
  } else {
    nextFailures = failures + 1;
    setOffline(true);
    // Primer arranque sin red: reproducir lo último guardado
    if (!currentSyncData && !setupOpen) {
      const cached = loadCachedConfig();
      if (cached) {
        pairingContainer.style.display = 'none';
        startPlayer(cached);
      } else {
        pairingContainer.style.display = 'flex';
        pairingContainer.innerHTML = '<h2 style="font-size:2rem">Sin conexión con el servidor. Reintentando…</h2>';
      }
    }
  }

  // Espera creciente (10s, 20s, 40s… hasta 60s) mientras no haya conexión
  const delay = nextFailures ? Math.min(SYNC_INTERVAL_MS * 2 ** (nextFailures - 1), MAX_BACKOFF_MS) : SYNC_INTERVAL_MS;
  syncInterval = setTimeout(() => syncLoop(nextFailures), delay);
}

function startSyncLoop() {
  if (syncInterval) clearTimeout(syncInterval);
  currentSyncData = null;
  // Reproducir de inmediato lo último guardado; el sync posterior solo lo reemplaza si cambió
  const cached = loadCachedConfig();
  if (cached && !setupOpen) {
    pairingContainer.style.display = 'none';
    startPlayer(cached);
  }
  syncLoop();
}

// Función para inicializar o mostrar pantalla de vinculación
async function initPlayer() {
  if (!serverIp) return showServerSetup();
  if (isPaired) {
    startSyncLoop();
  } else {
    // Solicitar código de vinculación al servidor
    try {
      const res = await fetch(`${API_BASE()}/api/screens/register`, { method: 'POST' });
      const data = await res.json();
      pairingCode = data.code;
      
      pairingContainer.innerHTML = `
        <h1 style="font-size: 3rem; margin-bottom: 20px;">Vincular esta Pantalla</h1>
        <p style="font-size: 1.5rem; margin-bottom: 40px; color: #93c5fd;">Ve al Panel de Gestión de Cartelería Q e ingresa este código:</p>
        <div style="background: #fff; color: #1e3a8a; font-size: 8rem; font-weight: bold; padding: 20px 60px; border-radius: 20px; letter-spacing: 15px;">
          ${pairingCode}
        </div>
      `;

      // Iniciar Polling cada 3 segundos para ver si el admin la vinculó
      const interval = setInterval(async () => {
        try {
          const check = await fetch(`${API_BASE()}/api/screens/check-pairing/${pairingCode}`);
          if (check.status === 404) {
            // El código expiró (se borra a la hora): pedir uno nuevo
            clearInterval(interval);
            return initPlayer();
          }
          if (check.ok) {
            const checkData = await check.json();
            if (checkData.linked) {
              clearInterval(interval);
              localStorage.setItem('screenId', checkData.screenId);
              localStorage.setItem('screenToken', checkData.token);
              screenId = checkData.screenId;
              screenToken = checkData.token;
              isPaired = true;
              pairingContainer.style.display = 'none';
              initPlayer(); // Recargar ya vinculada
            }
          }
        } catch (e) {
          // Sin red: se reintenta en el próximo ciclo
        }
      }, 3000);

    } catch (e) {
      showServerSetup('No se pudo conectar con el servidor.');
    }
  }
}

function resetPlayer() {
  localStorage.removeItem('screenId');
  localStorage.removeItem('screenToken');
  screenId = null;
  screenToken = null;
  isPaired = false;
  if (syncInterval) clearTimeout(syncInterval);
  syncInterval = null;
  if (carouselInterval) clearInterval(carouselInterval);
  carouselInterval = null;
  initPlayer(); // Reiniciar flujo
}

// ---- Medios sin conexión (Cache API) ----
// Cada imagen/video de la playlist se descarga a la caché del dispositivo y se reproduce desde ahí.
// Solo disponible en contextos seguros (app nativa, localhost, https); si no, se usa la red como antes.
const MEDIA_CACHE = 'carteleria-media-v1';
const CACHE_ENABLED = typeof caches !== 'undefined';
let blobUrls = [];
let mediaSyncRunning = false;

// Se cachea por ruta (/uploads/...) y no por servidor, así cambiar la IP no obliga a descargar todo otra vez
const cacheKey = (url) =>
  new URL(/^https?:/i.test(url) ? url : '/media-cache' + (url.startsWith('/') ? url : '/' + url), window.location.href).href;

// Pedir al navegador que no borre la caché si falta espacio
if (CACHE_ENABLED && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

const collectMediaUrls = (config) =>
  (config.playlist?.items || []).filter((i) => i.media).map((i) => i.media.url);

async function syncMediaCache(urls) {
  if (!CACHE_ENABLED || mediaSyncRunning) return;
  mediaSyncRunning = true;
  try {
    const cache = await caches.open(MEDIA_CACHE);

    // Descargar lo que falta (de a uno, para no saturar la red del local)
    for (const url of urls) {
      const key = cacheKey(url);
      if (await cache.match(key)) continue;
      try {
        const res = await fetch(getMediaUrl(url), { mode: 'cors', cache: 'no-store' });
        if (res.ok) await cache.put(key, res);
      } catch (e) {
        if (e && e.name === 'QuotaExceededError') {
          console.error('Sin espacio para guardar más medios');
          break;
        }
        // Sin red: se reintenta en el próximo sync
      }
    }

    // Borrar lo que ya no está en la playlist
    const wanted = new Set(urls.map(cacheKey));
    for (const req of await cache.keys()) {
      if (!wanted.has(req.url)) await cache.delete(req);
    }
  } catch (e) {
    console.error('Error sincronizando medios:', e);
  } finally {
    mediaSyncRunning = false;
  }
}

async function getCachedBlobUrl(url) {
  if (!CACHE_ENABLED) return null;
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const res = await cache.match(cacheKey(url));
    if (!res) return null;
    const blobUrl = URL.createObjectURL(await res.blob());
    blobUrls.push(blobUrl);
    return blobUrl;
  } catch (e) {
    return null;
  }
}

function revokeBlobUrls() {
  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls = [];
}

// Asigna el origen del medio: copia local si existe, red en caso contrario
async function attachMedia(el, url) {
  const cachedSrc = await getCachedBlobUrl(url);
  if (!el.isConnected) { // se volvió a renderizar mientras cargaba
    if (cachedSrc) URL.revokeObjectURL(cachedSrc);
    return;
  }
  const targets = el.tagName === 'DIV' ? [...el.querySelectorAll('img')] : [el];
  for (const t of targets) {
    t.src = cachedSrc || getMediaUrl(url);
    if (cachedSrc) {
      // Si la copia local falla, intentar por red
      t.addEventListener('error', () => { t.src = getMediaUrl(url); }, { once: true });
    }
  }
  if (el.tagName === 'VIDEO' && el.classList.contains('active')) el.play().catch(() => {});
}

function getMediaUrl(url) {
  if (url.startsWith('http')) return url;
  // Limpiar posible barra inicial doble para URLs locales
  let cleanUrl = url.startsWith('/') ? url : '/' + url;
  return `${API_BASE()}${cleanUrl}`;
}

// 9500 -> "$9.500"; 9500.5 -> "$9.500,50"
function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$' + value;
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const [int, dec] = fixed.split('.');
  return '$' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : '');
}

// Hace entrar la lista de precios en el alto de la pantalla: primero reduce el tamaño de letra
// (hasta 70%) y, si aun así no cabe (listas muy largas), la desplaza sola de arriba hacia abajo.
let listScrollTimer = null;
function fitPriceList() {
  if (listScrollTimer) { clearInterval(listScrollTimer); listScrollTimer = null; }
  priceListContainer.scrollTop = 0;

  let scale = 1;
  const root = document.documentElement;
  root.style.setProperty('--list-scale', scale);
  while (priceListContainer.scrollHeight > priceListContainer.clientHeight + 1 && scale > 0.7) {
    scale = Math.round((scale - 0.05) * 100) / 100;
    root.style.setProperty('--list-scale', scale);
  }

  if (priceListContainer.scrollHeight > priceListContainer.clientHeight + 1) {
    // Desplazamiento automático con pausa al principio y al final
    let pause = 0;
    let direction = 1;
    listScrollTimer = setInterval(() => {
      if (pause > 0) { pause--; return; }
      priceListContainer.scrollTop += direction;
      const atEnd = priceListContainer.scrollTop + priceListContainer.clientHeight >= priceListContainer.scrollHeight - 1;
      if (direction === 1 && atEnd) { pause = 100; direction = -1; }
      else if (direction === -1 && priceListContainer.scrollTop <= 0) { pause = 100; direction = 1; }
    }, 30);
  }
}

// Reajustar si cambia el tamaño de la ventana o terminan de cargar las fuentes
window.addEventListener('resize', () => fitPriceList());
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitPriceList());

function startPlayer(screenData) {
  currentSyncData = screenData;
  const playlistItems = screenData.playlist?.items || [];
  
  // Set layout and transition from screen
  document.body.className = `layout-${screenData.layout || 'split'} transition-${screenData.transition || 'fade'}`;
  
  const durationMs = (screenData.mediaDuration || 10) * 1000;

  // Encontrar la lista de precios y los medios
  const priceListItem = playlistItems.find(item => item.priceList);
  const mediaItems = playlistItems.filter(item => item.media);

  // Renderizar precios
  priceListContainer.innerHTML = '';
  if (priceListItem && priceListItem.priceList) {
    const headerTitle = document.querySelector('.header-precios');
    if (headerTitle) headerTitle.innerText = priceListItem.priceList.name || 'Menú de Hoy';

    const items = priceListItem.priceList.items || [];
    items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'price-item';
      const name = document.createElement('div');
      name.className = 'price-name';
      name.textContent = item.productName || item.name || '';
      const value = document.createElement('div');
      value.className = 'price-value';
      value.textContent = formatPrice(item.price);
      itemDiv.append(name, value);
      priceListContainer.appendChild(itemDiv);
    });
  }
  fitPriceList();

  // Detener el carrusel anterior si existía
  if (carouselInterval) {
    clearInterval(carouselInterval);
    carouselInterval = null;
  }

  // Renderizar Medios (Carrusel)
  revokeBlobUrls();
  mediaContainer.innerHTML = '';
  if (mediaItems.length > 0) {
    mediaItems.forEach((mItem, index) => {
      const media = mItem.media;
      let el;
      if (media.type === 'video' || media.url.match(/\.(mp4|webm|ogg)$/i)) {
        el = document.createElement('video');
        el.loop = true;
        el.muted = true;
      } else {
        // Imagen completa (contain) sobre una copia difuminada que rellena el resto del panel
        el = document.createElement('div');
        for (const cls of ['bg', 'fg']) {
          const img = document.createElement('img');
          img.className = cls;
          img.alt = '';
          el.appendChild(img);
        }
      }
      el.className = 'media-element';
      if (index === 0) el.classList.add('active');
      mediaContainer.appendChild(el);
      attachMedia(el, media.url);
    });

    if (mediaItems.length > 1) {
      let currentIndex = 0;
      const elements = document.querySelectorAll('.media-element');
      
      // Override transition duration if it's Zoom to match the mediaDuration for continuous zoom
      if (screenData.transition === 'zoom') {
        const style = document.createElement('style');
        style.id = 'dynamic-zoom-style';
        const existing = document.getElementById('dynamic-zoom-style');
        if(existing) existing.remove();
        style.innerHTML = `body.transition-zoom #media-container .media-element { transition: opacity 1s ease-in-out, transform ${durationMs/1000}s linear !important; }`;
        document.head.appendChild(style);
      }
      
      carouselInterval = setInterval(() => {
        elements[currentIndex].classList.remove('active');
        // Si era un video, pausarlo
        if (elements[currentIndex].tagName === 'VIDEO') elements[currentIndex].pause();
        
        currentIndex = (currentIndex + 1) % elements.length;
        
        elements[currentIndex].classList.add('active');
        // Si es un video, reproducirlo
        if (elements[currentIndex].tagName === 'VIDEO') elements[currentIndex].play().catch(e=>console.log(e));
      }, durationMs);
    } else {
       // Si solo hay un video, que se reproduzca
       const firstEl = document.querySelector('.media-element.active');
       if (firstEl && firstEl.tagName === 'VIDEO') firstEl.play().catch(e=>console.log(e));
    }
  } else {
    // Si no hay medios, mostrar algo por defecto para no dejar vacío
    mediaContainer.innerHTML = '<div class="media-element active" style="background:linear-gradient(135deg,#1e3a8a,#0f172a)"></div>';
  }
}

// Iniciar
initPlayer();
