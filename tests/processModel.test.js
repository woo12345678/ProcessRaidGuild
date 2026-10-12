const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyProcess,
  buildRaidState,
  safePercent,
  chooseRecoveryAction,
} = require('../src/processModel');

test('recognizes Unity and AI tools as cooperative hunters', () => {
  assert.equal(classifyProcess({ name: 'Unity.exe', command: '' }).role, 'hunter');
  assert.equal(classifyProcess({ name: 'node.exe', command: 'hermes agent' }).archetype, 'ai');
  assert.equal(classifyProcess({ name: 'Code.exe', command: '' }).archetype, 'forge');
});

test('turns heavy non-hunter work into bosses without inventing missing metrics', () => {
  const state = buildRaidState([
    { pid: 1, name: 'Unity.exe', cpu: 24, memRss: 2_000_000_000, command: '' },
    { pid: 2, name: 'render-worker.exe', cpu: 32, memRss: 1_200_000_000, command: '' },
  ], { cpuLoad: 56, memoryUsed: 8, memoryTotal: 16, timestamp: 123 });
  assert.equal(state.hunters[0].name, 'Unity');
  assert.equal(state.monsters[0].rank, 'BOSS');
  assert.equal(state.telemetry.timestamp, 123);
  assert.equal(safePercent(undefined), null);
});

test('idle hunters visibly prepare instead of attacking', () => {
  assert.equal(chooseRecoveryAction(0), 'sleep');
  assert.equal(chooseRecoveryAction(1), 'meal');
  assert.equal(chooseRecoveryAction(2), 'sharpen');
  assert.equal(chooseRecoveryAction(3), 'campfire');
});

test('does not fabricate a monster for an idle empty system', () => {
  const state = buildRaidState([], {
    cpuLoad: 0,
    memoryUsed: 0,
    memoryTotal: 8,
    timestamp: 1,
  });
  assert.deepEqual(state.monsters, []);
});

test('raid state caps entity counts and filters system noise', () => {
  const processes = Array.from({ length: 40 }, (_, i) => ({
    pid: i + 10,
    name: i % 2 ? 'chrome.exe' : 'svchost.exe',
    cpu: 40 - i / 2,
    memRss: 100_000_000 + i,
    command: '',
  }));
  processes.push({ pid: 99, name: 'Process Raid Guild.exe', cpu: 50, memRss: 500_000_000, command: '' });
  const state = buildRaidState(processes, { cpuLoad: 50, memoryUsed: 4, memoryTotal: 8, timestamp: 1 });
  assert.ok(state.hunters.length <= 8);
  assert.ok(state.monsters.length <= 5);
  assert.equal(state.monsters.some((m) => m.name.toLowerCase().includes('svchost')), false);
  assert.equal(state.monsters.some((m) => m.name.toLowerCase().includes('process raid guild')), false);
});
