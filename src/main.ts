// Latin and Latin Extended only (the -ext files download only when a page uses those letters).
// One Caveat weight keeps the first visit small; the headings and the task field share it.
import '@fontsource/caveat/latin-700.css';
import '@fontsource/caveat/latin-ext-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import './styles/tokens.css';
import './styles/paper.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { registerSW } from 'virtual:pwa-register';
import { settings } from '$lib/settings/settings.svelte';
import { app } from '$lib/store/app.svelte';
import { installGlobalHandlers } from '$lib/ui/crash';
import { pwa } from '$lib/ui/pwa.svelte';
import { applyUpdate } from '$lib/ui/reload';
import { watchKeyboard } from '$lib/ui/viewport';

installGlobalHandlers();
watchKeyboard();
// Dev server only: `?seed=365` fills the app with sample data. The branch is dropped from builds.
if (import.meta.env.DEV) {
  const { seedFromLocation } = await import('$lib/dev/seed');
  seedFromLocation(location.search, localStorage);
}
settings.init();
app.init();

// A new version waits until the person reloads from Settings ("Update available").
const updateSW = registerSW({
  onNeedRefresh() {
    pwa.needRefresh = true;
    pwa.update = () => applyUpdate(() => void updateSW(false));
  },
});

// Handy for poking at the data layer from the console until the UI exists.
if (import.meta.env.DEV) (window as unknown as { app: typeof app }).app = app;

export default mount(App, { target: document.getElementById('app')! });
