// Genera el ícono, el banner de Android TV y la pantalla de arranque a partir de un único diseño.
//   node branding/build-icons.js
// Usa Microsoft Edge o Google Chrome en modo headless para convertir SVG a PNG (sin dependencias de npm).
// Escribe en player-app/android/app/src/main/res/ y en web-dashboard/public/favicon.svg.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'player-app/android/app/src/main/res');

const BLUE_TOP = '#2a4fc4';
const BLUE_BOTTOM = '#13255c';
const BG_FLAT = '#1E3A8A'; // fondo del ícono adaptativo (values/ic_launcher_background.xml)

// ---------- Diseño ----------
// La marca: una pantalla con una imagen a la izquierda y una lista de precios a la derecha (el layout de la app).
// Coordenadas locales de 240 x 182.
const MARK = `
  <clipPath id="screen"><rect x="10" y="10" width="220" height="130" rx="7"/></clipPath>
  <linearGradient id="media" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#dc2626"/>
  </linearGradient>
  <rect x="0" y="0" width="240" height="150" rx="16" fill="#ffffff"/>
  <rect x="10" y="10" width="220" height="130" rx="7" fill="#0f172a"/>
  <g clip-path="url(#screen)">
    <rect x="10" y="10" width="132" height="130" fill="url(#media)"/>
    <circle cx="76" cy="76" r="38" fill="#ffffff" opacity="0.95"/>
    <circle cx="76" cy="76" r="27" fill="#fde68a"/>
    <circle cx="76" cy="76" r="14" fill="#f59e0b"/>
    <rect x="142" y="10" width="88" height="130" fill="#ffffff"/>
    <rect x="152" y="24" width="68" height="9" rx="4.5" fill="#1e293b"/>
    ${[48, 72, 96, 120].map((y) => `
    <rect x="152" y="${y}" width="36" height="8" rx="4" fill="#cbd5e1"/>
    <rect x="196" y="${y}" width="24" height="8" rx="4" fill="#16a34a"/>`).join('')}
  </g>
  <rect x="100" y="150" width="40" height="20" fill="#e2e8f0"/>
  <rect x="68" y="168" width="104" height="14" rx="7" fill="#e2e8f0"/>`;

const place = (size, scale) => {
  const w = 240 * scale;
  const h = 182 * scale;
  return `<g transform="translate(${(size - w) / 2} ${(size - h) / 2 - size * 0.01}) scale(${scale})">${MARK}</g>`;
};

const gradientBg = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BLUE_TOP}"/><stop offset="1" stop-color="${BLUE_BOTTOM}"/></linearGradient>`;

// Ícono completo (512): se recorta como cuadrado redondeado o círculo
const fullIcon = (shape) => {
  const clip = shape === 'circle'
    ? '<circle cx="256" cy="256" r="256"/>'
    : shape === 'square' ? '<rect width="512" height="512"/>' : '<rect width="512" height="512" rx="112"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>${gradientBg('bg')}<clipPath id="shape">${clip}</clipPath></defs>
  <g clip-path="url(#shape)"><rect width="512" height="512" fill="url(#bg)"/>${place(512, shape === 'circle' ? 1.45 : 1.62)}</g>
</svg>`;
};

// Primer plano del ícono adaptativo (432 = 108dp @ xxxhdpi), transparente; el contenido debe caber en el círculo central de 66dp
const foreground = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 432" width="432" height="432">
  <defs>${MARK.includes('<clipPath') ? '' : ''}</defs>${place(432, 0.9)}
</svg>`;

// Banner de Android TV (320x180 dp). Debe incluir el nombre de la app.
const banner = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>${gradientBg('bg')}</defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <g transform="translate(34 92) scale(1.0)">${MARK}</g>
  <text x="292" y="178" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="48" font-weight="800" fill="#ffffff" letter-spacing="-1">Cartelería<tspan fill="#fbbf24">Q</tspan></text>
  <text x="294" y="220" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="26" fill="#93c5fd">Cartelería digital</text>
</svg>`;

// Pantalla de arranque (Android < 12): fondo azul con el ícono centrado
const splash = (w, h) => {
  const size = Math.min(w, h) * 0.34;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${BG_FLAT}"/>
  <g transform="translate(${(w - size) / 2} ${(h - size) / 2 - h * 0.04}) scale(${size / 240})">${MARK}</g>
  <text x="${w / 2}" y="${(h + size) / 2 + h * 0.07}" text-anchor="middle" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="${Math.round(size * 0.2)}" font-weight="800" fill="#ffffff">Cartelería<tspan fill="#fbbf24">Q</tspan></text>
</svg>`;
};

