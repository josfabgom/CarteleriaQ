// Copia los assets web a www/ (usado por Capacitor). Funciona en Windows/Linux/Mac.
// Para fijar el servidor en el APK sin tocar config.js:  CARTELERIA_SERVER=https://mi.dominio node build-web.js
const fs = require('fs');
fs.mkdirSync('www', { recursive: true });
for (const f of ['index.html', 'renderer.js', 'config.js']) fs.copyFileSync(f, `www/${f}`);

const server = (process.env.CARTELERIA_SERVER || '').trim().replace(/\/+$/, '');
if (server) {
  fs.writeFileSync('www/config.js', `window.CARTELERIA_SERVER = ${JSON.stringify(server)};\n`);
  console.log(`www/ actualizado (servidor: ${server})`);
} else {
  console.log('www/ actualizado (el servidor se pregunta al primer arranque)');
}
