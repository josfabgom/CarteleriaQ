import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { ensureSuperadmin } from './auth';
import { UPLOAD_DIR } from './config';

// Rutas
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import screensRoutes from './routes/screens';
import mediaRoutes from './routes/media';
import playlistsRoutes from './routes/playlists';
import priceListsRoutes from './routes/priceLists';
import productsRoutes from './routes/products';
import pricingRoutes from './routes/pricing';
import cyclesRoutes from './routes/cycles';
import { migrateLegacyPlaylists } from './scenes';
import { startPriceScheduler } from './pricing';

const app = express();
const port = process.env.PORT || 3000;

// Detrás de Caddy/Nginx: usar la IP real del cliente (para el rate limiting)
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

// La API usa tokens Bearer (no cookies), así que no hay riesgo CSRF; CORS_ORIGIN permite restringirlo
const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins?.length ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: '1mb' }));

// Archivos subidos: el nombre es aleatorio, por eso se sirven sin login (los necesita la TV)
app.use('/uploads', express.static(UPLOAD_DIR));

// Servir la App Reproductora para que se abra desde el navegador de cualquier Smart TV
app.use('/player', express.static(process.env.PLAYER_DIR || '/player-app'));

// Registrar rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/screens', screensRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/pricelists', priceListsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/cycles', cyclesRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Manejo de errores no capturados
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

ensureSuperadmin()
  .then(async () => {
    const migrated = await migrateLegacyPlaylists(); // convierte los ciclos del formato anterior a escenas
    if (migrated) console.log(`Ciclos migrados al formato de escenas: ${migrated}`);
  })
  .then(() => app.listen(port, () => {
    console.log(`Backend API running on port ${port}`);
    startPriceScheduler(); // aplica los cambios de precios programados
  }))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
