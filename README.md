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

**Compilar y publicar una versión nueva** (requiere JDK 21 y el SDK de Android; `ANDROID_HOME`/`JAVA_HOME` definidos y `sdk.dir` en `player-app/android/local.properties`):

```bash
cd player-app
npm install
# La URL del servidor se inyecta al compilar (config.js del repositorio queda vacío):
CARTELERIA_SERVER=https://carteleriaq.soporteq.tech node build-web.js && npx cap sync android
cd android && ./gradlew assembleDebug
# APK: player-app/android/app/build/outputs/apk/debug/app-debug.apk

# Publicarlo en el servidor (carpeta downloads/, fuera de git):
scp app/build/outputs/apk/debug/app-debug.apk root@SERVIDOR:/opt/carteleriaq/downloads/carteleriaq.apk
```

- Es un APK de depuración: sirve para instalar a mano, no para Google Play (eso requiere uno firmado de release).
- Si se compila sin `CARTELERIA_SERVER`, la TV pregunta la dirección del servidor al primer arranque.
- Sin servidor, la TV sigue mostrando lo último recibido y muestra "Sin conexión"; con **OK** en el control se puede cambiar el servidor.
- Para que arranque sola al encender: conceder una vez *Mostrar sobre otras apps* (Ajustes > Apps > Acceso especial).

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
