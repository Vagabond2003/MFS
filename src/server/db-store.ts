import postgres from "postgres";
import { ApiError } from "@/services/errors";
import { DB_VERSION, type DbState } from "@/services/mock/schema";
import { assertInvariants, type StoreBackend } from "@/services/mock/store";

/**
 * PostgreSQL (Supabase) persistence for the API handlers.
 *
 * Every call loads the current rows, so edits made directly in Supabase show
 * up in the app straight away. `write()` runs as ONE database transaction:
 *   1. take a global advisory lock (writes are serialised, like the mock queue)
 *   2. load all rows, let the handler mutate a copy
 *   3. check ledger invariants
 *   4. upsert changed rows / delete removed rows, then COMMIT
 * Any error rolls everything back, so a payment can never be half-saved.
 *
 * This loads whole tables per request: right for a prototype or hackathon
 * (thousands of rows), not for production volumes.
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
];

/**
 * Columns added by later migrations (supabase/migrations). If a database has not
 * been migrated yet they are skipped on save instead of failing every write.
 */
const OPTIONAL_COLUMNS: Record<string, string[]> = {
  users: ["language"],
  agent_profiles: ["district", "area"],
  merchant_businesses: ["district", "area"],
};
/** Tables added by later migrations: read as empty and not saved until the migration runs. */
const OPTIONAL_TABLES = new Set(["ai_insights"]);
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
const globalForDb = globalThis as unknown as { __koshSql?: Sql; __koshColumns?: Promise<ColumnTypes> };

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
    const value = raw !== null && type === "timestamptz" ? new Date(raw as string).toISOString() : raw;
    const hit = nestedColumns.get(col);
    if (hit) (nested[hit[0]] ??= {})[hit[1]] = value;
    else record[camel(col)] = value;
  }
  for (const [field, obj] of Object.entries(nested)) {
    record[field] = Object.values(obj).every((v) => v === null) ? null : obj;
  }
  return record;
}

/** JSON with object keys sorted — Postgres jsonb does not keep key order. */
function stable(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (typeof v === "object") {
    return `{${Object.keys(v as Row).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Row)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

function same(a: Row, b: Row) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (stable(a[k]) !== stable(b[k])) return false;
  }
  return true;
}

function rowsOf(spec: TableSpec, db: DbState): Map<string, Row> {
  const out = new Map<string, Row>();
  const collection = db[spec.key] as unknown;
  if (spec.map) {
    for (const [k, v] of Object.entries(collection as Record<string, Row>)) {
      out.set(k, toRow(spec, { [camel(spec.map.keyColumn)]: k, ...v }));
    }
  } else {
    for (const rec of collection as Row[]) {
      const row = toRow(spec, rec);
      out.set(String(row[spec.pk]), row);
    }
  }
  return out;
}

/* ───────────── Load ───────────── */

async function loadAll(tx: Sql): Promise<DbState> {
  const types = await columnTypes();
  const select = TABLES.filter((t) => types.has(t.table))
    .map((t) => `'${t.table}', (select coalesce(json_agg(r), '[]'::json) from "${t.table}" r)`)
    .join(", ");
  const [{ data }] = await tx.unsafe<{ data: Record<string, Row[]> }[]>(`select json_build_object(${select}) as data`);

  const db = { version: DB_VERSION, seededAt: new Date().toISOString() } as DbState;
  for (const spec of TABLES) {
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
  return db;
}

/* ───────────── Save (diff) ───────────── */

function toParam(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function saveDiff(tx: Sql, before: DbState, after: DbState) {
  const types = await columnTypes();
  for (const spec of TABLES) {
    const cols = types.get(spec.table);
    const old = rowsOf(spec, before);
    const next = rowsOf(spec, after);

    const changed = [...next.entries()].filter(([pk, row]) => !old.has(pk) || !same(old.get(pk)!, row)).map(([, row]) => row);
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
          .map((row) => `(${columns.map((c) => { params.push(toParam(row[c])); return `$${params.length}::"${cols.get(c)}"`; }).join(", ")})`)
          .join(", ");
        const update = columns.filter((c) => c !== spec.pk).map((c) => `"${c}" = excluded."${c}"`).join(", ");
        await tx.unsafe(
          `insert into "${spec.table}" (${columns.map((c) => `"${c}"`).join(", ")}) values ${values}
           on conflict ("${spec.pk}") do ${update ? `update set ${update}` : "nothing"}`,
          params,
        );
      }
    }
    if (removed.length) {
      for (let i = 0; i < removed.length; i += 5000) {
        const chunk = removed.slice(i, i + 5000);
        await tx.unsafe(`delete from "${spec.table}" where "${spec.pk}" in (${chunk.map((_, j) => `$${j + 1}`).join(", ")})`, chunk);
      }
    }
  }
}

/* ───────────── Backend ───────────── */

const WRITE_LOCK = 7_274_201; // arbitrary app-wide advisory-lock id

export const dbStore: StoreBackend = {
  async read(fn) {
    const db = await loadAll(sql());
    return fn(db);
  },

  async write<T>(fn: (draft: DbState) => T | Promise<T>): Promise<T> {
    let result!: T;
    // Introspect before taking a pooled connection for the transaction —
    // doing it inside would wait for a second connection (deadlock at pool size 1).
    await columnTypes();
    // A reserved connection with explicit BEGIN/COMMIT: sql.begin() needs
    // pipelining, which is turned off for the transaction pooler (see NO_PIPELINING).
    const tx = await sql().reserve();
    try {
      await tx`begin`;
      try {
        await tx`select pg_advisory_xact_lock(${WRITE_LOCK})`;
        const current = await loadAll(tx);
        const draft = structuredClone(current);
        result = await fn(draft);
        assertInvariants(draft);
        await saveDiff(tx, current, draft);
        await tx`commit`;
      } catch (err) {
        await tx`rollback`.catch(() => undefined);
        throw err;
      }
    } finally {
      tx.release();
    }
    return result;
  },

  async reset() {
    throw new ApiError("NOT_SUPPORTED", "Resetting is disabled when the app is connected to a real database.");
  },
};
