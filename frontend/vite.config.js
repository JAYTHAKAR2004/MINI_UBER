import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawBackendUrl = (env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').trim();
  // Normalize localhost -> 127.0.0.1 on Windows so Node does not attempt IPv6 ::1 when Docker binds IPv4.
  const backendUrl = rawBackendUrl.replace('://localhost', '://127.0.0.1');

  const proxyConfig = {
    '/api': {
      target: backendUrl,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
      configure: (proxy) => {
        proxy.on('error', (err, _req, res) => {
          console.error(
            `[Vite /api proxy error] target=${backendUrl} code=${err.code || 'UNKNOWN'} message=${err.message}`
          );
          if (res && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                detail: `Frontend proxy could not reach FastAPI/Nginx at ${backendUrl} (${err.code || err.message}). Ensure Docker Desktop and Docker Compose services are running and healthy.`,
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

