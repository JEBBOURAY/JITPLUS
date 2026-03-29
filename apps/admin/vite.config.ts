import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api/prod': {
        target: 'https://jitplus-api-290470991104.europe-west9.run.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/prod/, '/api/v1'),
        secure: true,
      },
    },
  },
});
