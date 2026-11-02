import { loadEnv } from './env.js';
import { buildApp, buildContext } from './app.js';

async function main() {
  const env = loadEnv();
  const ctx = buildContext(env);
  const app = await buildApp(ctx);

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      `API SuiviD démarrée sur http://${env.HOST}:${env.PORT} (mode ${env.DATA_MODE})`,
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
