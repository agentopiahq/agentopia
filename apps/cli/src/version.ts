import { version } from '../package.json';

/** The published version, read from package.json at build time (esbuild inlines it). */
export const VERSION: string = version;

/** How the CLI names itself to the servers it asks: `agentopia/<version> (<os>; <arch>)`. */
export const USER_AGENT = `agentopia/${VERSION} (${process.platform}; ${process.arch})`;
