export interface ClusterNode {
  id: string;
  members: string[];
}

export interface ClusterData {
  clusters: ClusterNode[];
  clusterStats: Array<{ id: string; members: string[]; size: number; avgSimilarity: number }>;
}

export function computeClusters(
  matrix: number[][],
  nodes: string[],
  threshold: number
): ClusterData {
  if (nodes.length < 2) {
    return { clusters: [], clusterStats: [] };
  }

  // Build adjacency using threshold
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach(n => adjacency.set(n, new Set()));

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const similarity = matrix[i][j] / 100; // convert percentage to decimal
      if (similarity >= threshold) {
        adjacency.get(nodes[i])!.add(nodes[j]);
        adjacency.get(nodes[j])!.add(nodes[i]);
      }
    }
  }

  // Find connected components using DFS
  const visited = new Set<string>();
  const clusters: string[][] = [];

  function dfs(node: string, component: string[]) {
    visited.add(node);
    component.push(node);
    adjacency.get(node)!.forEach(neighbor => {
      if (!visited.has(neighbor)) {
        dfs(neighbor, component);
      }
    });
  }

  nodes.forEach(node => {
    if (!visited.has(node)) {
      const component: string[] = [];
      dfs(node, component);
      clusters.push(component);
    }
  });

  // Compute cluster statistics
  const clusterStats = clusters.map((members, idx) => {
    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const nodeIIdx = nodes.indexOf(members[i]);
        const nodeJIdx = nodes.indexOf(members[j]);
        totalSimilarity += matrix[nodeIIdx][nodeJIdx] / 100;
        pairCount++;
      }
    }

    const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 0;

    return {
      id: `Cluster ${idx + 1}`,
      members,
      size: members.length,
      avgSimilarity: parseFloat((avgSimilarity * 100).toFixed(1))
    };
  });

  return {
    clusters: clusterStats.map(cs => ({ id: cs.id, members: cs.members })),
    clusterStats
  };
}
