import "server-only";
import { getActorById } from "./registry-server";

/**
 * Coerces string values in actor input that represent JSON arrays or objects
 * into actual arrays/objects before sending to Apify (e.g. input.cookies).
 */
export function coerceActorInput(
  input: Record<string, unknown>,
  actorId: string
): Record<string, unknown> {
  const actor = getActorById(actorId);
  const descriptions = actor?.inputFieldDescriptions;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") {
      result[key] = value;
      continue;
    }

    const fieldType = descriptions?.[key]?.type;
    let parsed: unknown = undefined;

    if (fieldType === "string-array") {
      try {
        parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) parsed = undefined;
      } catch {
        // leave as string
      }
    }

    if (parsed === undefined) {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          parsed = JSON.parse(value);
          const use =
            Array.isArray(parsed) ||
            (typeof parsed === "object" &&
              parsed !== null &&
              Object.prototype.toString.call(parsed) === "[object Object]");
          if (!use) parsed = undefined;
        } catch {
          parsed = undefined;
        }
      }
    }

    result[key] = parsed !== undefined ? parsed : value;
  }

  return result;
}
