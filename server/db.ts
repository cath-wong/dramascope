import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // Graceful fallback for this app since we just load CSVs from frontend.
  console.log("DATABASE_URL is missing. DB won't work.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/postgres" });
export const db = drizzle(pool, { schema });
