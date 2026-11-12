import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { chatPlugin } from './server/chat.js';

// Settings for the chat endpoint, kept on the server side only.
//   ANTHROPIC_API_KEY  from this project's .env
//   DATABASE_URL       from this project's .env if set there; otherwise from
//                      the tracking application's own Dashboard/.env next door
function loadServerEnv(mode) {
  const here = process.cwd();
  const dashboard = path.resolve(here, '..', 'Dashboard');
  const sources = [
    loadEnv(mode, here, ['ANTHROPIC_', 'DATABASE_']),
    loadEnv(mode, dashboard, ['DATABASE_']),
  ];
  for (const env of sources) {
    for (const [key, value] of Object.entries(env)) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

export default defineConfig(({ mode }) => {
  loadServerEnv(mode);
  return { plugins: [chatPlugin()] };
});
