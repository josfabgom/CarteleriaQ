// URL base del backend. Con VITE_API_URL vacío se usa el mismo origen (despliegue detrás de Caddy/Nginx).
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
