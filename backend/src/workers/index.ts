import { logger } from '../lib/logger.js';

async function main() {
  logger.info('Starting workers...');

  const { createBuildingsWorker } = await import('./tick-buildings.js');
  const buildingsWorker = await createBuildingsWorker();

  const { createShipsWorker } = await import('./tick-ships.js');
  const shipsWorker = await createShipsWorker();

  const { createExpeditionsWorker } = await import('./tick-expeditions.js');
  const expeditionsWorker = await createExpeditionsWorker();

  const { createNotificationsWorker } = await import('./notifications.js');
  const notificationsWorker = await createNotificationsWorker();

  const { createCargoRoutesWorker } = await import('./cargo-routes.js');
  const cargoRoutesWorker = await createCargoRoutesWorker();

  const { createResearchWorker } = await import('./research.js');
  const researchWorker = await createResearchWorker();

  const { createProductionOrdersWorker } = await import('./production-orders.js');
  const productionOrdersWorker = await createProductionOrdersWorker();

  const { createCombatWorker } = await import('./tick-combat.js');
  const combatWorker = await createCombatWorker();

  logger.info('All workers started');


  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await Promise.all([
      buildingsWorker.close(),
      shipsWorker.close(),
      expeditionsWorker.close(),
      notificationsWorker.close(),
      cargoRoutesWorker.close(),
      researchWorker.close(),
      productionOrdersWorker.close(),
      combatWorker.close(),
    ]);

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
