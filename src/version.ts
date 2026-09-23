/**
 * Application Version & Build Tracking
 * Incremental versioning with semantic release tags and build timestamps.
 */
export const APP_VERSION = '2.8.15';
export const APP_BUILD_DATE = '2026.09.23';
export const APP_BUILD_ID = 'build-20260923-reliable-expense-deletion-and-tombstone-sync';

export interface VersionInfo {
  version: string;
  buildDate: string;
  buildId: string;
  environment: string;
}

export const getAppVersionInfo = (): VersionInfo => ({
  version: APP_VERSION,
  buildDate: APP_BUILD_DATE,
  buildId: APP_BUILD_ID,
  environment: 'production',
});
