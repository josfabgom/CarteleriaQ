import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.carteleriaq.player',
  appName: 'CarteleriaQPlayer',
  webDir: 'www',
  server: {
    // La app se carga por http://localhost y consulta al backend por http://IP:3000.
    // Con https://localhost el WebView bloquea las imágenes/videos http (contenido mixto).
    // http://localhost sigue siendo un contexto seguro, así que la Cache API funciona.
    androidScheme: 'http',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
