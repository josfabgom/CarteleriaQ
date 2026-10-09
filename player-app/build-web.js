// Prepara www/ (lo que empaqueta Capacitor en el APK). Funciona en Windows/Linux/Mac.
// Para fijar el servidor en el APK sin tocar config.js:  CARTELERIA_SERVER=https://mi.dominio node build-web.js
const fs = require('fs');
const { execFileSync } = require('child_process');

// La versión que viaja en el APK (manifest.json) debe corresponder a los archivos que se empaquetan
execFileSync(process.execPath, ['build-manifest.js'], { stdio: 'inherit' });

fs.mkdirSync('www', { recursive: true });
for (const f of ['index.html', 'boot.js', 'renderer.js', 'player.css', 'config.js', 'manifest.json']) {
  fs.copyFileSync(f, `www/${f}`);
}

const server = (process.env.CARTELERIA_SERVER || '').trim().replace(/\/+$/, '');
if (server) {
  fs.writeFileSync('www/config.js', `window.CARTELERIA_SERVER = ${JSON.stringify(server)};\n`);
  console.log(`www/ actualizado (servidor: ${server})`);
} else {
  console.log('www/ actualizado (el servidor se pregunta al primer arranque)');
}
