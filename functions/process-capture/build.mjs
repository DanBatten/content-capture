import * as esbuild from 'esbuild';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

// Ensure dist directory exists
const distDir = join(__dirname, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Bundle the function with all dependencies
await esbuild.build({
  entryPoints: [join(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: join(distDir, 'index.js'),
  format: 'cjs',
  external: [
    // Keep native modules external - they'll be installed via package.json
    '@google-cloud/functions-framework',
    '@google-cloud/storage',
    '@supabase/supabase-js',
    '@anthropic-ai/sdk',
    'apify-client',
    'cheerio',
  ],
  // Resolve local monorepo packages
  alias: {
    '@content-capture/core': join(rootDir, 'packages/core/src/index.ts'),
    '@content-capture/scrapers': join(rootDir, 'packages/scrapers/src/index.ts'),
    '@content-capture/analyzer': join(rootDir, 'packages/analyzer/src/index.ts'),
  },
  sourcemap: false,
  minify: false,
});

// Create a minimal package.json for deployment
const deployPackage = {
  name: 'process-capture',
  version: '0.1.0',
  main: 'index.js',
  engines: {
    node: '>=20',
  },
  dependencies: {
    '@anthropic-ai/sdk': '^0.32.1',
    '@google-cloud/functions-framework': '^3.4.2',
    '@google-cloud/storage': '^7.14.0',
    '@supabase/supabase-js': '^2.47.10',
    'apify-client': '^2.11.0',
    'cheerio': '^1.0.0',
  },
};

writeFileSync(
  join(distDir, 'package.json'),
  JSON.stringify(deployPackage, null, 2)
);

console.log('Build complete! Output in dist/');
