"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { JourneySite, JourneyReferrerFlow } from "@kaizen/api-client";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceY,
} from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { drag } from "d3-drag";
import { scaleSqrt, scaleLinear } from "d3-scale";
import { cn } from "@kaizen/ui";

interface JourneyGraphProps {
  sites: JourneySite[];
  referrerFlows: JourneyReferrerFlow[];
  className?: string;
}

interface GraphNode extends SimulationNodeDatum {
  id: string;
  visits: number;
  activeTimeMs: number;
  uniquePages: number;
  title: string;
  faviconUrl: string;
  radius: number;
  color: string;
  colorDark: string;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  count: number;
  width: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function getTimeColor(ms: number): { light: string; dark: string } {
  const minutes = ms / 60000;
  if (minutes < 1) return { light: "#3b82f6", dark: "#60a5fa" };
  if (minutes < 5) return { light: "#a855f7", dark: "#c084fc" };
  if (minutes < 15) return { light: "#f59e0b", dark: "#fbbf24" };
  return { light: "#ef4444", dark: "#f87171" };
}

export function JourneyGraph({
  sites,
  referrerFlows,
  className,
}: JourneyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<ReturnType<
    typeof forceSimulation<GraphNode>
  > | null>(null);
  const [isDark, setIsDark] = useState(false);

  // Detect dark mode
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const renderGraph = useCallback(() => {
    if (!svgRef.current || sites.length === 0) return;

    const dark = document.documentElement.classList.contains("dark");
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = 200;

    // Cap at top 20 nodes by visit count
    const cappedSites = [...sites]
      .sort((a, b) => b.totalVisits - a.totalVisits)
      .slice(0, 20);
    const domainSet = new Set(cappedSites.map((s) => s.domain));

    // Build nodes
    const maxVisits = Math.max(...cappedSites.map((s) => s.totalVisits), 1);
    const radiusScale = scaleSqrt().domain([1, maxVisits]).range([8, 22]);

    const nodes: GraphNode[] = cappedSites.map((site) => {
      const colors = getTimeColor(site.totalActiveTimeMs);
      return {
        id: site.domain,
        visits: site.totalVisits,
        activeTimeMs: site.totalActiveTimeMs,
        uniquePages: site.uniquePages,
        title: site.titles[0] || site.domain,
        faviconUrl: `https://www.google.com/s2/favicons?domain=${site.domain}&sz=32`,
        radius: radiusScale(site.totalVisits),
        color: colors.light,
        colorDark: colors.dark,
      };
    });

    // Build links (filter to existing domains, exclude self-references)
    const filteredFlows = referrerFlows.filter(
      (f) => f.from !== f.to && domainSet.has(f.from) && domainSet.has(f.to),
    );
    const maxCount = Math.max(...filteredFlows.map((f) => f.count), 1);
    const linkWidthScale = scaleLinear().domain([1, maxCount]).range([1, 3.5]);

    const links: GraphLink[] = filteredFlows.map((f) => ({
      source: f.from,
      target: f.to,
      count: f.count,
      width: linkWidthScale(f.count),
    }));

    // Bidirectional lookup
    const linkSet = new Set(filteredFlows.map((f) => `${f.from}->${f.to}`));

    // Defs (arrow markers, clip paths)
    const defs = svg.append("defs");

    const arrowColor = dark
      ? "rgba(148,163,184,0.5)"
      : "rgba(100,116,139,0.45)";
    defs
      .append("marker")
      .attr("id", "journey-arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-3.5L8,0L0,3.5")
      .attr("fill", arrowColor);

    // Clip paths for favicons
    nodes.forEach((node, i) => {
      defs
        .append("clipPath")
        .attr("id", `jg-clip-${i}`)
        .append("circle")
        .attr("r", Math.max(node.radius * 0.5, 6));
    });

    // Main container (for pan/zoom)
    const container = svg.append("g");

    // Links
    const linkColor = dark
      ? "rgba(148,163,184,0.25)"
      : "rgba(100,116,139,0.2)";
    const linkElements = container
      .append("g")
      .selectAll<SVGPathElement, GraphLink>("path")
      .data(links)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", linkColor)
      .attr("stroke-width", (d) => d.width)
      .attr("marker-end", "url(#journey-arrow)");

    // Nodes
    const nodeGroups = container
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "grab");

    // Outer glow
    nodeGroups
      .append("circle")
      .attr("r", (d) => d.radius + 3)
      .attr("fill", (d) => (dark ? d.colorDark : d.color))
      .attr("opacity", 0.15);

    // Main circle
    nodeGroups
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => (dark ? d.colorDark : d.color))
      .attr("opacity", 0.8)
      .attr(
        "stroke",
        dark ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.6)",
      )
      .attr("stroke-width", 1);

