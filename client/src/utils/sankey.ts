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
  const linksMap = new Map<string, number>();

  instances.forEach((inst) => {
    const { node, co } = inst;
    // Layered IDs: node__L0 -> co[0]__L1 -> co[1]__L2 -> co[2]__L3
    const ids = [
      `${node}__L0`,
      `${co[0]}__L1`,
      `${co[1]}__L2`,
      `${co[2]}__L3`,
    ];

    // Create links
    for (let i = 0; i < ids.length - 1; i++) {
      const linkKey = `${ids[i]}|${ids[i + 1]}`;
      linksMap.set(linkKey, (linksMap.get(linkKey) || 0) + 1);
    }

    // Register nodes for later label extraction
    ids.forEach((id, layer) => {
      if (!nodesMap.has(id)) {
        nodesMap.set(id, { id, label: id.split("__")[0], layer });
      }
    });
  });

  // Convert to array and filter by weight
  let links: SankeyLink[] = Array.from(linksMap.entries())
    .map(([key, value]) => {
      const [source, target] = key.split("|");
      return { source, target, value };
    })
    .filter((l) => l.value >= opts.minWeight)
    .sort((a, b) => b.value - a.value);

  // Apply maxNodesPerLayer limit
  const layerCounts = new Map<number, number>();
  const activeNodes = new Set<string>();
  
  // First pass: identify nodes in filtered links
  links.forEach(l => {
    activeNodes.add(l.source);
    activeNodes.add(l.target);
  });

  const finalNodes = Array.from(nodesMap.values())
    .filter(n => activeNodes.has(n.id))
    .sort((a, b) => {
      // Heuristic: sort nodes by their total traffic in links
      const trafficA = links.filter(l => l.source === a.id || l.target === a.id).reduce((sum, l) => sum + l.value, 0);
      const trafficB = links.filter(l => l.source === b.id || l.target === b.id).reduce((sum, l) => sum + l.value, 0);
      return trafficB - trafficA;
    })
    .filter(n => {
      const current = layerCounts.get(n.layer) || 0;
      if (current < opts.maxNodesPerLayer) {
        layerCounts.set(n.layer, current + 1);
        return true;
      }
      return false;
    });

  const finalNodeIds = new Set(finalNodes.map(n => n.id));
  const finalLinks = links.filter(l => finalNodeIds.has(l.source) && finalNodeIds.has(l.target));

  return { nodes: finalNodes, links: finalLinks };
}
