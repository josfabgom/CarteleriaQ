import path from 'path';

// Carpeta de archivos subidos (backend-api/uploads en desarrollo, /app/uploads en Docker)
export const UPLOAD_DIR = path.resolve(__dirname, '../uploads');

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB por archivo

export const BYTES_PER_MB = 1024 * 1024;
