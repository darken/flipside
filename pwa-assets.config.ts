import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // Paper-coloured padding behind the icon for the maskable and Apple variants.
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#f6efdc' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#f6efdc' } },
  },
  images: ['public/icon.svg'],
});
