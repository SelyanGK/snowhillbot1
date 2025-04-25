import {
  type Server,
  type InsertServer,
  type ActivityLog,
  type InsertActivityLog,
  type CommandCooldown,
  type InsertCommandCooldown,
  type PingBlockedUser,
  type InsertPingBlockedUser,
  type User,
  type InsertUser
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Server methods
  getServer(id: string): Promise<Server | undefined>;
  getServers(): Promise<Server[]>;
  createServer(server: InsertServer): Promise<Server>;
  updateServer(id: string, server: Partial<InsertServer>): Promise<Server | undefined>;
  
  // Activity log methods
  getActivityLogs(serverId: string, limit?: number): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  
  // Command cooldown methods
  getCommandCooldown(userId: string, command: string): Promise<CommandCooldown | undefined>;
  createCommandCooldown(cooldown: InsertCommandCooldown): Promise<CommandCooldown>;
  deleteExpiredCooldowns(): Promise<void>;
  
  // Ping blocked users methods
  getPingBlockedUsers(serverId: string): Promise<PingBlockedUser[]>;
  getPingBlockedUser(serverId: string, userId: string): Promise<PingBlockedUser | undefined>;
  createPingBlockedUser(blockedUser: InsertPingBlockedUser): Promise<PingBlockedUser>;
  deletePingBlockedUser(serverId: string, userId: string): Promise<boolean>;
  
  // Ping violations methods
  getPingViolations(serverId: string, userId: string): Promise<PingViolation | undefined>;
  updatePingViolationCount(serverId: string, userId: string, count: number): Promise<PingViolation>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private servers: Map<string, Server>;
  private activityLogs: ActivityLog[];
  private commandCooldowns: CommandCooldown[];
  private pingBlockedUsers: PingBlockedUser[];
  private pingViolations: Map<string, PingViolation>; // Key format: serverId:userId
  private userIdCounter: number;
  private activityLogIdCounter: number;
  private cooldownIdCounter: number;
  private pingBlockedUserIdCounter: number;
  private pingViolationIdCounter: number;

  constructor() {
    this.users = new Map();
    this.servers = new Map();
    this.activityLogs = [];
    this.commandCooldowns = [];
    this.pingBlockedUsers = [];
    this.pingViolations = new Map();
    this.userIdCounter = 1;
    this.activityLogIdCounter = 1;
    this.cooldownIdCounter = 1;
    this.pingBlockedUserIdCounter = 1;
    this.pingViolationIdCounter = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Server methods
  async getServer(id: string): Promise<Server | undefined> {
    return this.servers.get(id);
  }

  async getServers(): Promise<Server[]> {
    return Array.from(this.servers.values());
  }

  async createServer(insertServer: InsertServer): Promise<Server> {
    const server: Server = {
      ...insertServer,
      addedAt: new Date()
    };
    this.servers.set(server.id, server);
    return server;
  }

  async updateServer(id: string, partialServer: Partial<InsertServer>): Promise<Server | undefined> {
    const server = await this.getServer(id);
    if (!server) return undefined;

    const updatedServer: Server = {
      ...server,
      ...partialServer,
    };
    
    this.servers.set(id, updatedServer);
    return updatedServer;
  }

  // Activity log methods
  async getActivityLogs(serverId: string, limit = 10): Promise<ActivityLog[]> {
    return this.activityLogs
      .filter(log => log.serverId === serverId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async createActivityLog(insertLog: InsertActivityLog): Promise<ActivityLog> {
    const id = this.activityLogIdCounter++;
    const log: ActivityLog = {
      ...insertLog,
      id,
      timestamp: new Date(),
    };
    this.activityLogs.push(log);
    return log;
  }

  // Command cooldown methods
  async getCommandCooldown(userId: string, command: string): Promise<CommandCooldown | undefined> {
    return this.commandCooldowns.find(
      cooldown => cooldown.userId === userId && cooldown.command === command
    );
  }

  async createCommandCooldown(insertCooldown: InsertCommandCooldown): Promise<CommandCooldown> {
    const id = this.cooldownIdCounter++;
    const cooldown: CommandCooldown = {
      ...insertCooldown,
      id,
    };
    this.commandCooldowns.push(cooldown);
    return cooldown;
  }

  async deleteExpiredCooldowns(): Promise<void> {
    const now = new Date();
    this.commandCooldowns = this.commandCooldowns.filter(
      cooldown => cooldown.expiresAt > now
    );
  }

  // Ping blocked users methods
  async getPingBlockedUsers(serverId: string): Promise<PingBlockedUser[]> {
    return this.pingBlockedUsers.filter(
      blockedUser => blockedUser.serverId === serverId
    );
  }

  async getPingBlockedUser(serverId: string, userId: string): Promise<PingBlockedUser | undefined> {
    return this.pingBlockedUsers.find(
      blockedUser => blockedUser.serverId === serverId && blockedUser.userId === userId
    );
  }

  async createPingBlockedUser(insertBlockedUser: InsertPingBlockedUser): Promise<PingBlockedUser> {
    const id = this.pingBlockedUserIdCounter++;
    const blockedUser: PingBlockedUser = {
      ...insertBlockedUser,
      id,
      timestamp: new Date(),
    };
    this.pingBlockedUsers.push(blockedUser);
    return blockedUser;
  }

  async deletePingBlockedUser(serverId: string, userId: string): Promise<boolean> {
    const initialLength = this.pingBlockedUsers.length;
    this.pingBlockedUsers = this.pingBlockedUsers.filter(
      blockedUser => !(blockedUser.serverId === serverId && blockedUser.userId === userId)
    );
    return initialLength !== this.pingBlockedUsers.length;
  }
}

export const storage = new MemStorage();
