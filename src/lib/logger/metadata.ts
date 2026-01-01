/**
 * railway.com deployed service metadata
 *
 * @link https://docs.railway.com/reference/variables#railway-provided-variables
 */
const railway = {
  project: process.env.RAILWAY_PROJECT_NAME,
  environment: process.env.RAILWAY_ENVIRONMENT_NAME,
  service: process.env.RAILWAY_SERVICE_NAME,
  replica: process.env.RAILWAY_REPLICA_ID,
  region: process.env.RAILWAY_REPLICA_REGION,
  deployment: process.env.RAILWAY_DEPLOYMENT_ID,
  volume: process.env.RAILWAY_VOLUME_NAME,
};

export function getServiceMetadata() {
  if (railway.project) {
    return railway;
  }

  return undefined;
}
