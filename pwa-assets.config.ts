import {
  combinePresetAndAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

// One launch screen per common iPhone size, in paper (light) and night (dark) colours, behind the
// icon. iOS shows it while the installed app starts. The <link> tags are in index.html.
const phones = [
  'iPhone 17 Pro Max',
  'iPhone 17 Pro',
  'iPhone 16 Pro Max',
  'iPhone 15 Pro Max',
  'iPhone 15',
  'iPhone 14',
  'iPhone 13 mini',
  'iPhone 11',
  'iPhone 8',
] as const;

export default defineConfig({
  preset: combinePresetAndAppleSplashScreens(
    {
      ...minimal2023Preset,
      // Paper-coloured padding behind the icon for the maskable and Apple variants.
      maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#f6efdc' } },
      apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#f6efdc' } },
    },
    {
      padding: 0.3,
      resizeOptions: { background: '#f6efdc', fit: 'contain' },
      darkResizeOptions: { background: '#1c1b22', fit: 'contain' },
      linkMediaOptions: { log: false, addMediaScreen: true, xhtml: false },
    },
    [...phones],
  ),
  images: ['public/icon.svg'],
});
