const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBuildArgs, replaceDirectoryAtomically } = require('../scripts/build-release');

test('release build args select x64 and give each target its final artifact name', () => {
  const portable = createBuildArgs('portable', 'x64', 'C:/tmp/portable', '0.1.0');
  const setup = createBuildArgs('nsis', 'x64', 'C:/tmp/setup', '0.1.0');
  assert.ok(portable.includes('--x64'));
  assert.ok(setup.includes('--x64'));
  assert.ok(portable.includes('--config.win.artifactName=Process-Raid-Guild-0.1.0-portable-${arch}.${ext}'));
  assert.ok(setup.includes('--config.win.artifactName=Process-Raid-Guild-0.1.0-setup-${arch}.${ext}'));
});

test('atomic release replacement removes stale prior artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-release-'));
  const current = path.join(root, 'release');
  const next = path.join(root, 'release-next');
  fs.mkdirSync(current);
  fs.mkdirSync(next);
  fs.writeFileSync(path.join(current, 'stale.exe'), 'stale');
  fs.writeFileSync(path.join(next, 'fresh.exe'), 'fresh');

  replaceDirectoryAtomically(next, current);

  assert.equal(fs.existsSync(path.join(current, 'stale.exe')), false);
  assert.equal(fs.readFileSync(path.join(current, 'fresh.exe'), 'utf8'), 'fresh');
  assert.equal(fs.existsSync(next), false);
  fs.rmSync(root, { recursive: true, force: true });
});