// ---------- Conversión SVG -> PNG con Edge/Chrome headless ----------
// Una sola página en el navegador dibuja cada SVG en un <canvas> (cualquier tamaño, con transparencia)
// y envía los PNG por POST a un servidor local mínimo que los guarda.
const http = require('http');
const { spawn, execSync } = require('child_process');

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const browser = BROWSERS.find((b) => fs.existsSync(b));
if (!browser) { console.error('Hace falta Microsoft Edge o Google Chrome (o definir la variable BROWSER).'); process.exit(1); }

const jobs = []; // { file, width, height, svg }
const toPng = (svg, width, height, file) => jobs.push({ svg, width, height, file });

async function renderAll() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
  let saved = 0;
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/jobs') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(jobs.map(({ svg, width, height }) => ({ svg, width, height }))));
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const m = req.url.match(/^\/png\/(\d+)$/);
      if (m) {
        const job = jobs[Number(m[1])];
        fs.mkdirSync(path.dirname(job.file), { recursive: true });
        fs.writeFileSync(job.file, Buffer.from(Buffer.concat(chunks).toString(), 'base64'));
        saved++;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end('ok');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const page = `<!doctype html><meta charset="utf-8"><body>generando…<script>
    const base = 'http://127.0.0.1:${port}';
    (async () => {
      const jobs = await (await fetch(base + '/jobs')).json();
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        const img = new Image();
        await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(j.svg))); });
        const c = document.createElement('canvas'); c.width = j.width; c.height = j.height;
        const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, j.width, j.height);
        await fetch(base + '/png/' + i, { method: 'POST', body: c.toDataURL('image/png').split(',')[1] });
      }
      await fetch(base + '/done', { method: 'POST', body: '' });
    })();
  </script>`;
  const pageFile = path.join(tmp, 'render.html');
  fs.writeFileSync(pageFile, page);

  const done = new Promise((resolve, reject) => {
    const original = server.listeners('request')[0];
    server.removeAllListeners('request');
    server.on('request', (req, res) => { if (req.url === '/done') { res.setHeader('Access-Control-Allow-Origin', '*'); res.end('ok'); resolve(); } else original(req, res); });
    setTimeout(() => reject(new Error('Tiempo agotado generando los íconos')), 120000);
  });

  const child = spawn(browser, ['--headless=new', '--disable-gpu', `--user-data-dir=${path.join(tmp, 'profile')}`,
    '--no-first-run', '--allow-file-access-from-files', 'file:///' + pageFile.split(path.sep).join('/')], { stdio: 'ignore' });
  try { await done; } finally {
    try { if (process.platform === 'win32') execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }); else child.kill(); } catch { /* ya cerrado */ }
    server.close();
  }
  if (saved !== jobs.length) throw new Error(`Se generaron ${saved} de ${jobs.length} imágenes`);
}

// ---------- Salidas ----------
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [d, f] of Object.entries(densities)) {
  const legacy = Math.round(48 * f);
  const adaptive = Math.round(108 * f);
  toPng(fullIcon('rounded'), legacy, legacy, path.join(RES, `mipmap-${d}/ic_launcher.png`));
  toPng(fullIcon('circle'), legacy, legacy, path.join(RES, `mipmap-${d}/ic_launcher_round.png`));
  toPng(foreground(), adaptive, adaptive, path.join(RES, `mipmap-${d}/ic_launcher_foreground.png`));
}

// Banner de Android TV (320x180 dp)
for (const [d, f] of Object.entries({ mdpi: 1, xhdpi: 2 })) {
  toPng(banner(), 320 * f, 180 * f, path.join(RES, `drawable-${d}/tv_banner.png`));
}

// Pantalla de arranque: se regenera cada splash.png existente con su mismo tamaño
for (const dir of fs.readdirSync(RES).filter((n) => n.startsWith('drawable') && fs.existsSync(path.join(RES, n, 'splash.png')))) {
  const file = path.join(RES, dir, 'splash.png');
  const header = fs.readFileSync(file).subarray(0, 24);
  const w = header.readUInt32BE(16);
  const h = header.readUInt32BE(20);
  toPng(splash(w, h), w, h, file);
}

(async () => {
  await renderAll();

  // Color de fondo del ícono adaptativo
  fs.writeFileSync(path.join(RES, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG_FLAT}</color>
</resources>
`);

  // Fuentes vectoriales de referencia y favicon del panel
  fs.writeFileSync(path.join(__dirname, 'icon.svg'), fullIcon('rounded'));
  fs.writeFileSync(path.join(__dirname, 'banner.svg'), banner());
  fs.writeFileSync(path.join(ROOT, 'web-dashboard/public/favicon.svg'), fullIcon('rounded'));

  console.log(`Íconos generados (${jobs.length} imágenes) con`, path.basename(browser));
})().catch((e) => { console.error(e.message); process.exit(1); });
