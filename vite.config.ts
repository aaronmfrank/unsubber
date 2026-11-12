/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = '/unsubber/';
/** The minor version is the last finished milestone: 0.4.x means milestone 4 is done. */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function commitId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base,
  build: { chunkSizeWarningLimit: 800 },
  define: {
    __BUILD_INFO__: JSON.stringify({ version: pkg.version, commit: commitId(), builtAt: new Date().toISOString() }),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Updates wait for a safe moment (the sign-in screen, or a tap on Reload) instead of reloading mid-commit.
      registerType: 'prompt',
      pwaAssets: { config: true, overrideManifestIcons: true, injectThemeColor: false },
      manifest: {
        name: 'Unsubber',
        short_name: 'Unsubber',
        description: 'Swipe through every Gmail sender and unsubscribe fast.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F6F7F9',
        theme_color: '#F6F7F9',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
