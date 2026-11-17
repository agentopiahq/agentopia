import { version } from '../package.json';

/** The published version, read from package.json at build time (esbuild inlines it). */
export const VERSION: string = version;
