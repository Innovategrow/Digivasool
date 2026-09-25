import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // In development, /api and /uploads are proxied to the FastAPI backend
  // (set VITE_API_BASE_URL to call a different host directly instead).
  const backend = env.VITE_DEV_BACKEND || 'http://localhost:8001'
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': backend,
        '/uploads': backend,
      },
    },
    optimizeDeps: {
      include: ['react-is', 'recharts']
    }
  }
})
