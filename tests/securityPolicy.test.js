const test = require('node:test');
const assert = require('node:assert/strict');
const { guardIpcHandler, installNavigationGuards } = require('../src/securityPolicy');

const trustedUrl = 'file:///C:/app/src/renderer/index.html';

test('IPC handler accepts only the exact trusted renderer URL', async () => {
  const handler = guardIpcHandler(trustedUrl, async (_event, value) => `ok:${value}`);
  assert.equal(await handler({ senderFrame: { url: trustedUrl } }, 'data'), 'ok:data');
  await assert.rejects(
    handler({ senderFrame: { url: 'https://attacker.invalid/' } }, 'data'),
    /Untrusted renderer/,
  );
  await assert.rejects(handler({ senderFrame: null }, 'data'), /Untrusted renderer/);
});

test('navigation guards block remote navigation and all popup windows', () => {
  const listeners = new Map();
  let openHandler;
  const webContents = {
    on(name, callback) { listeners.set(name, callback); },
    setWindowOpenHandler(callback) { openHandler = callback; },
  };
  installNavigationGuards(webContents, trustedUrl);

  let prevented = false;
  listeners.get('will-navigate')({ preventDefault() { prevented = true; } }, 'https://attacker.invalid/');
  assert.equal(prevented, true);
  prevented = false;
  listeners.get('will-navigate')({ preventDefault() { prevented = true; } }, trustedUrl);
  assert.equal(prevented, false);
  assert.deepEqual(openHandler({ url: 'https://example.com' }), { action: 'deny' });
});
