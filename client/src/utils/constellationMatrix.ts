import { processTokens, formatTimeValue } from "./linguistics";

export interface ConstellationData {
  quads: Set<string>;
  colemmas: Set<string>;
}

export function computeConstellation(
  speeches: any[],
  nodeLemma: string,
  corpusScope: string,
  selectedPlayTitle: string,
  useStoplist: boolean,
  useLemmas: boolean,
  timeMode: string,
  getTimeSlice: (s: any) => string
): ConstellationData {
  const filtered = speeches.filter(s => {
    if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
    return true;
  });

  const quads = new Set<string>();
  const colemmas = new Set<string>();
  const compareNode = nodeLemma.trim().toLowerCase();

  filtered.forEach(s => {
    const tokens = processTokens(s.text_raw || "", { useStoplist, useLemmas });
    const nodeIndices = tokens.reduce((acc: number[], t, i) => { if (t === compareNode) acc.push(i); return acc; }, []);
    if (nodeIndices.length === 0) return;
    
    const slice = formatTimeValue(getTimeSlice(s));
    if (slice === "Unknown") return;

    nodeIndices.forEach(idx => {
      const start = Math.max(0, idx - 50);
      const end = Math.min(tokens.length, idx + 51);
      const winTokens = tokens.slice(start, end);
      const winCounts = new Map<string, number>();
      winTokens.forEach(t => { if (t === compareNode) return; winCounts.set(t, (winCounts.get(t) || 0) + 1); colemmas.add(t); });
      const sortedWin = Array.from(winCounts.entries()).sort((a, b) => b[1] - a[1]);
      if (sortedWin.length >= 3) {
        const co = sortedWin.slice(0, 3);
        const quadArray = [compareNode, ...co.map(p => p[0])].sort();
        const quadKey = quadArray.join("|");
        quads.add(quadKey);
      }
    });
  });

  return { quads, colemmas };
}

export function computeSimilarityMatrix(
  nodeLemmas: string[],
  speeches: any[],
  corpusScope: string,
  selectedPlayTitle: string,
  useStoplist: boolean,
  useLemmas: boolean,
  timeMode: string,
  getTimeSlice: (s: any) => string
): { matrix: number[][], nodes: string[], valid: string[] } {
  const constellations = new Map<string, ConstellationData>();
  const validNodes: string[] = [];

  // Compute constellation for each node
  nodeLemmas.forEach(node => {
    const const_data = computeConstellation(speeches, node, corpusScope, selectedPlayTitle, useStoplist, useLemmas, timeMode, getTimeSlice);
    if (const_data.quads.size > 0) {
      constellations.set(node, const_data);
      validNodes.push(node);
    }
  });

  // Build similarity matrix (Quad Jaccard)
  const n = validNodes.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const nodeI = validNodes[i];
      const nodeJ = validNodes[j];
      const constI = constellations.get(nodeI)!;
      const constJ = constellations.get(nodeJ)!;

      if (i === j) {
        matrix[i][j] = 100; // diagonal = perfect similarity
      } else {
        const intersection = new Set([...constI.quads].filter(x => constJ.quads.has(x)));
        const union = new Set([...constI.quads, ...constJ.quads]);
        const jaccard = union.size > 0 ? (intersection.size / union.size) * 100 : 0;
        matrix[i][j] = parseFloat(jaccard.toFixed(1));
      }
    }
  }

  return { matrix, nodes: validNodes, valid: validNodes };
}
