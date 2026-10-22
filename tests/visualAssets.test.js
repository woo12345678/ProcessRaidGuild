const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('cinematic raid backdrop is bundled and referenced by the renderer', () => {
  const assetPath = path.join(root, 'src', 'renderer', 'assets', 'raid-backdrop.svg');
  assert.equal(fs.existsSync(assetPath), true, 'missing cinematic backdrop asset');
  const svg = fs.readFileSync(assetPath, 'utf8');
  assert.match(svg, /viewBox="0 0 1920 1080"/);
  assert.match(svg, /id="citadel"/);
  assert.match(svg, /id="guild-camp"/);

  const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(renderer, /raid-backdrop\.svg/);
  assert.match(renderer, /drawImage\(raidBackdrop/);
  assert.match(renderer, /function drawHunterEmblem/);
  assert.match(renderer, /function drawMonsterAura/);
  assert.match(renderer, /function drawImpactEffects/);

  const hunterTypes = ['engine', 'ai', 'forge', 'artist', 'scout', 'worker'];
  const monsterTypes = ['boss', 'elite', 'mob'];
  for (const type of hunterTypes) {
    const sprite = path.join(root, 'src', 'renderer', 'assets', 'hunters', `${type}.svg`);
    assert.equal(fs.existsSync(sprite), true, `missing hunter sprite: ${type}`);
    assert.match(fs.readFileSync(sprite, 'utf8'), /viewBox="0 0 160 200"/);
  }
  for (const type of monsterTypes) {
    const sprite = path.join(root, 'src', 'renderer', 'assets', 'monsters', `${type}.svg`);
    assert.equal(fs.existsSync(sprite), true, `missing monster sprite: ${type}`);
    assert.match(fs.readFileSync(sprite, 'utf8'), /viewBox="0 0 260 220"/);
  }
  assert.match(renderer, /hunterSprites/);
  assert.match(renderer, /monsterSprites/);
});
