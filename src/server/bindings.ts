export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  DEPLOY_REVISION?: string;
  WORKER_VERSION?: { id: string; tag: string; timestamp: string };
};
