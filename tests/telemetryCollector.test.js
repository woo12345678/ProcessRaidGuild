const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoalescedCollector } = require('../src/telemetryCollector');

test('overlapping collection requests share one in-flight result', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const collector = createCoalescedCollector(async () => {
    calls += 1;
    await gate;
    return { telemetry: { timestamp: 123 } };
  });

  const first = collector();
  const second = collector();
  release();

  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(a, { telemetry: { timestamp: 123 } });
  assert.strictEqual(a, b);
});

test('collector starts a fresh request after the previous one settles', async () => {
  let calls = 0;
  const collector = createCoalescedCollector(async () => ({ call: ++calls }));
  assert.deepEqual(await collector(), { call: 1 });
  assert.deepEqual(await collector(), { call: 2 });
});
