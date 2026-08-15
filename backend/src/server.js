const { createApp } = require('./app');
const { loadRuntimeConfig } = require('./config');
const { MemoryRepository } = require('./repositories/memoryRepository');
const { PostgresRepository } = require('./repositories/postgresRepository');

async function main() {
  const config = loadRuntimeConfig();
  const repository = config.databaseUrl
    ? new PostgresRepository(config.databaseUrl)
    : new MemoryRepository();
  if (repository.ensureBootstrapAdminUser && config.adminUsername && config.adminPassword) {
    await repository.ensureBootstrapAdminUser({
      username: config.adminUsername,
      password: config.adminPassword,
      role: 'ADMIN',
    });
  }
  const app = createApp({ config, repository });

  app.listen(config.port, () => {
    console.log(`FdF API listening on port ${config.port}`);
  });

  process.on('SIGTERM', async () => {
    app.close();
    if (repository.close) await repository.close();
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
