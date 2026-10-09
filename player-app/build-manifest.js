// Genera manifest.json: versión (build) y hash SHA-256 de los archivos que se actualizan por aire.
// El build solo sube cuando cambia el contenido de esos archivos. Ejecutar siempre antes de desplegar
// o de compilar el APK (build-web.js y deploy/deploy-vps.sh lo hacen solos).
const fs = require('fs');
const crypto = require('crypto');

const OTA_FILES = ['renderer.js', 'player.css'];

const files = {};
for (const name of OTA_FILES) {
  const data = fs.readFileSync(name);
  files[name] = { sha256: crypto.createHash('sha256').update(data).digest('hex'), size: data.length };
}

let previous = null;
try { previous = JSON.parse(fs.readFileSync('manifest.json', 'utf8')); } catch { /* primera vez */ }

const unchanged = previous && OTA_FILES.every((n) => previous.files && previous.files[n] && previous.files[n].sha256 === files[n].sha256);
if (unchanged) {
  console.log(`manifest.json sin cambios (build ${previous.build}, ${previous.label})`);
  process.exit(0);
}

const now = new Date();
const build = Math.max(Math.floor(now.getTime() / 1000), ((previous && previous.build) || 0) + 1);
const label = now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
fs.writeFileSync('manifest.json', JSON.stringify({ build, label, files }, null, 2) + '\n');
console.log(`manifest.json actualizado: build ${build} (${label})`);
