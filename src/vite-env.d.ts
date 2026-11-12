/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Set in vite.config.ts at build time. */
declare const __BUILD_INFO__: { version: string; commit: string; builtAt: string };
