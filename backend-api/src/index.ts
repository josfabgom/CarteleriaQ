import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Rutas
import screensRoutes from './routes/screens';
import mediaRoutes from './routes/media';
import playlistsRoutes from './routes/playlists';
import priceListsRoutes from './routes/priceLists';

import productsRoutes from './routes/products';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Servir archivos estáticos subidos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Servir la App Reproductora para que se abra desde el navegador de cualquier Smart TV
app.use('/player', express.static(process.env.PLAYER_DIR || '/player-app'));

// Registrar rutas
app.use('/api/screens', screensRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/pricelists', priceListsRoutes);
app.use('/api/products', productsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Manejo de errores no capturados
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Backend API running on port ${port}`);
});
