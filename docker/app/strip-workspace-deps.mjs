// Strips workspace deps from package.json before npm install in Docker
// Usage: node docker/app/strip-workspace-deps.js
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

// @stoqr/db is a workspace dep — SvelteKit bundles it into build/index.js
// npm can't resolve workspace: references, so we remove it
for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
  if (version.startsWith('workspace:')) {
    delete pkg.dependencies[name]
  }
}

// Drop devDependencies and scripts — not needed at runtime
pkg.devDependencies = {}
pkg.scripts = {}

writeFileSync('package.json', JSON.stringify(pkg, null, 2))
console.log('Stripped workspace deps from package.json')
