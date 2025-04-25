import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Command categories enum
export enum CommandCategory {
  FUN = "FUN",
  MODERATION = "MODERATION",
  UTILITY = "UTILITY",
  ANTIPING = "ANTIPING"
}

// User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Discord server (guild) schema
export const servers = pgTable("servers", {
  id: text("id").primaryKey(), // Discord server ID
  name: text("name").notNull(),
  prefix: text("prefix").notNull().default("!"),
  antiPingEnabled: boolean("anti_ping_enabled").notNull().default(false),
  antiPingExcludedRoles: text("anti_ping_excluded_roles").array(),
  antiPingBypassRole: text("anti_ping_bypass_role"),
  antiPingProtectedRole: text("anti_ping_protected_role"),
  antiPingPunishment: text("anti_ping_punishment").default("escalate"), // Changed default to escalate for progressive timeouts
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertServerSchema = createInsertSchema(servers).omit({
  addedAt: true,
});

// Activity log schema
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  command: text("command").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  timestamp: true,
});

// Command cooldown schema
export const commandCooldowns = pgTable("command_cooldowns", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  command: text("command").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertCommandCooldownSchema = createInsertSchema(commandCooldowns).omit({
  id: true,
});

// Ping violation counts (for escalating timeouts)
export const pingViolations = pgTable("ping_violations", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  count: integer("count").notNull().default(0),
  lastViolation: timestamp("last_violation").defaultNow().notNull(),
});

export const insertPingViolationSchema = createInsertSchema(pingViolations).omit({
  id: true,
  lastViolation: true,
});

// Ping blocked users schema
export const pingBlockedUsers = pgTable("ping_blocked_users", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  blockedBy: text("blocked_by").notNull(),
  reason: text("reason"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertPingBlockedUserSchema = createInsertSchema(pingBlockedUsers).omit({
  id: true,
  timestamp: true,
});

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Server = typeof servers.$inferSelect;
export type InsertServer = z.infer<typeof insertServerSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type CommandCooldown = typeof commandCooldowns.$inferSelect;
export type InsertCommandCooldown = z.infer<typeof insertCommandCooldownSchema>;

export type PingViolation = typeof pingViolations.$inferSelect;
export type InsertPingViolation = z.infer<typeof insertPingViolationSchema>;

export type PingBlockedUser = typeof pingBlockedUsers.$inferSelect;
export type InsertPingBlockedUser = z.infer<typeof insertPingBlockedUserSchema>;