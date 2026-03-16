import { getDb } from "../db";
import { apifyRuns } from "../db/schema";
import { eq } from "drizzle-orm";

const APIFY_BASE_URL = "https://api.apify.com/v2";

export interface ApifyRunResult {
  runId: string;
  datasetId: string;
  status: "SUCCEEDED" | "FAILED" | "RUNNING" | "ABORTED";
  items: Record<string, unknown>[];
}

export class ApifyError extends Error {
  errorType: string;
  actionUrl?: string;
  actionLabel?: string;

  constructor(message: string, errorType: string, actionUrl?: string, actionLabel?: string) {
    super(message);
    this.name = "ApifyError";
    this.errorType = errorType;
    this.actionUrl = actionUrl;
    this.actionLabel = actionLabel;
  }
}

function parseApifyError(status: number, body: string): ApifyError {
  try {
    const parsed = JSON.parse(body);
    const errorType = parsed?.error?.type || "";
    const errorMessage = parsed?.error?.message || "";

    if (errorType === "platform-feature-disabled" || errorMessage.includes("hard limit exceeded")) {
      return new ApifyError(
        "Your Apify account has reached its monthly usage limit. Please upgrade your plan or wait for the next billing cycle.",
        "usage-limit",
        "https://console.apify.com/billing",
        "Manage Apify billing"
      );
    }

    if (status === 401) {
      return new ApifyError(
        "Invalid Apify token. Please check your APIFY_TOKEN in your .env file or Settings page.",
        "auth-invalid"
      );
    }

    if (status === 403) {
      return new ApifyError(
        "Access denied. Please verify your Apify token is valid and your subscription covers this actor.",
        "access-denied",
        "https://console.apify.com/billing",
        "Check Apify subscription"
      );
    }

    if (status === 404) {
      return new ApifyError(
        "Actor not found. This actor ID may be incorrect or no longer available on Apify.",
        "not-found"
      );
    }

    return new ApifyError(
      errorMessage || `Apify returned an unexpected error (${status}).`,
      "unknown"
    );
  } catch {
    if (status === 401) {
      return new ApifyError(
        "Invalid Apify token. Please check your APIFY_TOKEN in your .env file or Settings page.",
        "auth-invalid"
      );
    }
    if (status === 403) {
      return new ApifyError(
        "Access denied. Your Apify subscription may not cover this actor or your usage limit has been reached.",
        "access-denied",
        "https://console.apify.com/billing",
        "Check Apify subscription"
      );
    }
    if (status === 404) {
      return new ApifyError(
        "Actor not found. This actor ID may be incorrect or no longer available on Apify.",
        "not-found"
      );
    }
    return new ApifyError(
      `Apify returned an unexpected error (${status}).`,
      "unknown"
    );
  }
}

function getToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new ApifyError(
      "Apify token is not configured. Please set APIFY_TOKEN in your .env file or on the Settings page.",
      "no-token"
    );
  }
  return token;
}

export async function startActorRun(
  actorId: string,
  input: Record<string, unknown>,
  campaignId?: number
): Promise<string> {
  const token = getToken();
  const encodedActorId = actorId.replace("/", "~");

  const res = await fetch(`${APIFY_BASE_URL}/acts/${encodedActorId}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    throw parseApifyError(res.status, text);
  }

  const data = await res.json();
  const runId = data.data.id;

  const db = getDb();
  db.insert(apifyRuns).values({
    campaignId: campaignId ?? null,
    actorId,
    runId,
    status: "running",
    inputParams: input,
  }).run();

  return runId;
}

export async function pollRunUntilDone(
  runId: string,
  maxWaitMs = 300_000,
  intervalMs = 5_000
): Promise<{ status: string; datasetId: string }> {
  const token = getToken();
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw parseApifyError(res.status, text);
    }

    const data = await res.json();
    const status = data.data.status;

    if (status === "SUCCEEDED" || status === "FAILED" || status === "ABORTED") {
      const db = getDb();
      db.update(apifyRuns)
        .set({
          status: status === "SUCCEEDED" ? "succeeded" : "failed",
          datasetId: data.data.defaultDatasetId,
          finishedAt: new Date().toISOString(),
          costUsd: data.data.usageTotalUsd ?? null,
        })
        .where(eq(apifyRuns.runId, runId))
        .run();

      return { status, datasetId: data.data.defaultDatasetId };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new ApifyError(
    "The discovery run timed out. Try reducing the search scope (fewer search terms or lower result limits).",
    "timeout"
  );
}

export async function fetchDatasetItems(
  datasetId: string,
  limit = 1000
): Promise<Record<string, unknown>[]> {
  const token = getToken();

  const res = await fetch(
    `${APIFY_BASE_URL}/datasets/${datasetId}/items?limit=${limit}&format=json`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const text = await res.text();
    throw parseApifyError(res.status, text);
  }

  const items = await res.json();

  const db = getDb();
  db.update(apifyRuns)
    .set({ resultCount: items.length })
    .where(eq(apifyRuns.datasetId, datasetId))
    .run();

  return items;
}

export async function runActorAndCollect(
  actorId: string,
  input: Record<string, unknown>,
  campaignId?: number
): Promise<ApifyRunResult> {
  const runId = await startActorRun(actorId, input, campaignId);
  const { status, datasetId } = await pollRunUntilDone(runId);

  let items: Record<string, unknown>[] = [];
  if (status === "SUCCEEDED" && datasetId) {
    items = await fetchDatasetItems(datasetId);
  }

  return { runId, datasetId, status: status as ApifyRunResult["status"], items };
}
