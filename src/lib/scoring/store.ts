// Offline-first persistence for the scoring screen. A tiny hand-rolled
// IndexedDB key/value store (no dependencies) holds the bootstrap snapshot, the
// scored results, and a pending-sync queue — so the screen survives refreshes
// and works with no connection. Browser-only; guarded for SSR.

const DB_NAME = "cesqroo-scoring";
const STORE = "kv";
const VERSION = 1;

export type ResultRow = {
  entryId: string;
  height: string;
  day: string;
  r1Faults: string;
  r1Time: number | null;
  r1Status: string;
  r2Faults: string;
  r2Time: number | null;
  r2Status: string;
  clientUpdatedAt: string;
};

export type BootstrapData = {
  event: { id: string; name: string; slug: string; saturdayDate: string | null; sundayDate: string | null; pdfLogo: string | null };
  config: import("@/lib/events/config").EventConfig;
  entries: Array<import("./portal").EntryForScoring & { isExtemp?: boolean }>;
  setups: Array<{ height: string; day: string; format: string; params: Record<string, number>; start_order: { entry_id: string; no: number }[] | null }>;
  results: Array<{ entry_id: string; height: string; day: string; r1_faults: string; r1_time: number | null; r1_status: string; r2_faults: string; r2_time: number | null; r2_status: string; client_updated_at: string }>;
};

const resKey = (r: { entryId: string; height: string; day: string }) => `${r.entryId}|${r.height}|${r.day}`;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB no disponible"));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result as T | undefined);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbSet(key: string, val: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(val, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Bootstrap snapshot -----------------------------------------------------
export const saveBootstrap = (slug: string, data: BootstrapData) => idbSet(`bootstrap:${slug}`, data);
export const loadBootstrap = (slug: string) => idbGet<BootstrapData>(`bootstrap:${slug}`);

// ---- Results (full map by entry|height|day) --------------------------------
export async function loadResults(slug: string): Promise<Record<string, ResultRow>> {
  return (await idbGet<Record<string, ResultRow>>(`results:${slug}`)) ?? {};
}
async function saveResultsMap(slug: string, map: Record<string, ResultRow>) {
  await idbSet(`results:${slug}`, map);
}

// ---- Sync queue (keys pending upload) --------------------------------------
async function getQueue(slug: string): Promise<Record<string, ResultRow>> {
  return (await idbGet<Record<string, ResultRow>>(`queue:${slug}`)) ?? {};
}
async function setQueue(slug: string, q: Record<string, ResultRow>) {
  await idbSet(`queue:${slug}`, q);
}

// Write/replace one binomio's result locally and enqueue it for sync.
export async function putResult(slug: string, row: ResultRow): Promise<void> {
  row.clientUpdatedAt = new Date().toISOString();
  const map = await loadResults(slug);
  map[resKey(row)] = row;
  await saveResultsMap(slug, map);
  const q = await getQueue(slug);
  q[resKey(row)] = row;
  await setQueue(slug, q);
}

// Seed local results from a server bootstrap (does not enqueue).
export async function seedResults(slug: string, rows: BootstrapData["results"]): Promise<void> {
  const map = await loadResults(slug);
  for (const r of rows) {
    const k = resKey({ entryId: r.entry_id, height: r.height, day: r.day });
    // Don't clobber a locally-newer edit.
    const local = map[k];
    if (local && new Date(local.clientUpdatedAt).getTime() > new Date(r.client_updated_at).getTime()) continue;
    map[k] = {
      entryId: r.entry_id, height: r.height, day: r.day,
      r1Faults: r.r1_faults ?? "", r1Time: r.r1_time, r1Status: r.r1_status ?? "OK",
      r2Faults: r.r2_faults ?? "", r2Time: r.r2_time, r2Status: r.r2_status ?? "OK",
      clientUpdatedAt: r.client_updated_at,
    };
  }
  await saveResultsMap(slug, map);
}

// Flush the queue to the server. Returns counts; clears synced items on success.
export async function flushQueue(slug: string): Promise<{ written: number; pending: number } | null> {
  const q = await getQueue(slug);
  const rows = Object.values(q);
  if (rows.length === 0) return { written: 0, pending: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const res = await fetch(`/api/events/${slug}/scoring/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) return null;
  await setQueue(slug, {}); // everything accepted (LWW server-side)
  return { written: rows.length, pending: 0 };
}

export async function queueSize(slug: string): Promise<number> {
  return Object.keys(await getQueue(slug)).length;
}
