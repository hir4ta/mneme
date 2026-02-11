import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  GraphNode,
  GraphRenderLink,
  GraphRenderNode,
  LayoutMode,
} from "./types";
import { typeColors } from "./types";

const ForceGraph2D = lazy(() => import("react-force-graph-2d"));

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.fill();
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.87, y + size * 0.5);
  ctx.lineTo(x - size * 0.87, y + size * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawSquare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  ctx.fillRect(x - size * 0.7, y - size * 0.7, size * 1.4, size * 1.4);
}

function drawEffectivenessRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  appliedCount: number,
  acceptedCount: number,
) {
  const ratio = acceptedCount / appliedCount;
  const ringRadius = size + 3;
  const startAngle = -Math.PI / 2;

  // Green arc (accepted portion)
  ctx.beginPath();
  ctx.arc(x, y, ringRadius, startAngle, startAngle + 2 * Math.PI * ratio);
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Gray arc (remaining portion)
  if (ratio < 1) {
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      ringRadius,
      startAngle + 2 * Math.PI * ratio,
      startAngle + 2 * Math.PI,
    );
    ctx.strokeStyle = "#d4d4d4";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function useContainerDimensions(ref: React.RefObject<HTMLDivElement | null>) {
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const updateDimensions = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const availableHeight = window.innerHeight - rect.top - 24;
      setDimensions({
        width: ref.current.offsetWidth,
        height: Math.max(320, availableHeight),
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [ref]);

  return dimensions;
}

interface GraphCanvasProps {
  graphData: { nodes: GraphRenderNode[]; links: GraphRenderLink[] };
  onNodeClick: (node: GraphRenderNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
  layoutMode: LayoutMode;
}

export function GraphCanvas({
  graphData,
  onNodeClick,
  onNodeHover,
  layoutMode,
}: GraphCanvasProps) {
  const { t } = useTranslation("graph");
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<unknown>(null);
  const dimensions = useContainerDimensions(containerRef);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const isDark =
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false;

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setMousePos({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    },
    [],
  );

  const handleNodeHover = useCallback(
    (node: GraphNode | null) => {
      setHoveredNode(node);
      onNodeHover(node);
    },
    [onNodeHover],
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: onMouseMove is only for tooltip position tracking
    <div ref={containerRef} onMouseMove={handleMouseMove} className="relative">
      {graphData.nodes.length === 0 ? (
        <div className="flex h-full min-h-[420px] items-center justify-center text-muted-foreground">
          {t("noSessions")}
        </div>
      ) : (
        <Suspense
          fallback={<Skeleton className="h-full min-h-[420px] w-full" />}
        >
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeCanvasObject={(node, ctx, _globalScale) => {
              const n = node as GraphRenderNode;
              const x = n.x ?? 0;
              const y = n.y ?? 0;
              const size = Math.sqrt(n.val || 4) * 1.5;

              ctx.fillStyle = n.color;

              if (n.entityType === "session") {
                ctx.beginPath();
                ctx.arc(x, y, size, 0, 2 * Math.PI);
                ctx.fill();
              } else if (n.unitSubtype === "decision") {
                drawDiamond(ctx, x, y, size);
              } else if (n.unitSubtype === "pattern") {
                drawTriangle(ctx, x, y, size);
              } else {
                drawSquare(ctx, x, y, size);
              }

              // Effectiveness ring for units with applied count
              if (
                n.entityType === "rule" &&
                n.appliedCount &&
                n.appliedCount > 0
              ) {
                drawEffectivenessRing(
                  ctx,
                  x,
                  y,
                  size,
                  n.appliedCount,
                  n.acceptedCount || 0,
                );
              }
            }}
            nodePointerAreaPaint={(node, color, ctx) => {
              const n = node as GraphRenderNode;
              const x = n.x ?? 0;
              const y = n.y ?? 0;
              const size = Math.sqrt(n.val || 4) * 1.5 + 3;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(x, y, size, 0, 2 * Math.PI);
              ctx.fill();
            }}
            linkWidth={(link) =>
              Math.sqrt((link as { value?: number }).value || 1)
            }
            linkColor={(link) => {
              const l = link as GraphRenderLink;
              if (l.edgeType === "resumedFrom") return "#10b981";
              if (l.edgeType === "derivedFrom") return "#f59e0b";
              if (l.edgeType === "relatedSession") return "#628141";
              if (l.edgeType === "sourceRef") return "#E67E22";
              if (l.edgeType === "sessionRef") return "#2D8B7A";
              return isDark ? "#475569" : "#cbd5e1";
            }}
            linkDirectionalArrowLength={(link) =>
              (link as GraphRenderLink).directed ? 6 : 0
            }
            linkDirectionalArrowRelPos={1}
            linkLineDash={(link) => {
              const et = (link as GraphRenderLink).edgeType;
              return et === "derivedFrom" || et === "sourceRef" ? [4, 2] : [];
            }}
            onNodeClick={onNodeClick}
            onNodeHover={handleNodeHover}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={isDark ? "#0c0a09" : "#ffffff"}
            dagMode={layoutMode === "td" ? "td" : undefined}
            dagLevelDistance={layoutMode === "td" ? 50 : undefined}
          />
        </Suspense>
      )}

      {hoveredNode && (
        <div
          className="pointer-events-none absolute z-10 max-w-[280px] rounded-lg border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-800"
          style={{
            left: Math.min(mousePos.x + 12, dimensions.width - 300),
            top: Math.min(mousePos.y + 12, dimensions.height - 140),
          }}
        >
          <p className="mb-1 line-clamp-2 text-sm font-medium">
            {hoveredNode.title}
          </p>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  typeColors[
                    (hoveredNode as GraphRenderNode).unitSubtype ||
                      hoveredNode.entityType
                  ] || typeColors.unknown,
              }}
            />
            <span>{t(`types.${hoveredNode.entityType}`)}</span>
          </div>
          {hoveredNode.tags.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {hoveredNode.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-stone-700"
                >
                  {tag}
                </span>
              ))}
              {hoveredNode.tags.length > 4 && (
                <span className="text-xs text-muted-foreground">
                  +{hoveredNode.tags.length - 4}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-stone-400">{t("clickToViewDetails")}</p>
        </div>
      )}
    </div>
  );
}
