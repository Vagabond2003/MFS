import postgres from "postgres";
import { DB_VERSION, type AiInsightRecord, type DbState } from "@/services/mock/schema";
import { assertInvariants, type StoreBackend } from "@/services/mock/store";

/**
 * PostgreSQL (Supabase) persistence for the API handlers.
 *
 * The server keeps the whole database in memory and reloads it only when it
 * changed. Triggers bump `app_state.version` on every insert/update/delete
 * (supabase/migrations/20261006_change_counter.sql), so each request reads
 * that one number; edits made directly in Supabase still show up straight
 * away. Without that migration every request loads all tables (slow).
 *
 * `write()` runs as ONE database transaction:
 *   1. take a global advisory lock (writes are serialised, like the mock queue)
 *   2. use the cached rows if the version still matches (else load them),
 *      let the handler mutate a copy
 *   3. check ledger invariants
 *   4. upsert changed rows / delete removed rows, then COMMIT and keep the
 *      copy as the new cache
 * Any error rolls everything back, so a payment can never be half-saved.
 */

type Row = Record<string, unknown>;

interface TableSpec {
  /** DbState collection */
  key: Exclude<keyof DbState, "version" | "seededAt">;
  table: string;
  pk: string;
  /** Nested objects stored as prefixed columns, e.g. sender → sender_user_id, sender_name… */
  nested?: Record<string, string[]>;
  /** Stored as a key → value map in DbState instead of an array. */
  map?: { keyColumn: string };
}

const PARTY = ["userId", "name", "account", "kind"];
const HOLD = ["userId", "amount"];

const TABLES: TableSpec[] = [
  { key: "users", table: "users", pk: "id" },
  { key: "personalProfiles", table: "personal_profiles", pk: "user_id" },
  { key: "agentProfiles", table: "agent_profiles", pk: "user_id" },
  { key: "merchantProfiles", table: "merchant_profiles", pk: "user_id" },
  { key: "merchantBusinesses", table: "merchant_businesses", pk: "id" },
  { key: "statusHistory", table: "account_status_history", pk: "id" },
  { key: "documents", table: "verification_documents", pk: "id" },
  { key: "wallets", table: "wallets", pk: "id" },
  {
    key: "transactions",
    table: "transactions",
    pk: "id",
    nested: {
      sender: PARTY,
      receiver: PARTY,
      commission: HOLD,
      pendingHold: HOLD,
      pendingCredit: HOLD,
      cashEffect: ["userId", "delta"],
    },
  },
  { key: "commissions", table: "commissions", pk: "id" },
  { key: "notifications", table: "notifications", pk: "id" },
  { key: "otpCodes", table: "otp_codes", pk: "id" },
  { key: "sessions", table: "sessions", pk: "id" },
  { key: "auditLogs", table: "audit_logs", pk: "id" },
  { key: "disputes", table: "disputes", pk: "id" },
  { key: "paymentRequests", table: "payment_requests", pk: "id", nested: { payer: PARTY } },
  { key: "rateLimits", table: "rate_limits", pk: "key", map: { keyColumn: "key" } },
  { key: "idempotency", table: "idempotency_keys", pk: "key", map: { keyColumn: "key" } },
  { key: "aiInsights", table: "ai_insights", pk: "id" },
  { key: "flagReviews", table: "flag_reviews", pk: "id" },
];

/**
 * Columns added by later migrations (supabase/migrations). If a database has not
 * been migrated yet they are skipped on save instead of failing every write.
 */
const OPTIONAL_COLUMNS: Record<string, string[]> = {
  users: ["language", "avatar_id"],
  agent_profiles: ["district", "area"],
  merchant_businesses: ["district", "area"],
};
/** Tables added by later migrations: read as empty and not saved until the migration runs. */
const OPTIONAL_TABLES = new Set(["ai_insights", "flag_reviews"]);
/** Of those, tables whose absence handlers must see (left undefined) so they can refuse a write that wouldn't be kept. */
const UNDEFINED_WHEN_MISSING = new Set(["flag_reviews"]);
const warnedMissing = new Set<string>();

