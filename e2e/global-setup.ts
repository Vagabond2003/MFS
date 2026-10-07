import { readFileSync } from "node:fs";
import postgres from "postgres";
import { e2eDatabaseUrl } from "./database";

/** Rebuilds the throwaway E2E database: schema, the seed accounts, and e2e/fixtures.sql. */
export default async function globalSetup() {
  const sql = postgres(e2eDatabaseUrl(), { ssl: false, max: 1, onnotice: () => undefined });
  try {
    for (const file of ["supabase/schema.sql", "supabase/seed.sql", "e2e/fixtures.sql"]) {
      await sql.unsafe(readFileSync(file, "utf8")).simple();
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
