import { logger } from '../lib/logger.js';

async function main() {
  logger.info('Starting workers...');

  const { createBuildingsWorker } = await import('./tick-buildings.js');
  const buildingsWorker = await createBuildingsWorker();

  const { createShipsWorker } = await import('./tick-ships.js');
  const shipsWorker = await createShipsWorker();

  logger.info('All workers started');

  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await Promise.all([buildingsWorker.close(), shipsWorker.close()]);
    logger.info('Workers shut down');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err: err.message }, 'Failed to start workers');
  process.exit(1);
});
