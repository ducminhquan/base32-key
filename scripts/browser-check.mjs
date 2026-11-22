/* global window, document, FormData */
// Checks dist/element.js in a real Chromium: the parts of
// <base32-key-input> that need a browser (form association, validity,
// reset). Run after `npm run build`: `node scripts/browser-check.mjs`.
// CHROMIUM_PATH can point at a Chromium binary; otherwise Playwright's own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

import { chromium } from 'playwright-core';

const page = `<!doctype html>
<form>
  <base32-key-input name="voucher" groups="2" required value="222ET-3ZZGN"></base32-key-input>
</form>
<script type="module">
  import { defineKeyInput } from './element.js';
  defineKeyInput();
  window.ready = true;
</script>`;

const server = createServer((req, res) => {
  if (req.url === '/element.js') {
    res.setHeader('content-type', 'text/javascript');
    res.end(readFileSync('dist/element.js'));
  } else {
    res.setHeader('content-type', 'text/html');
    res.end(page);
  }
}).listen(0);
const { port } = server.address();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
try {
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', (error) => errors.push(error.message));
  await tab.goto(`http://localhost:${port}/`);
  await tab.waitForFunction(() => window.ready);

  const formState = () =>
    tab.evaluate(() => {
      const form = document.querySelector('form');
      return {
        valid: form.checkValidity(),
        voucher: new FormData(form).get('voucher'),
      };
    });
  assert.deepEqual(await formState(), { valid: true, voucher: '222ET-3ZZGN' });

  const input = tab.locator('base32-key-input input');
  await input.fill('');
  assert.deepEqual(await formState(), { valid: false, voucher: '' });

  await input.pressSequentially('222te3zzgn');
  assert.equal(await input.inputValue(), '222TE-3ZZGN');
  assert.equal((await formState()).valid, false);
  await tab.locator('base32-key-input [part=suggestion]').click();
  assert.equal(await input.inputValue(), '222ET-3ZZGN');
  assert.equal((await formState()).valid, true);

  await input.fill('22222');
  await tab.evaluate(() => document.querySelector('form').reset());
  assert.equal(await input.inputValue(), '222ET-3ZZGN');

  assert.deepEqual(errors, []);
  console.log('Browser check passed');
} finally {
  await browser.close();
  server.close();
}
