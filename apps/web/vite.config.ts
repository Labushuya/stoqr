import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Build-Target: der Pi laeuft immer als 'node' (adapter-node, Postgres). Das
// App-Repo setzt STOQR_TARGET=app; hier bleibt es 'node'. Der __STOQR_TARGET__
// define erlaubt dieselben dual-target Dateien (api.ts, datentransfer-Seite)
// byte-gleich zu halten — der 'app'-Zweig wird auf dem Pi per DCE entfernt.
const target = process.env.STOQR_TARGET ?? 'node'

export default defineConfig({
  define: {
    __STOQR_TARGET__: JSON.stringify(target),
  },
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    noExternal: ['@stoqr/db'],
  },
})
