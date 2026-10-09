// Copia los assets web a www/ (usado por Capacitor). Funciona en Windows/Linux/Mac.
const fs = require('fs');
fs.mkdirSync('www', { recursive: true });
for (const f of ['index.html', 'renderer.js']) fs.copyFileSync(f, `www/${f}`);
console.log('www/ actualizado');
