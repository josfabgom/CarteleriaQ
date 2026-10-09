// Cargador del reproductor y actualizador por aire (OTA).
//
// IMPORTANTE: este archivo viaja dentro del APK y NO se actualiza por aire. Mantenerlo mínimo y estable:
// cada cambio acá exige reinstalar el APK en las TVs.
//
// Qué hace:
//  1. Elige qué versión de player.css + renderer.js ejecutar: la descargada del servidor (si es más nueva
//     que la del APK, está íntegra y no fue descartada) o la que trae el APK.
//  2. En la app nativa, consulta al servidor si hay una versión más nueva, la descarga, verifica su hash
//     SHA-256 y reinicia con ella.
//  3. Si una versión nueva falla al arrancar (error o cuelgue) dos veces, la descarta y vuelve a la del APK.
(function () {
  'use strict';

  var OTA_CACHE = 'ota-v1';
  var STATE_KEY = 'ota.state'; // { build, status: 'trying' | 'ok' | 'failed', fails }
  var BAD_KEY = 'ota.bad'; // builds descartados por fallar
  var MAX_FAILS = 2;
  var CONFIRM_TIMEOUT_MS = 30000; // la app debe confirmar que arrancó bien dentro de este plazo
  var FIRST_CHECK_MS = 20000;
  var CHECK_EVERY_MS = 10 * 60 * 1000;
  var FETCH_TIMEOUT_MS = 15000;

  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  // Solo para pruebas en un navegador: localStorage.setItem('otaForce', '1')
  try { if (localStorage.getItem('otaForce') === '1') isNative = true; } catch (e) { /* sin almacenamiento */ }

  var store = {
    get: function (key, fallback) {
      try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* almacenamiento lleno o no disponible */ }
    }
  };

  function toHex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function sha256(buffer) {
    return crypto.subtle.digest('SHA-256', buffer).then(toHex);
  }
  function timeoutSignal(ms) {
    var controller = new AbortController();
    setTimeout(function () { controller.abort(); }, ms);
    return controller.signal;
  }

  // Versión activa, visible para el reproductor (se muestra en pantalla y se informa al servidor)
  var active = { build: 0, label: 'sin versión', source: 'apk' };
  var confirmed = false;
  var otaBuild = null; // build de la versión OTA en ejecución (null si corre la del APK)

  window.__otaInfo = active;
  window.__otaConfirm = function () {
    confirmed = true;
    if (otaBuild !== null) store.set(STATE_KEY, { build: otaBuild, status: 'ok', fails: 0 });
  };

  function markBad(build) {
    var bad = store.get(BAD_KEY, []);
    if (bad.indexOf(build) === -1) bad.push(build);
    store.set(BAD_KEY, bad.slice(-20));
  }

  // Lee la versión OTA guardada. Devuelve { manifest, js, css } o null si no corresponde usarla.
  function readOta(bundledBuild) {
    if (!isNative || !('caches' in window) || !window.crypto || !crypto.subtle) return Promise.resolve(null);
    var cache;
    return caches.open(OTA_CACHE).then(function (c) {
      cache = c;
      return cache.match('/ota/manifest.json');
    }).then(function (res) {
      if (!res) return null;
      return res.json().then(function (manifest) {
        var bad = store.get(BAD_KEY, []);
        if (!(manifest.build > bundledBuild) || bad.indexOf(manifest.build) !== -1) return null;

        // Leer y verificar la integridad de los archivos guardados
        var names = Object.keys(manifest.files);
        return Promise.all(names.map(function (name) {
          return cache.match('/ota/' + name).then(function (r) { return r ? r.arrayBuffer() : null; });
        })).then(function (buffers) {
          var texts = {};
          var checks = names.map(function (name, i) {
            if (!buffers[i]) return Promise.resolve(false);
            return sha256(buffers[i]).then(function (hash) {
              if (hash !== manifest.files[name].sha256) return false;
              texts[name] = new TextDecoder().decode(buffers[i]);
              return true;
            });
          });
          return Promise.all(checks).then(function (oks) {
            if (!oks.every(Boolean) || texts['renderer.js'] === undefined || texts['player.css'] === undefined) return null;

            // Control de fallos: un arranque que nunca confirmó cuenta como fallo
            var state = store.get(STATE_KEY, null);
            var fails = 0;
            if (state && state.build === manifest.build) {
              fails = state.fails || 0;
              if (state.status === 'trying') fails++;
            }
            if (fails >= MAX_FAILS) {
              markBad(manifest.build);
              return null;
            }
            store.set(STATE_KEY, { build: manifest.build, status: 'trying', fails: fails });
            return { manifest: manifest, js: texts['renderer.js'], css: texts['player.css'], fails: fails };
          });
        });
      });
    }).catch(function () { return null; });
  }

  function loadCss(text) {
    if (text !== null) {
      var style = document.createElement('style');
      style.id = 'player-css';
      style.textContent = text;
      document.head.appendChild(style);
    } else {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './player.css';
      document.head.appendChild(link);
    }
  }

  function loadJs(text) {
    var script = document.createElement('script');
    if (text !== null) script.textContent = text;
    else script.src = './renderer.js';
    document.body.appendChild(script);
  }

  // Si la versión OTA falla antes de confirmar, se cuenta el fallo y se reinicia (a la 2.ª vuelve a la del APK)
  function guardOta(fails) {
    function fail() {
      if (confirmed || otaBuild === null) return;
      confirmed = true; // evita contar el mismo fallo dos veces
      store.set(STATE_KEY, { build: otaBuild, status: 'failed', fails: fails + 1 });
      location.reload();
    }
    window.addEventListener('error', fail);
    setTimeout(fail, CONFIRM_TIMEOUT_MS);
  }

  // ---- Actualización: descargar, verificar y reiniciar ----
  var updating = false;
  function checkForUpdate() {
    if (!isNative || updating || !('caches' in window) || !window.crypto || !crypto.subtle) return;
    if (window.__playerBusy && window.__playerBusy()) return; // no reiniciar si alguien está escribiendo en la TV
    var server = '';
    try { server = (localStorage.getItem('serverIp') || window.CARTELERIA_SERVER || '').replace(/\/+$/, ''); } catch (e) { /* */ }
    if (!server) return;

    updating = true;
    fetch(server + '/player/manifest.json', { cache: 'no-store', signal: timeoutSignal(FETCH_TIMEOUT_MS) })
      .then(function (res) { if (!res.ok) throw new Error('manifest ' + res.status); return res.json(); })
      .then(function (manifest) {
        var bad = store.get(BAD_KEY, []);
        if (!(manifest.build > active.build) || bad.indexOf(manifest.build) !== -1) return null;

        var names = Object.keys(manifest.files);
        return Promise.all(names.map(function (name) {
          return fetch(server + '/player/' + name, { cache: 'no-store', signal: timeoutSignal(FETCH_TIMEOUT_MS) })
            .then(function (r) { if (!r.ok) throw new Error(name + ' ' + r.status); return r.arrayBuffer(); })
            .then(function (buffer) {
              return sha256(buffer).then(function (hash) {
                if (hash !== manifest.files[name].sha256) throw new Error('hash distinto en ' + name);
                return buffer;
              });
            });
        })).then(function (buffers) {
          return caches.open(OTA_CACHE).then(function (cache) {
            // Primero los archivos y al final el manifiesto: si se corta a medias, queda la versión anterior
            return Promise.all(names.map(function (name, i) { return cache.put('/ota/' + name, new Response(buffers[i])); }))
              .then(function () { return cache.put('/ota/manifest.json', new Response(JSON.stringify(manifest))); });
          });
        }).then(function () {
          console.log('Reproductor actualizado a ' + manifest.label + ', reiniciando');
          location.reload();
          return true;
        });
      })
      .catch(function (err) { console.log('Sin actualización: ' + (err && err.message)); })
      .then(function () { updating = false; });
  }

  // ---- Arranque ----
  function start(bundledBuild, bundledLabel) {
    active.build = bundledBuild;
    active.label = bundledLabel;
    active.source = 'apk';

    readOta(bundledBuild).then(function (ota) {
      if (ota) {
        otaBuild = ota.manifest.build;
        active.build = ota.manifest.build;
        active.label = ota.manifest.label;
        active.source = 'ota';
        guardOta(ota.fails); // antes de ejecutar: un error inmediato también debe detectarse
        loadCss(ota.css);
        loadJs(ota.js);
      } else {
        loadCss(null);
        loadJs(null);
      }
      if (isNative) {
        setTimeout(checkForUpdate, FIRST_CHECK_MS);
        setInterval(checkForUpdate, CHECK_EVERY_MS);
        window.addEventListener('online', function () { setTimeout(checkForUpdate, 3000); });
      }
    });
  }

  // La versión que trae el APK está en ./manifest.json (solo se lee en la app nativa)
  if (isNative) {
    fetch('./manifest.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (m) { start(m.build || 0, m.label || 'apk'); })
      .catch(function () { start(0, 'apk'); });
  } else {
    start(0, 'web');
  }
})();
