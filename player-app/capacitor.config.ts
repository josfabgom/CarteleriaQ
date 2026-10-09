import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.carteleriaq.player',
  appName: 'CarteleriaQPlayer',
  webDir: 'www',
  server: {
    // El reproductor se carga por https://localhost y consulta al backend por http://IP:3000
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
