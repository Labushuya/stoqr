import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      out: 'build',
    }),
    alias: {
      $lib: './src/lib',
      $components: './src/lib/components',
      $db: '../../packages/db/src',
    },
  },
}

export default config
