/**
 * Version stamps. Bump deliberately:
 *  - CONTENT_VERSION: level/region/catalog data meaningfully changes.
 *  - GENERATOR_VERSION: procedural generation output changes for the same seed.
 *    Best times & seed history are keyed by these, so old records are never
 *    compared against incompatible layouts.
 *  - SAVE_VERSION: the persisted save schema changes (add a migration!).
 */
export const CONTENT_VERSION = 2;
export const GENERATOR_VERSION = 2;
export const SAVE_VERSION = 2;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
