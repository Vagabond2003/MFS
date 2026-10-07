/**
 * The database the end-to-end tests run against: E2E_DATABASE_URL, which must
 * be a throwaway PostgreSQL on this machine. Every run rebuilds it from
 * supabase/schema.sql + seed.sql (deleting all data), so this refuses any
 * other host, and any database whose name doesn't say it's for tests.
 * DATABASE_URL (which may point at the live Supabase project) is never read.
 */
export function e2eDatabaseUrl(): string {
  const raw = process.env.E2E_DATABASE_URL;
  if (!raw) {
    throw new Error(
      "E2E_DATABASE_URL is not set. Point it at a throwaway local PostgreSQL, e.g. postgres://postgres:postgres@127.0.0.1:5432/kosh_e2e (see README → Tests).",
    );
  }
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const name = url.pathname.slice(1);
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`E2E_DATABASE_URL must point at this machine (got host "${host}"). The tests delete all data in it.`);
  }
  if (!/e2e|test/i.test(name)) {
    throw new Error(`E2E_DATABASE_URL's database name must contain "e2e" or "test" (got "${name}"). The tests delete all data in it.`);
  }
  return raw;
}