function warnOnce(key: string, message: string) {
  if (warnedMissing.has(key)) return;
  warnedMissing.add(key);
  console.warn(message);
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/* ───────────── Connection ───────────── */

type Sql = postgres.Sql;

/**
 * The transaction pooler doesn't support pipelining either: a query pipelined
 * behind another can be lost and its connection stays stuck, so the pool dies
 * under concurrent requests. One query in flight per connection; the rest queue.
 * (`max_pipeline` is a postgres.js option missing from its type definitions.)
 */
const NO_PIPELINING = { max_pipeline: 0 };
interface Cache {
  /** app_state.version the cached rows correspond to. */
  version: string;
  db: DbState;
}
const globalForDb = globalThis as unknown as {
  __koshSql?: Sql;
  __koshColumns?: Promise<ColumnTypes>;
  __koshCache?: Cache | null;
  __koshCounter?: { available: boolean; checkedAt: number };
};

function sql(): Sql {
  if (globalForDb.__koshSql) return globalForDb.__koshSql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add your Supabase connection string to .env.local.");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  globalForDb.__koshSql = postgres(url, {
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    ...NO_PIPELINING,
    ssl: local ? false : "require",
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => undefined,
  });
  return globalForDb.__koshSql;
}

/* ───────────── Column types (introspected once) ───────────── */

/** table → column → Postgres type name (udt_name) */
type ColumnTypes = Map<string, Map<string, string>>;

function columnTypes(): Promise<ColumnTypes> {
  globalForDb.__koshColumns ??= (async () => {
    const rows = await sql()<{ table_name: string; column_name: string; udt_name: string }[]>`
      select table_name, column_name, udt_name
      from information_schema.columns
      where table_schema = 'public' and table_name in ${sql()(TABLES.map((t) => t.table))}`;
    const types: ColumnTypes = new Map();
    for (const r of rows) {
      if (!types.has(r.table_name)) types.set(r.table_name, new Map());
      types.get(r.table_name)!.set(r.column_name, r.udt_name);
    }
    const missing = TABLES.filter((t) => !types.has(t.table) && !OPTIONAL_TABLES.has(t.table)).map((t) => t.table);
    if (missing.length) {
      throw new Error(`Database tables missing (${missing.join(", ")}). Run supabase/schema.sql in the Supabase SQL editor first.`);
    }
    return types;
  })().catch((e) => {
    globalForDb.__koshColumns = undefined; // retry on the next request
    throw e;
  });
  return globalForDb.__koshColumns;
}

/* ───────────── Change counter (in-memory cache) ───────────── */

/** Whether the change-counter migration has run. Re-checked every 30 s until it has. */
async function hasCounter(): Promise<boolean> {
  const known = globalForDb.__koshCounter;
  if (known && (known.available || Date.now() - known.checkedAt < 30_000)) return known.available;
  const [{ ok }] = await sql()<{ ok: boolean }[]>`select to_regclass('public.app_state') is not null as ok`;
  if (!ok) warnOnce("app_state", "[db] app_state is missing — run supabase/migrations/20261006_change_counter.sql to cache the database (every request reloads it until then).");
  globalForDb.__koshCounter = { available: ok, checkedAt: Date.now() };
  return ok;
}

/**
 * Finds the `v` column in the result of a multi-statement ("simple") query. postgres.js
 * returns one row list per statement, except when the last statement has no rows (e.g.
 * COMMIT): then it returns a single flat list.
 */
function versionFrom(result: unknown): string {
  const lists = (Array.isArray(result) && Array.isArray(result[0]) ? result : [result]) as { v?: unknown }[][];
  for (let i = lists.length - 1; i >= 0; i--) {
    for (const row of lists[i] ?? []) if (typeof row?.v === "string") return row.v;
  }
  throw new Error("app_state.version missing from query result");
}

async function readVersion(q: Sql): Promise<string> {
  const [{ v }] = await q<{ v: string }[]>`select version::text as v from app_state where id = 1`;
  return v;
}

/* ───────────── Record ⇄ row mapping ───────────── */

function toRow(spec: TableSpec, record: Row): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(record)) {
    const nestedKeys = spec.nested?.[k];
    if (nestedKeys) {
      const obj = (v ?? null) as Row | null;
      for (const nk of nestedKeys) row[`${snake(k)}_${snake(nk)}`] = obj ? (obj[nk] ?? null) : null;
    } else {
      row[snake(k)] = v ?? null;
    }
  }
  return row;
}

