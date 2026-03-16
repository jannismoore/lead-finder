import "server-only";

import { getDb } from "../db";
import { customActors } from "../db/schema";
import {
  ACTOR_REGISTRY,
  type ActorDefinition,
  type ActorCategory,
  type ActorPhase,
  type InputFieldDescription,
} from "./registry";

function getCustomActorsFromDb(): ActorDefinition[] {
  try {
    const db = getDb();
    const rows = db.select().from(customActors).all();
    return rows
      .filter((r) => r.isEnabled)
      .map((r) => ({
        id: r.actorId,
        name: r.name,
        category: (r.phase === "find" ? "lead-generation" : "enrichment") as ActorCategory,
        phase: r.phase as ActorPhase,
        description: r.description || "",
        requiredInputFields: (r.requiredInputFields as string[]) || [],
        inputFieldDescriptions: (r.inputFieldDescriptions as Record<string, InputFieldDescription>) || undefined,
        defaultInput: (r.defaultInput as Record<string, unknown>) || {},
        isCustom: true,
        pageLimitKey: r.pageLimitKey || undefined,
      }));
  } catch {
    return [];
  }
}

export function getAllActors(): ActorDefinition[] {
  return [...ACTOR_REGISTRY, ...getCustomActorsFromDb()];
}

export function getActorById(id: string): ActorDefinition | undefined {
  return ACTOR_REGISTRY.find((a) => a.id === id) ?? getCustomActorsFromDb().find((a) => a.id === id);
}

export function getActorsByPhase(phase: ActorPhase): ActorDefinition[] {
  return getAllActors().filter((a) => a.phase === phase);
}
