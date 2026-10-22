const test = require('node:test');
const assert = require('node:assert/strict');
const { hunterPosition, monsterPosition, hunterBounds, monsterBounds } = require('../src/layoutModel');

const sizes = [
  { width: 570, height: 450, name: 'minimum' },
  { width: 1000, height: 720, name: 'normal' },
];

function assertInside(bounds, canvas, label) {
  assert.ok(bounds.left >= 0, `${label} left clipped: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.top >= 0, `${label} top clipped: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.right <= canvas.width, `${label} right clipped: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.bottom <= canvas.height, `${label} bottom clipped: ${JSON.stringify(bounds)}`);
}
function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('all rendered hunter extents fit and mixed modes use unique non-overlapping cells', () => {
  for (const canvas of sizes) {
    const bounds = Array.from({ length: 8 }, (_, index) => {
      const mode = index % 2 ? 'recover' : 'attack';
      const position = hunterPosition({ index, count: 8, mode, ...canvas });
      const visual = hunterBounds(position, mode);
      assertInside(visual, canvas, `${canvas.name} hunter ${index}`);
      return visual;
    });
    for (let a = 0; a < bounds.length; a += 1) {
      for (let b = a + 1; b < bounds.length; b += 1) {
        assert.equal(overlaps(bounds[a], bounds[b]), false, `${canvas.name} hunters ${a}/${b} overlap`);
      }
    }
  }
});

test('all rendered monster extents include bars labels sway and recoil without clipping', () => {
  const ranks = ['BOSS', 'BOSS', 'ELITE', 'MINION', 'BOSS'];
  for (const canvas of sizes) {
    const bounds = ranks.map((rank, index) => {
      const position = monsterPosition({ index, count: ranks.length, rank, ...canvas });
      const visual = monsterBounds(position, rank);
      assertInside(visual, canvas, `${canvas.name} monster ${index}`);
      return visual;
    });
    for (let a = 0; a < bounds.length; a += 1) {
      for (let b = a + 1; b < bounds.length; b += 1) {
        assert.equal(overlaps(bounds[a], bounds[b]), false, `${canvas.name} monsters ${a}/${b} overlap`);
      }
    }
  }
});
