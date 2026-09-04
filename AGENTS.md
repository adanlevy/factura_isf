# Project Guidelines & Rules

## Versioning Policy
- **Increment version on every update**: Con cada cambio, mejora o actualización en el proyecto, SIEMPRE se debe incrementar el número de versión (patch/minor según corresponda) en:
  - `src/version.ts` (`APP_VERSION`, `APP_BUILD_DATE` con formato `YYYY.MM.DD`, y `APP_BUILD_ID`).
  - `package.json` (campo `"version"`).
