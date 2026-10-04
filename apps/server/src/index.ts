import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { app } = await buildApp(config);
await app.listen({ port: config.port, host: config.host });
console.log(
  `Virtueller Spieltisch läuft auf http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`,
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void app.close().then(() => process.exit(0));
  });
}
