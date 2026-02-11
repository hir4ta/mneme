import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { readAllSessionIndexes } from "../../../lib/index/manager.js";
import { getMnemeDir } from "../lib/helpers.js";
import { collectDevRules } from "./dev-rules.js";

const analyticsGraph = new Hono();

// Knowledge Graph API
analyticsGraph.get("/knowledge-graph", async (c) => {
  try {
    const mnemeDir = getMnemeDir();
    const sessionItems = readAllSessionIndexes(mnemeDir).items;
    const devRules = collectDevRules().filter(
      (item) => item.status === "approved",
    );

    // Read full sessions to get resumedFrom
    const sessionDataMap = new Map<string, { resumedFrom?: string }>();
    for (const item of sessionItems.filter((i) => i.hasSummary)) {
      try {
        const sessionPath = path.join(mnemeDir, item.filePath);
        const raw = fs.readFileSync(sessionPath, "utf-8");
        const session = JSON.parse(raw);
        if (session.resumedFrom) {
          sessionDataMap.set(item.id, {
            resumedFrom: session.resumedFrom,
          });
        }
      } catch {
        // Skip sessions that cannot be read
      }
    }

    const nodes = [
      ...sessionItems
        .filter((item) => item.hasSummary)
        .map((item) => ({
          id: `session:${item.id}`,
          entityType: "session" as const,
          entityId: item.id,
          title: item.title,
          tags: item.tags || [],
          createdAt: item.createdAt,
          branch: item.branch || null,
          resumedFrom: sessionDataMap.get(item.id)?.resumedFrom || null,
          unitSubtype: null,
          sourceId: null,
          appliedCount: null,
          acceptedCount: null,
        })),
      ...devRules.map((item) => ({
        id: `rule:${item.type}:${item.id}`,
        entityType: "rule" as const,
        entityId: item.id,
        title: item.title,
        tags: item.tags || [],
        createdAt: item.createdAt,
        unitSubtype: (item.type as string) || null,
        sourceId: item.sourceFile || null,
        appliedCount: item.appliedCount ?? null,
        acceptedCount: item.acceptedCount ?? null,
        branch: null,
        resumedFrom: null,
        relatedSessions: item.relatedSessions || null,
        sourceRef: item.sourceRef || null,
        patternSourceId: item.sourceId || null,
      })),
    ];

    // Build inverted tag index for efficient edge computation
    const tagToNodes = new Map<string, string[]>();
    for (const node of nodes) {
      for (const tag of node.tags) {
        const list = tagToNodes.get(tag) || [];
        list.push(node.id);
        tagToNodes.set(tag, list);
      }
    }

    // Build shared tag edges from inverted index
    const edgeMap = new Map<
      string,
      {
        source: string;
        target: string;
        weight: number;
        sharedTags: string[];
        edgeType: "sharedTags" | "resumedFrom" | "derivedFrom";
        directed: boolean;
      }
    >();
    for (const [tag, nodeIds] of tagToNodes) {
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const key =
            nodeIds[i] < nodeIds[j]
              ? `${nodeIds[i]}|${nodeIds[j]}`
              : `${nodeIds[j]}|${nodeIds[i]}`;
          const existing = edgeMap.get(key);
          if (existing) {
            existing.weight++;
            existing.sharedTags.push(tag);
          } else {
            const [source, target] = key.split("|");
            edgeMap.set(key, {
              source,
              target,
              weight: 1,
              sharedTags: [tag],
              edgeType: "sharedTags",
              directed: false,
            });
          }
        }
      }
    }

    const tagEdges = Array.from(edgeMap.values());

    // Build resumedFrom edges
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const resumedEdges: typeof tagEdges = [];
    for (const node of nodes) {
      if (node.entityType === "session" && node.resumedFrom) {
        const targetId = `session:${node.resumedFrom}`;
        if (nodeIdSet.has(targetId)) {
          resumedEdges.push({
            source: targetId,
            target: node.id,
            weight: 1,
            sharedTags: [],
            edgeType: "resumedFrom",
            directed: true,
          });
        }
      }
    }

    // Build cross-entity relationship edges
    const relationEdges: typeof tagEdges = [];

    for (const node of nodes) {
      // Decision -> Session (via relatedSessions)
      if (
        node.entityType === "rule" &&
        (node as Record<string, unknown>).relatedSessions
      ) {
        const related = (node as Record<string, unknown>)
          .relatedSessions as string[];
        for (const sessionId of related) {
          const targetId = `session:${sessionId}`;
          if (nodeIdSet.has(targetId)) {
            relationEdges.push({
              source: node.id,
              target: targetId,
              weight: 1,
              sharedTags: [],
              edgeType: "relatedSession" as (typeof tagEdges)[0]["edgeType"],
              directed: true,
            });
          }
        }
      }

      // Rule -> Decision/Pattern (via sourceRef)
      if (
        node.entityType === "rule" &&
        (node as Record<string, unknown>).sourceRef
      ) {
        const ref = (node as Record<string, unknown>).sourceRef as {
          type: string;
          id: string;
        };
        if (ref.type && ref.id) {
          const targetId = `rule:${ref.type}:${ref.id}`;
          if (nodeIdSet.has(targetId)) {
            relationEdges.push({
              source: node.id,
              target: targetId,
              weight: 1,
              sharedTags: [],
              edgeType: "sourceRef" as (typeof tagEdges)[0]["edgeType"],
              directed: true,
            });
          }
        }
      }

      // Pattern -> Session (via sourceId/sessionRef)
      if (
        node.entityType === "rule" &&
        (node as Record<string, unknown>).patternSourceId
      ) {
        const sessionId = (node as Record<string, unknown>)
          .patternSourceId as string;
        const targetId = `session:${sessionId}`;
        if (nodeIdSet.has(targetId)) {
          relationEdges.push({
            source: node.id,
            target: targetId,
            weight: 1,
            sharedTags: [],
            edgeType: "sessionRef" as (typeof tagEdges)[0]["edgeType"],
            directed: true,
          });
        }
      }
    }

    const edges = [...tagEdges, ...resumedEdges, ...relationEdges];

    return c.json({ nodes, edges });
  } catch (error) {
    console.error("Failed to build knowledge graph:", error);
    return c.json({ error: "Failed to build knowledge graph" }, 500);
  }
});

export default analyticsGraph;
