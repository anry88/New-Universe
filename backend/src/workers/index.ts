import { logger } from '../lib/logger.js';

async function main() {
  logger.info('Starting workers...');

  const { createShipsWorker } = await import('./tick-ships.js');
  const shipsWorker = await createShipsWorker();

  logger.info('Workers started');

  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await shipsWorker.close();
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
