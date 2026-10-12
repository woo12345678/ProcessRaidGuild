const test = require('node:test');
const assert = require('node:assert/strict');
const { planInteraction, movementMode } = require('../src/interactionModel');

const active = [
  { pid: 1, archetype: 'ai', state: 'attack', cpu: 12 },
  { pid: 2, archetype: 'engine', state: 'attack', cpu: 20 },
  { pid: 3, archetype: 'scout', state: 'recover', cpu: 0.2 },
];

test('plans a truthful visual exchange only between two different active hunters', () => {
  const exchange = planInteraction(active, 0);
  assert.equal(exchange.fromPid, 1);
  assert.equal(exchange.toPid, 2);
  assert.equal(exchange.item, 'strategy-scroll');
  assert.notEqual(exchange.fromPid, exchange.toPid);
  assert.equal(exchange.metaphorOnly, true);
});

test('rotates exchange recipes based on archetypes', () => {
  const exchange = planInteraction([
    { pid: 4, archetype: 'forge', state: 'attack', cpu: 5 },
    { pid: 5, archetype: 'engine', state: 'attack', cpu: 8 },
  ], 3);
  assert.equal(exchange.item, 'repair-kit');
});

test('does not invent cooperation when fewer than two hunters exist', () => {
  assert.equal(planInteraction([{ pid: 1, archetype: 'ai', state: 'recover', cpu: 0 }], 0), null);
});

test('resting hunters can exchange preparation supplies at camp', () => {
  const exchange = planInteraction([
    { pid: 8, archetype: 'scout', state: 'recover', cpu: 0 },
    { pid: 9, archetype: 'ai', state: 'recover', cpu: 0 },
  ], 0);
  assert.equal(exchange.item, 'scout-report');
  assert.equal(exchange.metaphorOnly, true);
});

test('stable pairs get a new event identity on a later exchange turn', () => {
  const hunters = [
    { pid: 3, archetype: 'forge', state: 'recover' },
    { pid: 4, archetype: 'engine', state: 'recover' },
  ];
  const first = planInteraction(hunters, 20);
  const later = planInteraction(hunters, 21);
  assert.equal(first.item, 'repair-kit');
  assert.equal(later.item, 'repair-kit');
  assert.notEqual(first.eventId, later.eventId);
});

test('movement sends active hunters to battle and recovering hunters to camp', () => {
  assert.equal(movementMode({ state: 'attack' }), 'advance');
  assert.equal(movementMode({ state: 'recover' }), 'camp');
});
