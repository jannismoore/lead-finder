export interface LeadForDisplay {
  displayName?: string | null;
  email?: string | null;
  rawData?: Record<string, unknown> | null;
  mappedData?: Record<string, unknown> | null;
}

/**
 * Returns a display name for a lead with a simple fallback chain:
 * displayName → mappedData username → rawData username/name → email → "Unknown"
 */
export function getLeadDisplayName(lead: LeadForDisplay): string {
  if (lead.displayName?.trim()) return lead.displayName.trim();

  const mapped = lead.mappedData;
  if (mapped?.username && typeof mapped.username === "string" && mapped.username.trim()) {
    return mapped.username.trim();
  }

  const raw = lead.rawData;
  if (raw?.username != null) {
    const u = typeof raw.username === "string" ? raw.username : String(raw.username);
    if (u.trim()) return u.trim();
  }
  if (raw?.name != null && typeof raw.name === "string" && raw.name.trim()) {
    return raw.name.trim();
  }
  if (raw?.title != null && typeof raw.title === "string" && raw.title.trim()) {
    return raw.title.trim();
  }

  if (lead.email?.trim()) return lead.email.trim();

  return "Unknown";
}

/**
 * Converts any value into a display-friendly primitive.
 */
export function coerceToDisplayValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((v) => typeof v !== "object" || v === null)) {
      return value.filter((v) => v != null).join(", ");
    }
    return value
      .map((item) => {
        if (typeof item !== "object" || item === null) return String(item);
        const entries = Object.values(item as Record<string, unknown>).filter((v) => v != null);
        return entries.map((v) => String(v)).join(": ");
      })
      .join(", ");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null);
    if (entries.length === 0) return null;
    return entries
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(", ");
  }
  return String(value);
}
