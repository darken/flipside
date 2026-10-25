import '@fontsource/caveat/latin-600.css';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import './styles/tokens.css';
import './styles/paper.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { app } from '$lib/store/app.svelte';

app.init();

// Handy for poking at the data layer from the console until the UI exists.
if (import.meta.env.DEV) (window as unknown as { app: typeof app }).app = app;

export default mount(App, { target: document.getElementById('app')! });
