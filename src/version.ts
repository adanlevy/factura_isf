/**
 * Application Version & Build Tracking
 * Incremental versioning with semantic release tags and build timestamps.
 */
export const APP_VERSION = '2.14.0';
export const APP_BUILD_DATE = '2026.10.02';
export const APP_BUILD_ID = 'build-20261002-phase5';

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
