import { dummy, type InsertDummy, type Dummy } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getDummies(): Promise<Dummy[]>;
}

export class DatabaseStorage implements IStorage {
  async getDummies(): Promise<Dummy[]> {
    try {
      return await db.select().from(dummy);
    } catch (e) {
      return [];
    }
  }
}

export const storage = new DatabaseStorage();
