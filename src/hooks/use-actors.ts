"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ACTOR_REGISTRY,
  type ActorDefinition,
  type ActorPhase,
  type ActorCategory,
  type InputFieldDescription,
} from "@/lib/apify/registry";

interface CustomActorRow {
  id: number;
  actorId: string;
  name: string;
  phase: "find" | "enrich";
  description: string | null;
  requiredInputFields: string[];
  inputFieldDescriptions: Record<string, InputFieldDescription> | null;
  defaultInput: Record<string, unknown> | null;
  pageLimitKey: string | null;
  isEnabled: boolean;
}

function mapCustomToDefinition(row: CustomActorRow): ActorDefinition {
  return {
    id: row.actorId,
    name: row.name,
    category: (row.phase === "find" ? "lead-generation" : "enrichment") as ActorCategory,
    phase: row.phase,
    description: row.description || "",
    requiredInputFields: row.requiredInputFields || [],
    inputFieldDescriptions: row.inputFieldDescriptions || undefined,
    defaultInput: row.defaultInput || {},
    isCustom: true,
    pageLimitKey: row.pageLimitKey || undefined,
  };
}

export function useActors() {
  const [allActors, setAllActors] = useState<ActorDefinition[]>(ACTOR_REGISTRY);

  useEffect(() => {
    fetch("/api/actors")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: CustomActorRow[]) => {
        const custom = rows.filter((r) => r.isEnabled).map(mapCustomToDefinition);
        if (custom.length > 0) {
          setAllActors([...ACTOR_REGISTRY, ...custom]);
        }
      })
      .catch(() => {});
  }, []);

  const getActorById = useCallback(
    (id: string) => allActors.find((a) => a.id === id),
    [allActors]
  );

  const getActorsByPhase = useCallback(
    (phase: ActorPhase) => allActors.filter((a) => a.phase === phase),
    [allActors]
  );

  return { allActors, getActorById, getActorsByPhase };
}
