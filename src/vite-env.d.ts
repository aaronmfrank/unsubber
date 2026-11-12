/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Short commit id and build date, set in vite.config.ts. */
declare const __BUILD_ID__: string;
