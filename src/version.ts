/**
 * Application Version & Build Tracking
 * Incremental versioning with semantic release tags and build timestamps.
 */
export const APP_VERSION = '2.5.6';
export const APP_BUILD_DATE = '2026.09.04';
export const APP_BUILD_ID = 'build-20260904-0545';

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