    // Favicon images
    const faviconSize = (d: GraphNode) => Math.max(d.radius * 1.05, 12);
    nodeGroups
      .append("image")
      .attr("href", (d) => d.faviconUrl)
      .attr("width", faviconSize)
      .attr("height", faviconSize)
      .attr("x", (d) => -faviconSize(d) / 2)
      .attr("y", (d) => -faviconSize(d) / 2)
      .attr("clip-path", (_, i) => `url(#jg-clip-${i})`)
      .attr("pointer-events", "none");

    // Domain labels
    nodeGroups
      .append("text")
      .text((d) => {
        const name = d.id.replace(/^www\./, "");
        return name.length > 14 ? name.slice(0, 12) + ".." : name;
      })
      .attr("dy", (d) => d.radius + 11)
      .attr("text-anchor", "middle")
      .attr("font-size", 8.5)
      .attr("font-family", "system-ui, sans-serif")
      .attr(
        "fill",
        dark ? "rgba(203,213,225,0.6)" : "rgba(71,85,105,0.65)",
      )
      .attr("pointer-events", "none");

    // Force simulation
    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(55)
          .strength(0.5),
      )
      .force("charge", forceManyBody().strength(-100))
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<GraphNode>().radius((d) => d.radius + 6),
      )
      .force("y", forceY(height / 2).strength(0.08))
      .on("tick", () => {
        // Constrain within bounds
        nodes.forEach((d) => {
          d.x = Math.max(d.radius + 4, Math.min(width - d.radius - 4, d.x!));
          d.y = Math.max(d.radius + 4, Math.min(height - d.radius - 14, d.y!));
        });

        linkElements.attr("d", (d) => {
          const s = d.source as GraphNode;
          const t = d.target as GraphNode;
          const dx = (t.x ?? 0) - (s.x ?? 0);
          const dy = (t.y ?? 0) - (s.y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          const isBidi = linkSet.has(`${t.id}->${s.id}`);
          const curvature = isBidi ? 25 : 0;

          const sourceR = s.radius + 2;
          const targetR = t.radius + 7;
          const sx = (s.x ?? 0) + (dx / dist) * sourceR;
          const sy = (s.y ?? 0) + (dy / dist) * sourceR;
          const tx = (t.x ?? 0) - (dx / dist) * targetR;
          const ty = (t.y ?? 0) - (dy / dist) * targetR;

          if (curvature === 0) {
            return `M${sx},${sy} L${tx},${ty}`;
          }
          const mx = (sx + tx) / 2 + (-dy / dist) * curvature;
          const my = (sy + ty) / 2 + (dx / dist) * curvature;
          return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
        });

        nodeGroups.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    simulationRef.current = simulation;

    // Zoom
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoomBehavior);
    svg.on("dblclick.zoom", null);

    // Drag
    const dragBehavior = drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeGroups.call(dragBehavior);

    // Tooltip
    const tooltip = tooltipRef.current
      ? select(tooltipRef.current)
      : null;

    if (tooltip) {
      nodeGroups
        .on("mouseenter", (event, d) => {
          tooltip.classed("hidden", false).html(
            `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <img src="${d.faviconUrl}" style="width:14px;height:14px;border-radius:3px;" alt="" />
              <span style="font-weight:600;font-size:12px;">${d.id}</span>
            </div>
            <div style="font-size:11px;opacity:0.7;line-height:1.5;">
              <div>${d.visits} visit${d.visits !== 1 ? "s" : ""} &middot; ${d.uniquePages} page${d.uniquePages !== 1 ? "s" : ""}</div>
              <div>${formatDuration(d.activeTimeMs)} active</div>
              ${d.title !== d.id ? `<div style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">${d.title}</div>` : ""}
            </div>`,
          );
          positionTooltip(event);
        })
        .on("mousemove", (event) => {
          positionTooltip(event);
        })
        .on("mouseleave", () => {
          tooltip.classed("hidden", true);
        });

      function positionTooltip(event: MouseEvent) {
        if (!svgRef.current || !tooltip) return;
        const rect = svgRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left + 14;
        const y = event.clientY - rect.top - 8;
        tooltip.style("left", `${x}px`).style("top", `${y}px`);
      }
    }

    return () => {
      simulation.stop();
    };
  }, [sites, referrerFlows, isDark]);

  useEffect(() => {
    const cleanup = renderGraph();
    return () => cleanup?.();
  }, [renderGraph]);

  // Resize handling
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      renderGraph();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [renderGraph]);

  if (sites.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative rounded-2xl border bg-card border-border overflow-hidden",
        className,
      )}
    >
      <svg
        ref={svgRef}
        className="w-full"
        style={{ height: 200 }}
      />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none z-50 hidden rounded-xl border border-border/60 shadow-lg px-3 py-2.5 text-foreground max-w-[220px]"
        style={{
          background: isDark
            ? "rgba(15,23,42,0.92)"
            : "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px) saturate(1.6)",
          WebkitBackdropFilter: "blur(12px) saturate(1.6)",
        }}
      />
      {sites.length > 20 && (
        <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/50">
          Showing top 20 sites
        </div>
      )}
    </div>
  );
}
