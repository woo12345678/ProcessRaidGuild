function movementMode(hunter = {}) {
  return hunter.state === 'attack' ? 'advance' : 'camp';
}

function itemFor(from, to, turn) {
  if (from.archetype === 'ai') return 'strategy-scroll';
  if (from.archetype === 'scout') return 'scout-report';
  if (from.archetype === 'forge' && to.archetype === 'engine') return 'repair-kit';
  if (from.archetype === 'artist') return 'inspiration-orb';
  return ['energy-meal', 'repair-kit', 'strategy-scroll'][Math.abs(turn) % 3];
}

function planInteraction(hunters = [], turn = 0) {
  const active = hunters.filter((hunter) => hunter && hunter.pid != null);
  if (active.length < 2) return null;
  const normalizedTurn = Math.trunc(Number(turn) || 0);
  const start = Math.abs(normalizedTurn) % active.length;
  let from = active[start];
  let to = active[(start + 1) % active.length];
  const forge = active.find((hunter) => hunter.archetype === 'forge');
  const engine = active.find((hunter) => hunter.archetype === 'engine');
  if (forge && engine) {
    from = forge;
    to = engine;
  } else if (from.archetype === 'forge') {
    to = active.find((hunter) => hunter.pid !== from.pid && hunter.archetype === 'engine') || to;
  }
  return {
    eventId: `turn:${normalizedTurn}`,
    fromPid: from.pid,
    toPid: to.pid,
    item: itemFor(from, to, turn),
    metaphorOnly: true,
  };
}

module.exports = { planInteraction, movementMode };
