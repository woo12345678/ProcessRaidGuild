function createCoalescedCollector(work) {
  let inFlight = null;
  return function collect() {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve()
      .then(work)
      .finally(() => { inFlight = null; });
    return inFlight;
  };
}

module.exports = { createCoalescedCollector };
