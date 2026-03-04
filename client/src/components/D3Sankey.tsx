import React, { useMemo } from "react";
import * as d3 from "d3";
import { sankey as d3Sankey, sankeyLinkHorizontal } from "d3-sankey";

type SankeyNode = { id: string; label: string };
type SankeyLink = { source: string; target: string; value: number };

type D3SankeyProps = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  width?: number;
  height?: number;
  nodeWidth?: number;
  nodePadding?: number;
  onLinkClick?: (link: { source: string; target: string; value: number }) => void;
};

const D3Sankey: React.FC<D3SankeyProps> = ({
  nodes,
  links,
  width = 900,
  height = 360,
  nodeWidth = 14,
  nodePadding = 10,
  onLinkClick,
}) => {
  const layout = useMemo(() => {
    if (nodes.length < 2 || links.length < 1) return null;

    const nodeMap = new Map();
    nodes.forEach((d, i) => nodeMap.set(d.id, i));

    const sankeyData = {
      nodes: nodes.map(d => ({ ...d })),
      links: links
        .filter(l => nodeMap.has(l.source) && nodeMap.has(l.target) && l.value > 0)
        .map(l => ({
          source: nodeMap.get(l.source),
          target: nodeMap.get(l.target),
          value: l.value,
          originalSource: l.source,
          originalTarget: l.target
        }))
    };

    if (sankeyData.links.length === 0) return null;

    const generator = d3Sankey<any, any>()
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .extent([[1, 1], [width - 1, height - 5]]);

    try {
      return generator(sankeyData);
    } catch (e) {
      console.error("Sankey layout error:", e);
      return null;
    }
  }, [nodes, links, width, height, nodeWidth, nodePadding]);

  if (!layout) {
    return (
      <div className="h-40 border-2 border-dashed rounded-xl flex items-center justify-center text-[10px] text-muted-foreground italic bg-muted/5">
        No Sankey links at this threshold. Lower min edge weight or widen scope.
      </div>
    );
  }

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <g>
        {layout.links.map((link: any, i: number) => (
          <path
            key={`link-${i}`}
            d={sankeyLinkHorizontal()(link) || ""}
            fill="none"
            stroke="hsl(var(--primary) / 0.15)"
            strokeWidth={Math.max(1, link.width)}
            className="hover:stroke-primary/40 cursor-pointer transition-colors"
            onClick={() => onLinkClick?.({
              source: link.originalSource,
              target: link.originalTarget,
              value: link.value
            })}
          >
            <title>{`${link.source.label} → ${link.target.label}\nTraffic: ${link.value}`}</title>
          </path>
        ))}
      </g>
      <g>
        {layout.nodes.map((node: any, i: number) => (
          <g key={`node-${i}`} transform={`translate(${node.x0},${node.y0})`}>
            <rect
              width={node.x1 - node.x0}
              height={Math.max(2, node.y1 - node.y0)}
              fill="hsl(var(--primary))"
              fillOpacity={0.8}
            />
            <text
              x={node.x0 < width / 2 ? 6 + (node.x1 - node.x0) : -6}
              y={(node.y1 - node.y0) / 2}
              dy="0.35em"
              textAnchor={node.x0 < width / 2 ? "start" : "end"}
              fontSize="9px"
              fontWeight="bold"
              className="fill-foreground pointer-events-none"
            >
              {node.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
};

export default D3Sankey;
