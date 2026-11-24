import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // base32-key and base32-key/template share chunks, so Base32KeyError is
    // one class across both in ES modules.
    entry: { index: 'src/index.ts', template: 'src/template.ts' },
    format: ['esm', 'cjs'],
    target: 'es2020',
    dts: true,
    sourcemap: true,
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
    target: 'node22',
    platform: 'node',
  },
]);
