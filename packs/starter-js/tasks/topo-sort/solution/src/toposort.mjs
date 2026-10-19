/**
 * Order nodes so every node comes after its dependencies (Kahn's algorithm, alphabetical ties).
 * @param {Record<string, string[]>} graph node -> dependencies
 * @returns {string[]}
 */
export function topoSort(graph) {
  const nodes = new Set();
  for (const [node, deps] of Object.entries(graph)) {
    nodes.add(node);
    for (const d of deps) nodes.add(d);
  }
  const deps = new Map([...nodes].map((n) => [n, new Set(graph[n] ?? [])]));
  const dependents = new Map([...nodes].map((n) => [n, []]));
  for (const [n, ds] of deps) for (const d of ds) dependents.get(d).push(n);
  const waiting = new Map([...deps].map(([n, ds]) => [n, ds.size]));
  const ready = [...nodes].filter((n) => waiting.get(n) === 0).sort();
  const out = [];
  while (ready.length) {
    const n = ready.shift();
    out.push(n);
    for (const m of dependents.get(n)) {
      waiting.set(m, waiting.get(m) - 1);
      if (waiting.get(m) === 0) {
        ready.push(m);
        ready.sort();
      }
    }
  }
  if (out.length < nodes.size)
    throw new Error(`cycle: ${findCycle(deps, new Set(out)).join(" -> ")}`);
  return out;
}

function findCycle(deps, done) {
  const state = new Map();
  const stack = [];
  const visit = (n) => {
    state.set(n, 1);
    stack.push(n);
    for (const d of [...deps.get(n)].sort()) {
      if (done.has(d)) continue;
      if (state.get(d) === 1) return [...stack.slice(stack.indexOf(d)), d];
      if (!state.get(d)) {
        const found = visit(d);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(n, 2);
    return null;
  };
  for (const n of [...deps.keys()].sort()) {
    if (!done.has(n) && !state.get(n)) {
      const found = visit(n);
      if (found) return found;
    }
  }
  return [];
}
