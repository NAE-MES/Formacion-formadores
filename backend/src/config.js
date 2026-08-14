const fs = require('node:fs');
const path = require('node:path');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadRuntimeConfig(env = process.env) {
  const root = path.resolve(__dirname, '..', '..');
  const publicSchemaPath = env.FDF_PUBLIC_SCHEMA_PATH ||
    path.join(root, 'config', 'fdf-2026-public-schema.json');
  const eligibilityPath = env.FDF_ELIGIBILITY_CONFIG_PATH ||
    path.join(root, 'config', 'fdf-2026-eligibility-baseline.json');

  return {
    port: Number(env.PORT || 8080),
    apiToken: env.FDF_API_TOKEN || '',
    databaseUrl: env.DATABASE_URL || '',
    publicSchema: loadJson(publicSchemaPath),
    eligibilityConfig: loadJson(eligibilityPath),
  };
}

module.exports = {
  loadRuntimeConfig,
};
