const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');
const builder = path.join(root, 'node_modules', 'electron-builder', 'cli.js');

function createBuildArgs(target, arch, outputDir, version) {
  const kind = target === 'nsis' ? 'setup' : target;
  return [
    builder,
    '--win',
    target,
    `--${arch}`,
    `--config.directories.output=${outputDir}`,
    `--config.win.artifactName=Process-Raid-Guild-${version}-${kind}-${'${arch}'}.${'${ext}'}`,
  ];
}

function runBuilder(target, arch, outputDir) {
  const result = spawnSync(process.execPath, createBuildArgs(target, arch, outputDir, pkg.version), {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${target} build failed with exit code ${result.status}`);
}

function replaceDirectoryAtomically(nextDir, finalDir) {
  const backupDir = `${finalDir}.previous`;
  fs.rmSync(backupDir, { recursive: true, force: true });
  const hadCurrent = fs.existsSync(finalDir);
  if (hadCurrent) fs.renameSync(finalDir, backupDir);
  try {
    fs.renameSync(nextDir, finalDir);
  } catch (error) {
    if (hadCurrent && fs.existsSync(backupDir) && !fs.existsSync(finalDir)) {
      fs.renameSync(backupDir, finalDir);
    }
    throw error;
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
}

function copyRequiredArtifacts(stagingRoot, nextDir, arch) {
  fs.mkdirSync(nextDir, { recursive: true });
  const names = [
    `Process-Raid-Guild-${pkg.version}-portable-${arch}.exe`,
    `Process-Raid-Guild-${pkg.version}-setup-${arch}.exe`,
  ];
  const sources = [
    path.join(stagingRoot, 'portable', names[0]),
    path.join(stagingRoot, 'setup', names[1]),
  ];
  sources.forEach((source, index) => {
    if (!fs.existsSync(source)) throw new Error(`Expected fresh artifact missing: ${source}`);
    fs.copyFileSync(source, path.join(nextDir, names[index]));
  });

  const setupDir = path.join(stagingRoot, 'setup');
  for (const entry of fs.readdirSync(setupDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.blockmap') || /^latest.*\.ya?ml$/i.test(entry.name)) {
      fs.copyFileSync(path.join(setupDir, entry.name), path.join(nextDir, entry.name));
    }
  }
}

function buildRelease(arch = 'x64') {
  const stagingRoot = path.join(root, '.release-staging');
  const nextDir = path.join(root, '.release-next');
  const finalDir = path.join(root, 'release');
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.rmSync(nextDir, { recursive: true, force: true });
  fs.mkdirSync(stagingRoot, { recursive: true });
  try {
    runBuilder('portable', arch, path.join(stagingRoot, 'portable'));
    runBuilder('nsis', arch, path.join(stagingRoot, 'setup'));
    copyRequiredArtifacts(stagingRoot, nextDir, arch);
    replaceDirectoryAtomically(nextDir, finalDir);
    console.log(`Published fresh release directory: ${finalDir}`);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    fs.rmSync(nextDir, { recursive: true, force: true });
  }
}

if (require.main === module) buildRelease('x64');

module.exports = { createBuildArgs, replaceDirectoryAtomically, buildRelease };
