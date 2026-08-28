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
  const evaluationPath = env.FDF_EVALUATION_CONFIG_PATH ||
    path.join(root, 'config', 'fdf-2026-evaluation-baseline.json');
  const selectionPolicyPath = env.FDF_SELECTION_POLICY_PATH ||
    path.join(root, 'config', 'fdf-2026-selection-policy.json');
  const municipalitiesPath = env.FDF_MUNICIPALITIES_PATH ||
    path.join(root, 'config', 'cuba-municipalities.json');

  return {
    port: Number(env.PORT || 8080),
    apiToken: env.FDF_API_TOKEN || '',
    adminToken: env.FDF_ADMIN_TOKEN || '',
    adminUsername: env.FDF_ADMIN_USERNAME || '',
    adminPassword: env.FDF_ADMIN_PASSWORD || '',
    databaseUrl: env.DATABASE_URL || '',
    publicSchema: loadJson(publicSchemaPath),
    eligibilityConfig: loadJson(eligibilityPath),
    evaluationConfig: loadJson(evaluationPath),
    selectionPolicy: loadJson(selectionPolicyPath),
    municipalitiesCatalog: loadJson(municipalitiesPath),
  };
}

module.exports = {
  loadRuntimeConfig,
};
