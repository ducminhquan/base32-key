import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    target: 'es2020',
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    // base32-key/element: the <base32-key-input> custom element.
    entry: { element: 'src/element.ts' },
    format: ['esm'],
    target: 'es2022',
    platform: 'browser',
    dts: true,
    sourcemap: true,
  },
  {
    // One minified ES module for <script type="module"> from a CDN.
    entry: { 'base32-key.min': 'src/browser.ts' },
    format: ['esm'],
    target: 'es2022',
    platform: 'browser',
    minify: true,
    sourcemap: true,
  },
  {
    entry: { cli: 'src/cli/main.ts' },
    format: ['esm'],
    target: 'node20',
    platform: 'node',
  },
]);
