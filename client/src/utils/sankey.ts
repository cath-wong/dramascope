/**
 * Synchronic Sankey data preparation from quad instances
 */

export interface QuadInstance {
  slice: string;
  quadKey: string;
  node: string;
  co: string[];
  weights: number[];
  source: {
    title: string;
    speaker: string;
    act: string;
    scene: string;
    excerpt: string;
  };
}

export interface SankeyNode {
  id: string;
  label: string;
  layer: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export function buildSankeyData(
  instances: QuadInstance[],
  opts: { minWeight: number; maxNodesPerLayer: number }
) {
  const nodesMap = new Map<string, SankeyNode>();

  const addNode = (id: string) => {
    if (nodesMap.has(id)) return;
    const m = id.match(/__L(\d+)$/);
    const layer = m ? Number(m[1]) : 0;
    nodesMap.set(id, { id, label: id.split("__")[0], layer });
  };

  // 1) Build ROUTES (full 4-step paths) so filtering is path-preserving
  // routeKey = "l0|l1|l2|l3" and value = count (1 per instance)
  const routeCounts = new Map<string, number>();

  for (const inst of instances) {
    const node = (inst.node || "").trim();
    const co = inst.co || [];
    if (!node || co.length < 3) continue;

    const c1 = (co[0] || "").trim();
    const c2 = (co[1] || "").trim();
    const c3 = (co[2] || "").trim();
    if (!c1 || !c2 || !c3) continue;

    const l0 = `${node}__L0`;
    const l1 = `${c1}__L1`;
    const l2 = `${c2}__L2`;
    const l3 = `${c3}__L3`;

    addNode(l0);
    addNode(l1);
    addNode(l2);
    addNode(l3);

    const routeKey = `${l0}|${l1}|${l2}|${l3}`;
    routeCounts.set(routeKey, (routeCounts.get(routeKey) || 0) + 1); // 1 per instance
  }

  // 2) Filter ROUTES by minWeight (NOT individual edges)
  // This guarantees any kept path contributes equally to all 3 edges.
  const keptRoutes = Array.from(routeCounts.entries())
    .filter(([_, count]) => count >= opts.minWeight)
    .sort((a, b) => b[1] - a[1]);

  if (keptRoutes.length === 0) return { nodes: [], links: [] };

  // 3) Aggregate edges from kept routes
  const edgeCounts = new Map<string, number>();

  const addEdge = (s: string, t: string, v: number) => {
    const k = `${s}|${t}`;
    edgeCounts.set(k, (edgeCounts.get(k) || 0) + v);
  };

  for (const [routeKey, count] of keptRoutes) {
    const [l0, l1, l2, l3] = routeKey.split("|");
    addEdge(l0, l1, count);
    addEdge(l1, l2, count);
    addEdge(l2, l3, count);
  }

  let links: SankeyLink[] = Array.from(edgeCounts.entries())
    .map(([key, value]) => {
      const [source, target] = key.split("|");
      return { source, target, value };
    })
    .sort((a, b) => b.value - a.value);

  // 4) Compute traffic from these links
  const traffic = new Map<string, number>();
  for (const l of links) {
    traffic.set(l.source, (traffic.get(l.source) || 0) + l.value);
    traffic.set(l.target, (traffic.get(l.target) || 0) + l.value);
  }

  // 5) Apply maxNodesPerLayer using traffic ranking
  const layerCounts = new Map<number, number>();
  const keptNodeIds = new Set<string>();

  const nodesByTraffic = Array.from(nodesMap.values())
    .filter(n => traffic.has(n.id))
    .sort((a, b) => (traffic.get(b.id)! - traffic.get(a.id)!));

  for (const n of nodesByTraffic) {
    const current = layerCounts.get(n.layer) || 0;
    if (current < opts.maxNodesPerLayer) {
      layerCounts.set(n.layer, current + 1);
      keptNodeIds.add(n.id);
    }
  }

  // 6) After node-capping, filter ROUTES again so paths remain intact
  const keptRoutesAfterCap = keptRoutes.filter(([routeKey]) => {
    const [l0, l1, l2, l3] = routeKey.split("|");
    return (
      keptNodeIds.has(l0) &&
      keptNodeIds.has(l1) &&
      keptNodeIds.has(l2) &&
      keptNodeIds.has(l3)
    );
  });

  if (keptRoutesAfterCap.length === 0) return { nodes: [], links: [] };

  // 7) Rebuild edges ONLY from the routes that survived the node cap
  const edgeCounts2 = new Map<string, number>();
  const addEdge2 = (s: string, t: string, v: number) => {
    const k = `${s}|${t}`;
    edgeCounts2.set(k, (edgeCounts2.get(k) || 0) + v);
  };

  for (const [routeKey, count] of keptRoutesAfterCap) {
    const [l0, l1, l2, l3] = routeKey.split("|");
    addEdge2(l0, l1, count);
    addEdge2(l1, l2, count);
    addEdge2(l2, l3, count);
  }

  links = Array.from(edgeCounts2.entries())
    .map(([key, value]) => {
      const [source, target] = key.split("|");
      return { source, target, value };
    })
    .sort((a, b) => b.value - a.value);

  // 8) Prune isolated nodes (after route-preserving rebuild)
  const connected = new Set<string>();
  for (const l of links) {
    connected.add(l.source);
    connected.add(l.target);
  }

  const nodes = Array.from(nodesMap.values()).filter(n => connected.has(n.id));

  return { nodes, links };
}