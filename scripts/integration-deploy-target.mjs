export const INTEGRATION_WORKER = 'distilled-news-integration';
export const INTEGRATION_ACCOUNT = 'e32b564514d4f9b9e383b7dd30dbb026';
export const INTEGRATION_ORIGIN = 'https://distilled-news-integration.distillednews-platform.workers.dev';

export function validateIntegrationTarget(config) {
  if (config.name !== INTEGRATION_WORKER || config.account_id !== INTEGRATION_ACCOUNT) throw new Error('INTEGRATION_TARGET_MISMATCH');
  if (Object.keys(config.env ?? {}).length) throw new Error('INTEGRATION_ENVIRONMENTS_FORBIDDEN');
  if (config.routes?.length || config.triggers?.crons?.length || config.queues?.consumers?.length) throw new Error('INTEGRATION_BACKGROUND_OR_ROUTE_CONFLICT');
  if (config.workers_dev !== true || config.preview_urls !== false) throw new Error('INTEGRATION_PUBLIC_ENDPOINT_MISMATCH');
  for (const key of ['PUBLIC_API_BASE_URL', 'PUBLIC_WEB_BASE_URL']) {
    if (config.vars?.[key] !== INTEGRATION_ORIGIN) throw new Error('INTEGRATION_ORIGIN_MISMATCH');
  }
  if (!config.secrets?.required?.length) throw new Error('INTEGRATION_REQUIRED_SECRETS_UNDECLARED');
}

export function missingIntegrationSecrets(required, installed, supplied = {}) {
  const available = new Set(installed);
  for (const [key, value] of Object.entries(supplied)) {
    if (!required.includes(key)) throw new Error('UNEXPECTED_INTEGRATION_SECRET_NAME: ' + key);
    if (typeof value !== 'string' || !value.trim()) throw new Error('EMPTY_INTEGRATION_SECRET: ' + key);
    available.add(key);
  }
  return required.filter(key => !available.has(key));
}
