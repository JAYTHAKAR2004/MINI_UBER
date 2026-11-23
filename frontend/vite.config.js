import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_API_BASE_URL || 'http://localhost:8000';

  const proxyConfig = {
    '/api': {
      target: backendUrl,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
      configure: (proxy) => {
        proxy.on('error', (err, _req, res) => {
          if (res && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                detail: `Frontend proxy could not reach FastAPI/Nginx at ${backendUrl} (${err.code || err.message}). Ensure Docker Compose services are running and healthy.`,
                proxy_error: err.code || 'PROXY_ERROR',
              })
            );
          }
        });
      },
    },
  };

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: proxyConfig,
    },
    preview: {
      port: 4173,
      proxy: proxyConfig,
    },
  };
});

