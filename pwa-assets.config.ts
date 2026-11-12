import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/** The icon's ground color. The master art has rounded corners; filling them with this gives iOS a full-bleed square. */
const ground = { resizeOptions: { background: '#14181F' } };

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    // Maskable icons get cropped to a circle; padding keeps the stamp inside the 80% safe zone.
    maskable: { ...minimal2023Preset.maskable, padding: 0.2, ...ground },
    apple: { ...minimal2023Preset.apple, padding: 0, ...ground },
  },
  images: ['public/icon.svg'],
});
