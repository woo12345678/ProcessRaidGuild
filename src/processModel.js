const HUNTER_RULES = [
  { match: /unity|unityhub/i, archetype: 'engine', label: 'Unity' },
  { match: /hermes|codex|claude|ollama|chatgpt/i, archetype: 'ai', label: 'AI Agent' },
  { match: /code|devenv|rider|idea64|pycharm|webstorm/i, archetype: 'forge', label: 'Code Forge' },
  { match: /blender|photoshop|krita|figma/i, archetype: 'artist', label: 'Artisan' },
  { match: /chrome|msedge|firefox|brave/i, archetype: 'scout', label: 'Browser Scout' },
  { match: /node|python|dotnet|java|msbuild|webpack|vite/i, archetype: 'worker', label: 'Build Squire' },
];

const SYSTEM_NOISE = /^(system|idle|svchost|process raid guild|registry|memory compression|secure system|fontdrvhost|dwm|csrss|smss|wininit|services|lsass|winlogon|conhost|sihost|taskhostw|searchhost|startmenuexperiencehost|shellexperiencehost|runtimebroker|applicationframehost|audiodg|ctfmon|wudfhost|dllhost)(\.exe)?$/i;

function cleanName(name = '') {
  return String(name).replace(/\.exe$/i, '').trim() || 'Unknown';
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function safePercent(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function classifyProcess(process = {}) {
  const haystack = `${process.name || ''} ${process.command || ''}`;
  const rule = HUNTER_RULES.find((entry) => entry.match.test(haystack));
  if (!rule) return { role: 'monster', archetype: 'workload', label: cleanName(process.name) };
  return { role: 'hunter', archetype: rule.archetype, label: rule.label };
}

function chooseRecoveryAction(seed) {
  return ['sleep', 'meal', 'sharpen', 'campfire'][Math.abs(Number(seed) || 0) % 4];
}

function monsterRank(cpu, memoryBytes) {
  if (cpu >= 25 || memoryBytes >= 1024 ** 3) return 'BOSS';
  if (cpu >= 8 || memoryBytes >= 500 * 1024 ** 2) return 'ELITE';
  return 'MINION';
}

function buildRaidState(processes = [], telemetry = {}) {
  const normalized = processes
    .filter((item) => item && safeNumber(item.pid) > 0)
    .map((item) => {
      const cpu = safePercent(item.cpu) ?? 0;
      const memoryBytes = safeNumber(item.memRss);
      const classification = classifyProcess(item);
      return {
        pid: Number(item.pid),
        rawName: cleanName(item.name),
        cpu,
        memoryBytes,
        ...classification,
      };
    });

  const hunters = normalized
    .filter((item) => item.role === 'hunter')
    .sort((a, b) => (b.cpu + b.memoryBytes / 200_000_000) - (a.cpu + a.memoryBytes / 200_000_000))
    .slice(0, 8)
    .map((item, index) => ({
      pid: item.pid,
      name: item.label === 'Unity' ? 'Unity' : item.rawName,
      title: item.label,
      archetype: item.archetype,
      cpu: item.cpu,
      memoryMB: Math.round(item.memoryBytes / 1024 / 1024),
      state: item.cpu >= 2 ? 'attack' : 'recover',
      recovery: chooseRecoveryAction(item.pid + index),
      power: Math.max(1, Math.round(item.cpu * 2 + item.memoryBytes / 160_000_000)),
    }));

  let monsters = normalized
    .filter((item) => item.role === 'monster' && !SYSTEM_NOISE.test(item.rawName))
    .filter((item) => item.cpu >= 0.5 || item.memoryBytes >= 80 * 1024 ** 2)
    .sort((a, b) => (b.cpu + b.memoryBytes / 120_000_000) - (a.cpu + a.memoryBytes / 120_000_000))
    .slice(0, 5)
    .map((item) => ({
      pid: item.pid,
      name: item.rawName,
      cpu: item.cpu,
      memoryMB: Math.round(item.memoryBytes / 1024 / 1024),
      rank: monsterRank(item.cpu, item.memoryBytes),
      threat: Math.max(1, Math.round(item.cpu * 2 + item.memoryBytes / 100_000_000)),
    }));

  if (!monsters.length) {
    const load = safePercent(telemetry.cpuLoad) ?? 0;
    const memoryUsed = safeNumber(telemetry.memoryUsed);
    const memoryTotal = safeNumber(telemetry.memoryTotal);
    const memoryRatio = memoryTotal > 0 ? memoryUsed / memoryTotal : 0;
    if (load >= 10 || memoryRatio >= 0.8) {
      monsters = [{
        pid: 0,
        name: 'System Workload',
        cpu: load,
        memoryMB: Math.round(memoryUsed * 1024),
        rank: load >= 55 || memoryRatio >= 0.9 ? 'BOSS' : 'ELITE',
        threat: Math.max(1, Math.round(Math.max(load, memoryRatio * 100))),
        aggregate: true,
      }];
    }
  }

  return {
    hunters,
    monsters,
    telemetry: {
      cpuLoad: safePercent(telemetry.cpuLoad),
      memoryUsed: safeNumber(telemetry.memoryUsed),
      memoryTotal: safeNumber(telemetry.memoryTotal),
      gpuLoad: safePercent(telemetry.gpuLoad),
      gpuTemp: telemetry.gpuTemp == null ? null : safeNumber(telemetry.gpuTemp),
      processCount: normalized.length,
      timestamp: telemetry.timestamp || Date.now(),
      hostname: String(telemetry.hostname || 'Local PC'),
      platform: String(telemetry.platform || 'Windows'),
      source: 'local-live',
    },
  };
}

module.exports = { classifyProcess, buildRaidState, safePercent, chooseRecoveryAction };
