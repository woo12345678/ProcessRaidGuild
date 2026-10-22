(function exposeLayout(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RaidLayout = api;
}(typeof window !== 'undefined' ? window : null, () => {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const HUNTER_BASE_SIZE = { attack: 112, recover: 98 };
  const MONSTER_BASE_WIDTH = { BOSS: 250, ELITE: 194, MINION: 154 };
  const MONSTER_RATIO = 220 / 260;
  const HUNTER_REGION = 0.56;

  function hunterMetrics(mode, scale) {
    const size = (HUNTER_BASE_SIZE[mode] || HUNTER_BASE_SIZE.recover) * scale;
    return {
      size,
      spriteHeight: size * 1.25,
      labelWidth: 152 * scale,
      fontScale: scale,
      left: 76 * scale + 7,
      right: 76 * scale + 7,
      top: 150 * scale + 7,
      bottom: 50 * scale + 7,
    };
  }

  function monsterMetrics(rank, scale) {
    const width = (MONSTER_BASE_WIDTH[rank] || MONSTER_BASE_WIDTH.MINION) * scale;
    return {
      width,
      height: width * MONSTER_RATIO,
      healthWidth: (rank === 'BOSS' ? 166 : rank === 'ELITE' ? 132 : 108) * scale,
      labelWidth: 160 * scale,
      fontScale: scale,
      left: 138 * scale + 4,
      right: 138 * scale + 4,
      top: 226 * scale + 4,
      bottom: 68 * scale + 4,
    };
  }

  function gridSlot({ index, count, columns, regionLeft, regionWidth, height, measure }) {
    const rows = Math.ceil(Math.max(1, count) / columns);
    const cellWidth = regionWidth / columns;
    const cellHeight = height / rows;
    const base = measure(1);
    const scale = clamp(Math.min(1, (cellWidth - 8) / (base.left + base.right), (cellHeight - 8) / (base.top + base.bottom)), 0.3, 1);
    const metrics = measure(scale);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellLeft = regionLeft + column * cellWidth;
    const cellTop = row * cellHeight;
    const x = cellLeft + (cellWidth - metrics.left - metrics.right) / 2 + metrics.left;
    const y = cellTop + (cellHeight - metrics.top - metrics.bottom) / 2 + metrics.top;
    return { x, y, scale, metrics };
  }

  function hunterPosition({ index, count, mode, width, height }) {
    const safeCount = Math.max(1, count);
    const columns = Math.min(safeCount, safeCount >= 7 ? 4 : safeCount >= 5 ? 3 : safeCount);
    return gridSlot({
      index,
      count: safeCount,
      columns,
      regionLeft: 0,
      regionWidth: width * HUNTER_REGION,
      height,
      measure: (scale) => hunterMetrics(mode, scale),
    });
  }

  function monsterPosition({ index, count, rank, width, height }) {
    const safeCount = Math.max(1, count);
    const columns = safeCount === 1 ? 1 : 2;
    return gridSlot({
      index,
      count: safeCount,
      columns,
      regionLeft: width * HUNTER_REGION,
      regionWidth: width * (1 - HUNTER_REGION),
      height,
      measure: (scale) => monsterMetrics(rank, scale),
    });
  }

  function hunterBounds(position, mode) {
    const metrics = position.metrics || hunterMetrics(mode, position.scale);
    return {
      left: position.x - metrics.left,
      top: position.y - metrics.top,
      right: position.x + metrics.right,
      bottom: position.y + metrics.bottom,
    };
  }

  function monsterBounds(position, rank) {
    const metrics = position.metrics || monsterMetrics(rank, position.scale);
    return {
      left: position.x - metrics.left,
      top: position.y - metrics.top,
      right: position.x + metrics.right,
      bottom: position.y + metrics.bottom,
    };
  }

  return { hunterPosition, monsterPosition, hunterBounds, monsterBounds, hunterMetrics, monsterMetrics };
}));
