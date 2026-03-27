import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

const appOrigin = process.env.APP_ORIGIN ?? 'http://live-chat.internal:8083';
const { protocol, hostname, port } = new URL(appOrigin);

export default defineConfig({
  site: appOrigin,
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  security: {
    allowedDomains: [
      {
        protocol: protocol.replace(':', ''),
        hostname,
        port,
      },
    ],
  },
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: true,
    port: 8083,
  },
});
