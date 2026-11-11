import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const fill = { padding: 0, resizeOptions: { background: '#2C55C9' } };

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, ...fill },
    maskable: { ...minimal2023Preset.maskable, ...fill },
    apple: { ...minimal2023Preset.apple, ...fill },
  },
  images: ['public/icon.svg'],
});
