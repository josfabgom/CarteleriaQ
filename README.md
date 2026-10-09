# CarteleriaQ

Plataforma de cartelería digital para vender como servicio: cada negocio tiene su usuario, sus pantallas (TVs), sus medios y sus listas de precios, y las TVs se actualizan solas desde la nube.

| Carpeta | Descripción |
|---|---|
| `backend-api/` | API REST (Express 5, Prisma 7, PostgreSQL) con login y datos separados por negocio |
| `web-dashboard/` | Panel web (React + Vite): administrador y negocios |
| `player-app/` | Reproductor para TV: Android TV (APK, Capacitor), Windows (Electron) y web (`/player`) |
| `deploy/` | Caddy (HTTPS) y script de respaldos para el VPS |

## Cómo funciona

- **Administrador** (vos): crea negocios desde el panel, les asigna usuario y contraseña, y fija sus límites (**máximo de pantallas** y **espacio de almacenamiento**). Puede suspender, reactivar, cambiar la contraseña o eliminar un negocio (se borran también sus archivos).
- **Negocio**: un usuario por negocio. Solo ve y edita sus propios datos: pantallas, medios, productos y listas. Ve en la barra lateral cuánto lleva usado de su plan.
- **TV**: se vincula con un código de 6 caracteres y recibe un token propio. Solo puede leer la configuración de su pantalla. Si se borra la pantalla, la TV vuelve a pedir vinculación.
- La TV guarda la última configuración y los medios en el dispositivo: si se corta internet sigue reproduciendo.

## Desarrollo local (Docker)

```bash
cp .env.example .env      # completar POSTGRES_PASSWORD, JWT_SECRET, ADMIN_PASSWORD
docker compose up --build
```

- Dashboard: http://localhost:8081 (entrar con `ADMIN_USERNAME` / `ADMIN_PASSWORD` del `.env`)
- API: http://localhost:3000/api/health
- Reproductor web: http://localhost:3000/player

Pruebas de integración del multi-negocio (aislamiento de datos, cuotas, tokens de TV): con el backend en marcha,

```bash
cd backend-api && node scripts/test-multitenant.js
```

## Despliegue en un VPS (Hostinger u otro con Ubuntu)

Requisitos: un VPS con Docker, un dominio y acceso SSH.

1. **DNS**: en el panel de tu dominio, crear un registro `A` (ej. `carteleria.tudominio.com`) apuntando a la IP del VPS.
2. **Docker** en el VPS (Ubuntu): `curl -fsSL https://get.docker.com | sh`
3. **Firewall**: abrir solo SSH, HTTP y HTTPS:
   ```bash
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   ```
   (En Hostinger revisá también el firewall del panel del VPS.)
4. **Código**: `git clone https://github.com/josfabgom/CarteleriaQ.git /opt/CarteleriaQ && cd /opt/CarteleriaQ`
5. **Configuración**: `cp .env.production.example .env` y completar `DOMAIN`, `POSTGRES_PASSWORD` (`openssl rand -hex 16`), `JWT_SECRET` (`openssl rand -hex 32`) y `ADMIN_PASSWORD`.
6. **Arrancar**: `docker compose -f docker-compose.prod.yml up -d --build`. Caddy obtiene el certificado HTTPS solo (el dominio ya tiene que resolver al VPS).
7. Entrar a `https://carteleria.tudominio.com` con el administrador y crear el primer negocio.

**Actualizar** a una versión nueva: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.

**Respaldos** (base de datos + archivos subidos), diarios y con rotación de 14 días:

```bash
crontab -e
# 30 3 * * * cd /opt/CarteleriaQ && ./deploy/backup.sh >> backups/backup.log 2>&1
```

Los respaldos quedan en `backups/` dentro del VPS: copialos también a otro lugar (otro servidor, almacenamiento de objetos o tu PC), porque si el VPS se pierde se pierden con él.

Restaurar la base: `gunzip -c backups/db-FECHA.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U carteleria_user carteleria_db`

## Reproductor Android TV (APK)

**Instalar en una TV:** instalá la app *Downloader* en la TV (Android TV / Google TV / Fire TV), abrila y escribí
`https://carteleriaq.soporteq.tech/download/carteleriaq.apk`. Al terminar la descarga, Android pide permitir "instalar apps desconocidas" para Downloader (se acepta una vez). Alternativas: pendrive USB o `adb install -r carteleriaq.apk`.

### Actualizaciones por aire (OTA)

El APK lleva un cargador mínimo (`boot.js`) y **el reproductor se actualiza solo desde el servidor**, sin reinstalar nada:

