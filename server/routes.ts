import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getBotStats, getClient } from "./bot/index";
import { getAllCommands } from "./bot/commands/index";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get bot stats
  app.get("/api/bot/stats", async (req, res) => {
    try {
      const stats = getBotStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching bot stats:", error);
      res.status(500).json({ error: "Failed to fetch bot stats" });
    }
  });

  // Get all commands
  app.get("/api/commands", async (req, res) => {
    try {
      const category = req.query.category?.toString().toUpperCase();
      const commands = getAllCommands();
      
      if (category) {
        const filteredCommands = commands.filter(cmd => cmd.category === category);
        return res.json(filteredCommands);
      }
      
      res.json(commands);
    } catch (error) {
      console.error("Error fetching commands:", error);
      res.status(500).json({ error: "Failed to fetch commands" });
    }
  });

  // Get activity logs
  app.get("/api/activity-logs", async (req, res) => {
    try {
      const serverId = req.query.serverId?.toString();
      const limit = req.query.limit ? parseInt(req.query.limit.toString()) : 10;
      
      if (!serverId) {
        return res.status(400).json({ error: "Server ID is required" });
      }
      
      const logs = await storage.getActivityLogs(serverId, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  // Get servers
  app.get("/api/servers", async (req, res) => {
    try {
      const servers = await storage.getServers();
      res.json(servers);
    } catch (error) {
      console.error("Error fetching servers:", error);
      res.status(500).json({ error: "Failed to fetch servers" });
    }
  });

  // Get server by ID
  app.get("/api/servers/:id", async (req, res) => {
    try {
      const server = await storage.getServer(req.params.id);
      
      if (!server) {
        return res.status(404).json({ error: "Server not found" });
      }
      
      res.json(server);
    } catch (error) {
      console.error("Error fetching server:", error);
      res.status(500).json({ error: "Failed to fetch server" });
    }
  });

  // Update server settings
  app.patch("/api/servers/:id", async (req, res) => {
    try {
      const serverId = req.params.id;
      const updates = req.body;
      
      const server = await storage.updateServer(serverId, updates);
      
      if (!server) {
        return res.status(404).json({ error: "Server not found" });
      }
      
      res.json(server);
    } catch (error) {
      console.error("Error updating server:", error);
      res.status(500).json({ error: "Failed to update server" });
    }
  });

  // Get blocked ping users for a server
  app.get("/api/servers/:id/ping-blocked", async (req, res) => {
    try {
      const serverId = req.params.id;
      
      const blockedUsers = await storage.getPingBlockedUsers(serverId);
      res.json(blockedUsers);
    } catch (error) {
      console.error("Error fetching ping blocked users:", error);
      res.status(500).json({ error: "Failed to fetch ping blocked users" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
