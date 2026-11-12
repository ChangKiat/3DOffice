import { defineConfig, loadEnv } from 'vite';
import { chatPlugin } from './server/chat.js';

export default defineConfig(({ mode }) => {
  // Make the keys in .env available to the chat endpoint (server side only).
  const env = loadEnv(mode, process.cwd(), 'ANTHROPIC_');
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value;
  }

  return { plugins: [chatPlugin()] };
});
