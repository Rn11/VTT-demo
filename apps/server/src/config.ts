import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  /** Ordner mit dem gebauten Client (nur in Produktion). */
  clientDir: string | null;
  production: boolean;
  maxImageBytes: number;
  maxAudioBytes: number;
  maxImportBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const root = path.resolve(import.meta.dirname, '../../..');
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    dataDir: path.resolve(env.DATA_DIR ?? path.join(root, 'data')),
    clientDir: production
      ? path.resolve(env.CLIENT_DIR ?? path.join(root, 'apps/client/dist'))
      : null,
    production,
    maxImageBytes: 30 * 1024 * 1024,
    maxAudioBytes: 60 * 1024 * 1024,
    maxImportBytes: 500 * 1024 * 1024,
  };
}
