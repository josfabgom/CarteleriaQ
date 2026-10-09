# CarteleriaQ

Sistema de cartelería digital: lista de precios + imágenes/videos en TVs, administrado desde un panel web.

| Carpeta | Descripción |
|---|---|
| `backend-api/` | API REST (Express 5, Prisma 7, PostgreSQL) |
| `web-dashboard/` | Panel de administración (React + Vite) |
| `player-app/` | Reproductor para TV: web (`/player`), Electron (Windows) y Capacitor (Android) |

## Puesta en marcha (Docker)

```bash
cp .env.example .env      # y editar POSTGRES_PASSWORD
docker compose up --build
```

- Dashboard: http://localhost:8081
- API: http://localhost:3000/api/health
- Reproductor web: http://localhost:3000/player

`VITE_API_URL` debe ser la dirección del backend **como la ve el navegador** (ej. `http://192.168.1.10:3000` en una red local).

## Desarrollo local

```bash
# backend (requiere DATABASE_URL en backend-api/.env)
cd backend-api && npm install && npx prisma db push && npm run dev
# dashboard
cd web-dashboard && npm install && npm run dev
```

## Emparejar una pantalla

1. La TV abre el reproductor y muestra un código.
2. En el dashboard: *Pantallas → Vincular* e ingresar el código.
3. Asignar lista de precios y medios. La TV se actualiza sola.

Una pantalla figura *online* si sincronizó en los últimos 2 minutos. Los códigos sin vincular expiran en 1 hora.

## Importar productos por CSV

Columnas: `nombre,precio` (obligatorias), `codigo_interno,codigo_barra,descripcion` (opcionales). Ver `articulos_importacion.csv`. Si existe un producto con el mismo código interno o de barras, se actualiza.

## Reproductor Android TV (APK)

```bash
cd player-app
npm install
npm run build-web && npx cap sync android
# abrir player-app/android en Android Studio -> Build APK
```

- La IP del servidor se pregunta al primer arranque (basta escribir `192.168.1.10`; el puerto 3000 se agrega solo). Se prueba la conexión antes de guardar. Para fijarla de fábrica, editar `player-app/config.js` (`CARTELERIA_SERVER`) antes de compilar.
- Si el servidor deja de responder, la TV sigue mostrando lo último recibido y muestra "Sin conexión"; con **OK** en el control se puede cambiar el servidor.
- Para que arranque sola al encender la TV, conceder una vez *Mostrar sobre otras apps* a la app (Ajustes > Apps > Acceso especial).

## Pendiente

- Autenticación del dashboard y de la API (hoy es abierta: usar solo en red de confianza).
- Migraciones de Prisma (hoy se usa `prisma db push` al iniciar).