- Qué se actualiza por aire: `renderer.js` (lógica) y `player.css` (diseño). El contenido (precios, listas, imágenes) ya se actualizaba solo.
- La TV consulta `/player/manifest.json` 20 segundos después de abrirse y cada 10 minutos. Si hay una versión más nueva, la descarga, **verifica su hash SHA-256**, la guarda y se reinicia con ella. Funciona sin cambios en el uso normal: tarda **como máximo 10 minutos** en enterarse.
- **Reversión automática:** si la versión nueva falla al arrancar (error o cuelgue) dos veces seguidas, la TV la descarta y vuelve a la versión que trae el APK. No vuelve a intentar esa versión; se recupera sola cuando publicás una más nueva.
- Sin internet, arranca con la última versión descargada. Si se reinstala un APK más viejo que la versión guardada, se conserva la más nueva.
- El panel muestra la **versión del reproductor de cada pantalla** (ej. `2026-10-09 21:07 UTC [ota]`; `[apk]` = la que trae el APK).
- Solo hace falta un APK nuevo cuando cambia algo **nativo** de Android (`boot.js`, `index.html`, permisos, `MainActivity`, plugins) o la dirección del servidor.

**Publicar una actualización del reproductor** (después de editar `player-app/renderer.js` o `player.css`):

```bash
./deploy/deploy-vps.sh root@SERVIDOR    # genera el manifiesto, copia el código y reconstruye en el servidor
```

El script calcula el hash y sube el número de versión solo si esos archivos cambiaron. Si alterás un archivo sin regenerar el manifiesto, las TVs lo rechazan por no coincidir el hash.

### Compilar y publicar el APK (solo cuando cambie lo nativo)

Requiere JDK 21 y el SDK de Android (`ANDROID_HOME`/`JAVA_HOME` definidos y `sdk.dir` en `player-app/android/local.properties`):

```bash
cd player-app
npm install
# La URL del servidor se inyecta al compilar (config.js del repositorio queda vacío):
CARTELERIA_SERVER=https://carteleriaq.soporteq.tech node build-web.js && npx cap sync android
cd android && ./gradlew assembleDebug
# APK: player-app/android/app/build/outputs/apk/debug/app-debug.apk

# Publicarlo junto con el despliegue:
cd ../.. && ./deploy/deploy-vps.sh root@SERVIDOR player-app/android/app/build/outputs/apk/debug/app-debug.apk
```

- Es un APK de depuración: sirve para instalar a mano, no para Google Play (eso requiere uno firmado de release).
- Si se compila sin `CARTELERIA_SERVER`, la TV pregunta la dirección del servidor al primer arranque.
- Sin servidor, la TV sigue mostrando lo último recibido y muestra "Sin conexión"; con **OK** en el control se puede cambiar el servidor.
- Para que arranque sola al encender: conceder una vez *Mostrar sobre otras apps* (Ajustes > Apps > Acceso especial).

## Identidad visual (ícono, banner y favicon)

El ícono de la app, el banner de Android TV, la pantalla de arranque y el favicon del panel se generan desde un único diseño en [branding/build-icons.js](branding/build-icons.js):

```bash
node branding/build-icons.js   # requiere Microsoft Edge o Google Chrome instalado
```

Escribe los PNG en `player-app/android/app/src/main/res/` y el favicon en `web-dashboard/public/`. Cambiar el ícono es un cambio **nativo**: hay que recompilar y reinstalar el APK. Las fuentes vectoriales de referencia quedan en `branding/icon.svg` y `branding/banner.svg`.

## Importar productos por CSV

Columnas: `nombre` y `precio` (obligatorias), `codigo_interno`, `codigo_barra` y `descripcion` (opcionales). Acepta separador coma, punto y coma (Excel en español) o tabulador, UTF-8 con o sin BOM, y precios como `9500`, `9.500` o `$ 9.500,50`. Si el negocio ya tiene un artículo con el mismo código interno o de barras, se actualiza. El panel muestra cuántos se crearon/actualizaron y qué filas se rechazaron. Detalle completo en [docs/FORMATO-CATALOGO.md](docs/FORMATO-CATALOGO.md) (ejemplo: [docs/ejemplo-catalogo.csv](docs/ejemplo-catalogo.csv)).

## Pantallas de TV (resoluciones y listas largas)

El reproductor dimensiona todo en proporción al tamaño de la pantalla, así que se ve igual en 720p, 1080p y 4K. La lista de precios se achica sola hasta un 70% para que entren todos los artículos y, si son demasiados, se desplaza sola de arriba hacia abajo. Las imágenes se muestran completas (sin recortar) sobre una copia difuminada que rellena los bordes. Para el 4K conviene subir imágenes de 1920x1080 o mayores y videos H.264 de 1080p (los de 4K exigen mucho a los equipos baratos).

## Seguridad: qué está y qué falta

Está: login con contraseñas hasheadas (bcrypt), sesiones firmadas con vencimiento, límite de intentos de login, aislamiento de datos por negocio en todas las rutas, tokens por pantalla, cuotas de espacio y de pantallas, HTTPS automático, base de datos sin puertos expuestos.

Falta / a tener en cuenta:
- Los archivos subidos se sirven sin login (los necesita la TV); sus nombres son aleatorios pero quien tenga la URL puede verlos.
- No hay recuperación de contraseña por email: la restablece el administrador.
- Migraciones de Prisma: hoy se usa `prisma db push` al iniciar (al cambiar el esquema en producción, hacer respaldo antes).
- Sin facturación ni pagos integrados.
