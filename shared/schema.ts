import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Command categories enum
export enum CommandCategory {
  FUN = "FUN",
  MODERATION = "MODERATION",
  UTILITY = "UTILITY",
  ANTIPING = "ANTIPING",
  GIVEAWAY = "GIVEAWAY"
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
  prefix: text("prefix").notNull().default("+"),
  antiPingEnabled: boolean("anti_ping_enabled").notNull().default(false),
  antiPingExcludedRoles: text("anti_ping_excluded_roles").array().default([]),
  antiPingBypassRoles: text("anti_ping_bypass_roles").array().default([]),
  antiPingProtectedRoles: text("anti_ping_protected_roles").array().default([]), 
  antiPingPunishment: text("anti_ping_punishment").default("escalate"), // Changed default to escalate for progressive timeouts
  logSettings: text("log_settings"), // JSON string containing log channel and enabled events
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

// Giveaway schema
export const giveaways = pgTable("giveaways", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  prize: text("prize").notNull(),
  winnerCount: integer("winner_count").notNull().default(1),
  hostId: text("host_id").notNull(), // User ID of who started the giveaway
  endTime: timestamp("end_time").notNull(), // When the giveaway ends
  hasEnded: boolean("has_ended").notNull().default(false),
  requiredRoleId: text("required_role_id"), // Optional role requirement to enter
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGiveawaySchema = createInsertSchema(giveaways).omit({
  id: true,
  hasEnded: true,
  createdAt: true,
});

// Giveaway entries schema
export const giveawayEntries = pgTable("giveaway_entries", {
  id: serial("id").primaryKey(),
  giveawayId: integer("giveaway_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(), 
  enteredAt: timestamp("entered_at").defaultNow().notNull(),
});

export const insertGiveawayEntrySchema = createInsertSchema(giveawayEntries).omit({
  id: true,
  enteredAt: true,
});

// Giveaway winners schema
export const giveawayWinners = pgTable("giveaway_winners", {
  id: serial("id").primaryKey(),
  giveawayId: integer("giveaway_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  selectedAt: timestamp("selected_at").defaultNow().notNull(),
  hasClaimed: boolean("has_claimed").notNull().default(false),
});

export const insertGiveawayWinnerSchema = createInsertSchema(giveawayWinners).omit({
  id: true,
  selectedAt: true,
  hasClaimed: true,
});

// Export giveaway types
export type Giveaway = typeof giveaways.$inferSelect;
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;

export type GiveawayEntry = typeof giveawayEntries.$inferSelect;
export type InsertGiveawayEntry = z.infer<typeof insertGiveawayEntrySchema>;

export type GiveawayWinner = typeof giveawayWinners.$inferSelect;
export type InsertGiveawayWinner = z.infer<typeof insertGiveawayWinnerSchema>;