function fromRow(spec: TableSpec, row: Row, types: Map<string, string>): Row {
  const nestedColumns = new Map<string, [string, string]>();
  for (const [field, keys] of Object.entries(spec.nested ?? {})) {
    for (const nk of keys) nestedColumns.set(`${snake(field)}_${snake(nk)}`, [field, nk]);
  }
  const record: Row = {};
  const nested: Record<string, Row> = {};
  for (const [col, raw] of Object.entries(row)) {
    const type = types.get(col);
    const value = raw !== null && type === "timestamptz" ? new Date(raw as string).toISOString() : JSON_TYPES.has(type ?? "") ? decodeJson(raw) : raw;
    const hit = nestedColumns.get(col);
    if (hit) (nested[hit[0]] ??= {})[hit[1]] = value;
    else record[camel(col)] = value;
  }
  for (const [field, obj] of Object.entries(nested)) {
    record[field] = Object.values(obj).every((v) => v === null) ? null : obj;
  }
  return record;
}

const JSON_TYPES = new Set(["json", "jsonb"]);

/**
 * Rows saved before the jsonb fix hold their JSON as a JSON *string*
 * ("{\"device\":…}") — read those back as the object they encode.
 */
function decodeJson(raw: unknown): unknown {
  if (typeof raw !== "string" || !/^\s*[{[]/.test(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Deep equality for plain JSON-like values (key order ignored; undefined treated as null). */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || a === null || b === undefined || b === null) return (a ?? null) === (b ?? null);
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => equal(v, bb[i]));
  }
  const ar = a as Row;
  const br = b as Row;
  for (const k of Object.keys(ar)) if (!equal(ar[k], br[k])) return false;
  for (const k of Object.keys(br)) if (!(k in ar) && !equal(undefined, br[k])) return false;
  return true;
}

/** Records of one table keyed by primary key (unconverted — rows are built only for changed records). */
function recordsOf(spec: TableSpec, db: DbState): Map<string, Row> {
  const out = new Map<string, Row>();
  const collection = db[spec.key] as unknown;
  if (collection === undefined) return out; // table not migrated yet
  if (spec.map) {
    for (const [k, v] of Object.entries(collection as Record<string, Row>)) out.set(k, v);
  } else {
    const pkField = camel(spec.pk);
    for (const rec of collection as Row[]) out.set(String(rec[pkField]), rec);
  }
  return out;
}

function rowOf(spec: TableSpec, pk: string, rec: Row): Row {
  return spec.map ? toRow(spec, { [camel(spec.map.keyColumn)]: pk, ...rec }) : toRow(spec, rec);
}

/* ───────────── Load ───────────── */

async function loadAll(tx: Sql, withVersion: boolean): Promise<{ db: DbState; version: string | null }> {
  const types = await columnTypes();
  const select = TABLES.filter((t) => types.has(t.table))
    .map((t) => `'${t.table}', (select coalesce(json_agg(r), '[]'::json) from "${t.table}" r)`)
    .join(", ");
  // The version is read in the same statement, so it matches the rows exactly.
  const [{ data, version }] = await tx.unsafe<{ data: Record<string, Row[]>; version: string | null }[]>(
    `select json_build_object(${select}) as data, ${withVersion ? "(select version::text from app_state where id = 1)" : "null::text"} as version`,
  );

  const db = { version: DB_VERSION, seededAt: new Date().toISOString() } as DbState;
  for (const spec of TABLES) {
    if (!types.has(spec.table) && UNDEFINED_WHEN_MISSING.has(spec.table)) continue;
    const rows = (data[spec.table] ?? []).map((r) => fromRow(spec, r, types.get(spec.table) ?? new Map()));
    if (spec.map) {
      const keyField = camel(spec.map.keyColumn);
      const map: Record<string, Row> = {};
      for (const r of rows) {
        const { [keyField]: k, ...rest } = r;
        map[String(k)] = rest;
      }
      (db as unknown as Record<string, unknown>)[spec.key] = map;
    } else {
      (db as unknown as Record<string, unknown>)[spec.key] = rows;
    }
  }
  return { db, version };
}

/* ───────────── Save (diff) ───────────── */

function toParam(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Saves the difference; returns how many statements ran (each one bumps app_state.version once). */
async function saveDiff(tx: Sql, before: DbState, after: DbState): Promise<number> {
  const types = await columnTypes();
  let statements = 0;
  for (const spec of TABLES) {
    const cols = types.get(spec.table);
    const old = recordsOf(spec, before);
    const next = recordsOf(spec, after);

    const changed: Row[] = [];
    for (const [pk, rec] of next) {
      if (!old.has(pk) || !equal(old.get(pk), rec)) changed.push(rowOf(spec, pk, rec));
    }
    const removed = [...old.keys()].filter((pk) => !next.has(pk));

    if (!cols) {
      if (changed.length || removed.length) {
        warnOnce(spec.table, `[db] Table ${spec.table} is missing — run supabase/migrations to store it. Skipping for now.`);
      }
      continue;
    }

    if (changed.length) {
      const optional = (OPTIONAL_COLUMNS[spec.table] ?? []).filter((c) => !cols.has(c));
      for (const c of optional) {
        warnOnce(`${spec.table}.${c}`, `[db] Column ${spec.table}.${c} is missing — run supabase/migrations to store it. Skipping for now.`);
      }
      const columns = Object.keys(changed[0]).filter((c) => !optional.includes(c));
      const unknown = columns.filter((c) => !cols.has(c));
      if (unknown.length) throw new Error(`Column(s) ${unknown.join(", ")} missing in table ${spec.table}. Re-run supabase/schema.sql.`);
      const perChunk = Math.max(1, Math.floor(20_000 / columns.length));
      for (let i = 0; i < changed.length; i += perChunk) {
        const chunk = changed.slice(i, i + perChunk);
        const params: (string | null)[] = [];
        const values = chunk
          // JSON goes in as text and is cast once: a parameter typed jsonb would make
          // postgres.js JSON-encode the already-encoded string a second time.
          .map((row) => `(${columns.map((c) => { params.push(toParam(row[c])); return JSON_TYPES.has(cols.get(c) ?? "") ? `$${params.length}::text::"${cols.get(c)}"` : `$${params.length}::"${cols.get(c)}"`; }).join(", ")})`)
          .join(", ");
        const update = columns.filter((c) => c !== spec.pk).map((c) => `"${c}" = excluded."${c}"`).join(", ");
        await tx.unsafe(
          `insert into "${spec.table}" (${columns.map((c) => `"${c}"`).join(", ")}) values ${values}
           on conflict ("${spec.pk}") do ${update ? `update set ${update}` : "nothing"}`,
          params,
        );
        statements++;
      }
    }
    if (removed.length) {
      for (let i = 0; i < removed.length; i += 5000) {
        const chunk = removed.slice(i, i + 5000);
        await tx.unsafe(`delete from "${spec.table}" where "${spec.pk}" in (${chunk.map((_, j) => `$${j + 1}`).join(", ")})`, chunk);
        statements++;
      }
    }
  }
  return statements;
}

/* ───────────── Backend ───────────── */

const WRITE_LOCK = 7_274_201; // arbitrary app-wide advisory-lock id

export const dbStore: StoreBackend = {
  async read(fn) {
    const counter = await hasCounter();
    if (counter) {
      const cache = globalForDb.__koshCache;
      if (cache && cache.version === (await readVersion(sql()))) return fn(cache.db);
    }
    const { db, version } = await loadAll(sql(), counter);
    if (version !== null) globalForDb.__koshCache = { version, db };
    return fn(db);
  },

  async write<T>(fn: (draft: DbState) => T | Promise<T>): Promise<T> {
    let result!: T;
    // Introspect before taking a pooled connection for the transaction —
    // doing it inside would wait for a second connection (deadlock at pool size 1).
    await columnTypes();
    const counter = await hasCounter();
    let nextCache: Cache | null = null;
    // A reserved connection with explicit BEGIN/COMMIT: sql.begin() needs
    // pipelining, which is turned off for the transaction pooler (see NO_PIPELINING).
    const tx = await sql().reserve();
    try {
      try {
        // BEGIN + lock + version in ONE round trip (a "simple" multi-statement query; no parameters).
        const opening = await tx
          .unsafe(`begin; select pg_advisory_xact_lock(${WRITE_LOCK});${counter ? " select version::text as v from app_state where id = 1;" : ""}`)
          .simple();
        const lockedVersion = counter ? versionFrom(opening) : null;

        let current: DbState;
        let base: string | null;
        const cache = globalForDb.__koshCache;
        if (counter && cache && cache.version === lockedVersion) {
          current = cache.db;
          base = cache.version;
        } else {
          const loaded = await loadAll(tx, counter);
          current = loaded.db;
          base = loaded.version;
        }
        const draft = structuredClone(current);
        result = await fn(draft);
        assertInvariants(draft);
        const statements = await saveDiff(tx, current, draft);

        // Read the new version and COMMIT in one round trip. Keep the result as the cache only if
        // nobody else changed the database meanwhile (e.g. an edit in the Supabase dashboard):
        // then the version moved by exactly our statements.
        let after = base;
        if (base !== null && statements > 0) {
          const closing = await tx.unsafe("select version::text as v from app_state where id = 1; commit").simple();
          try {
            after = versionFrom(closing);
          } catch {
            after = null; // already committed — just don't keep a cache we can't verify
          }
        } else {
          await tx`commit`;
        }
        if (base !== null && after !== null) {
          nextCache = BigInt(after) === BigInt(base) + BigInt(statements) ? { version: after, db: draft } : null;
        }
        if (counter) globalForDb.__koshCache = nextCache;
      } catch (err) {
        await tx`rollback`.catch(() => undefined);
        throw err;
      }
    } finally {
      tx.release();
    }
    return result;
  },
};

/**
 * Counts a model call against the user's AI budget and caches the wording, in
 * a few small statements under the same lock as write() — without loading the
 * whole database. Cache rows and rate-limit counters are not ledger data.
 */
export async function recordAiNote(input: { rateKey: string; limit: number; windowMs: number; note: AiInsightRecord | null }) {
  const types = await columnTypes();
  const counter = await hasCounter();
  const tx = await sql().reserve();
  try {
    await tx`begin`;
    try {
      await tx`select pg_advisory_xact_lock(${WRITE_LOCK})`;
      const before = counter ? await readVersion(tx) : null;
      let statements = 1;
      const now = Date.now();
      // Same fixed window as consumeRateLimit(): a new window starts at 1; otherwise count up to the limit.
      const [bucket] = await tx<{ count: number; reset_at: string }[]>`
        insert into rate_limits (key, count, reset_at) values (${input.rateKey}, 1, ${now + input.windowMs})
        on conflict (key) do update set
          count = case when rate_limits.reset_at <= ${now} then 1 else least(rate_limits.count + 1, ${input.limit}) end,
          reset_at = case when rate_limits.reset_at <= ${now} then excluded.reset_at else rate_limits.reset_at end
        returning count, reset_at::text as reset_at`;
      const note = input.note && types.has("ai_insights") ? input.note : null;
      if (note) {
        // Keep one entry per user, kind and language, and nothing older than two days.
        await tx`delete from ai_insights where created_at < now() - interval '2 days' or (user_id = ${note.userId} and kind = ${note.kind} and language = ${note.language})`;
        await tx`
          insert into ai_insights (id, user_id, kind, language, input_hash, payload, model, created_at)
          values (${note.id}, ${note.userId}, ${note.kind}, ${note.language}, ${note.inputHash}, ${JSON.stringify(note.payload)}::text::jsonb, ${note.model}, ${note.createdAt}::timestamptz)`;
        statements += 2;
      }
      const after = counter ? await readVersion(tx) : null;
      await tx`commit`;

      // Apply the same change to the in-memory copy if it was current and nobody else wrote meanwhile.
      const cache = globalForDb.__koshCache;
      if (cache && before !== null && after !== null && cache.version === before && BigInt(after) === BigInt(before) + BigInt(statements)) {
        const cutoff = Date.now() - 2 * 86_400_000;
        const aiInsights = note
          ? [
              ...cache.db.aiInsights.filter(
                (a) => Date.parse(a.createdAt) >= cutoff && !(a.userId === note.userId && a.kind === note.kind && a.language === note.language),
              ),
              note,
            ]
          : cache.db.aiInsights;
        const rateLimits = { ...cache.db.rateLimits, [input.rateKey]: { count: bucket.count, resetAt: Number(bucket.reset_at) } };
        globalForDb.__koshCache = { version: after, db: { ...cache.db, aiInsights, rateLimits } };
      } else if (counter) {
        globalForDb.__koshCache = null;
      }
    } catch (err) {
      await tx`rollback`.catch(() => undefined);
      throw err;
    }
  } finally {
    tx.release();
  }
}

/* ───────────── Profile pictures (bytes kept out of the snapshot) ───────────── */

export interface AvatarRow {
  id: string;
  userId: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

const globalForAvatars = globalThis as unknown as { __koshAvatarsReady?: boolean };

/** True once supabase/migrations/20261006_profile_pictures.sql has been run. */
export async function avatarsReady(): Promise<boolean> {
  if (globalForAvatars.__koshAvatarsReady) return true;
  const types = await columnTypes();
  const [{ ok }] = await sql()<{ ok: boolean }[]>`select to_regclass('public.avatars') is not null as ok`;
  const ready = ok && !!types.get("users")?.has("avatar_id");
  // Only cache success, so running the migration takes effect without a restart.
  if (ready) globalForAvatars.__koshAvatarsReady = true;
  return ready;
}

export async function saveAvatar(row: AvatarRow & { data: Uint8Array }) {
  await sql()`
    insert into avatars (id, user_id, mime_type, size_bytes, sha256, data)
    values (${row.id}, ${row.userId}, ${row.mimeType}, ${row.sizeBytes}, ${row.sha256}, ${Buffer.from(row.data)})`;
}

export async function findAvatar(id: string): Promise<(AvatarRow & { createdAt: string }) | null> {
  const [r] = await sql()<{ id: string; user_id: string | null; mime_type: string; size_bytes: number; sha256: string; created_at: Date }[]>`
    select id, user_id, mime_type, size_bytes, sha256, created_at from avatars where id = ${id}`;
  return r ? { id: r.id, userId: r.user_id, mimeType: r.mime_type, sizeBytes: r.size_bytes, sha256: r.sha256, createdAt: new Date(r.created_at).toISOString() } : null;
}

export async function readAvatar(id: string): Promise<{ mimeType: string; sha256: string; data: Buffer } | null> {
  const [r] = await sql()<{ mime_type: string; sha256: string; data: Buffer }[]>`select mime_type, sha256, data from avatars where id = ${id}`;
  return r ? { mimeType: r.mime_type, sha256: r.sha256, data: r.data } : null;
}

/** Gives a registration upload to the new account. */
export async function assignAvatar(id: string, userId: string) {
  await sql()`update avatars set user_id = ${userId} where id = ${id} and user_id is null`;
}

/**
 * Deletes the user's pictures other than `keep`, and registration uploads
 * nobody claimed within a day.
 */
export async function pruneAvatars(userId: string, keep: string | null) {
  await sql()`delete from avatars where (user_id = ${userId} and id is distinct from ${keep}) or (user_id is null and created_at < now() - interval '1 day')`;
}

/* ───────────── Verification document files (bytes kept out of the snapshot) ───────────── */

const globalForDocs = globalThis as unknown as { __koshDocFilesReady?: boolean };

/** True once supabase/migrations/20261007_document_files.sql has been run. */
export async function documentFilesReady(): Promise<boolean> {
  if (globalForDocs.__koshDocFilesReady) return true;
  const [{ ok }] = await sql()<{ ok: boolean }[]>`select to_regclass('public.document_files') is not null as ok`;
  // Only cache success, so running the migration takes effect without a restart.
  if (ok) globalForDocs.__koshDocFilesReady = true;
  return ok;
}

/** Stores the bytes of an uploaded document (its verification_documents row must already exist). */
export async function saveDocumentFile(row: { documentId: string; mimeType: string; sha256: string; data: Uint8Array }) {
  await sql()`
    insert into document_files (document_id, mime_type, size_bytes, sha256, data)
    values (${row.documentId}, ${row.mimeType}, ${row.data.byteLength}, ${row.sha256}, ${Buffer.from(row.data)})`;
}

export async function readDocumentFile(documentId: string): Promise<{ mimeType: string; sha256: string; data: Buffer } | null> {
  if (!(await documentFilesReady())) return null;
  const [r] = await sql()<{ mime_type: string; sha256: string; data: Buffer }[]>`
    select mime_type, sha256, data from document_files where document_id = ${documentId}`;
  return r ? { mimeType: r.mime_type, sha256: r.sha256, data: r.data } : null;
}

/** An unrevoked, unexpired session (for routes outside /api/rpc that only need "is signed in"). */
export async function sessionActive(sessionId: string): Promise<boolean> {
  const [r] = await sql()<{ ok: boolean }[]>`
    select exists(select 1 from sessions where id = ${sessionId} and revoked_at is null and expires_at > now()) as ok`;
  return !!r?.ok;
}
