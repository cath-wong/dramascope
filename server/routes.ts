import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get(api.dummy.list.path, async (req, res) => {
    const dummies = await storage.getDummies();
    res.json(dummies);
  });

  return httpServer;
}
