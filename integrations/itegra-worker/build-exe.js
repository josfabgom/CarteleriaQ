// Genera dist/worker.exe: el worker con Node incluido, para instalarlo en PCs que no tienen Node.js.
// Uso (en una PC con Node 20 o más nuevo y Windows):  node build-exe.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = __dirname;
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const run = (cmd, args) => {
  console.log('> ' + [cmd, ...args].join(' '));
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error('Falló el paso anterior.'); process.exit(1); }
};

// 1) Un solo archivo con el código del worker
run('npx', ['--yes', 'esbuild', 'worker.js', '--bundle', '--platform=node', '--target=node20', '--outfile=dist/bundle.js']);

// 2) Paquete "single executable" de Node
fs.writeFileSync(path.join(dist, 'sea-config.json'), JSON.stringify({ main: 'dist/bundle.js', output: 'dist/sea-prep.blob', disableExperimentalSEAWarning: true }));
run(`"${process.execPath}"`, ['--experimental-sea-config', 'dist/sea-config.json']);

// 3) Copia de node.exe con el paquete adentro
const exe = path.join(dist, 'worker.exe');
fs.copyFileSync(process.execPath, exe);
run('npx', ['--yes', 'postject', 'dist/worker.exe', 'NODE_SEA_BLOB', 'dist/sea-prep.blob', '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2']);

for (const f of ['bundle.js', 'sea-config.json', 'sea-prep.blob']) fs.rmSync(path.join(dist, f), { force: true });
console.log(`\nListo: ${exe} (${Math.round(fs.statSync(exe).size / 1048576)} MB)`);
