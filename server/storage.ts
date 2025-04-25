import {
  type Server,
  type InsertServer,
  type ActivityLog,
  type InsertActivityLog,
  type CommandCooldown,
  type InsertCommandCooldown,
  type PingBlockedUser,
  type InsertPingBlockedUser,
  type PingViolation,
  type InsertPingViolation,
  type User,
  type InsertUser,
  type Giveaway,
  type InsertGiveaway,
  type GiveawayEntry,
  type InsertGiveawayEntry,
  type GiveawayWinner,
  type InsertGiveawayWinner
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

  // Giveaway methods
  createGiveaway(giveaway: InsertGiveaway): Promise<Giveaway>;
  getGiveaway(id: number): Promise<Giveaway | undefined>;
  getGiveawayByMessageId(messageId: string): Promise<Giveaway | undefined>;
  getActiveGiveaways(serverId: string): Promise<Giveaway[]>;
  getAllGiveaways(serverId: string, limit?: number): Promise<Giveaway[]>;
  updateGiveaway(id: number, hasEnded: boolean): Promise<Giveaway | undefined>;
  deleteGiveaway(id: number): Promise<boolean>;
  
  // Giveaway entry methods
  createGiveawayEntry(entry: InsertGiveawayEntry): Promise<GiveawayEntry>;
  getGiveawayEntries(giveawayId: number): Promise<GiveawayEntry[]>;
  getGiveawayEntry(giveawayId: number, userId: string): Promise<GiveawayEntry | undefined>;
  deleteGiveawayEntry(giveawayId: number, userId: string): Promise<boolean>;
  
  // Giveaway winner methods
  createGiveawayWinner(winner: InsertGiveawayWinner): Promise<GiveawayWinner>;
  getGiveawayWinners(giveawayId: number): Promise<GiveawayWinner[]>;
  updateGiveawayWinner(id: number, hasClaimed: boolean): Promise<GiveawayWinner | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private servers: Map<string, Server>;
  private activityLogs: ActivityLog[];
  private commandCooldowns: CommandCooldown[];
  private pingBlockedUsers: PingBlockedUser[];
  private pingViolations: Map<string, PingViolation>; // Key format: serverId:userId
  private giveaways: Map<number, Giveaway>;
  private giveawayEntries: GiveawayEntry[];
  private giveawayWinners: GiveawayWinner[];
  private userIdCounter: number;
  private activityLogIdCounter: number;
  private cooldownIdCounter: number;
  private pingBlockedUserIdCounter: number;
  private pingViolationIdCounter: number;
  private giveawayIdCounter: number;
  private giveawayEntryIdCounter: number;
  private giveawayWinnerIdCounter: number;

  constructor() {
    this.users = new Map();
    this.servers = new Map();
    this.activityLogs = [];
    this.commandCooldowns = [];
    this.pingBlockedUsers = [];
    this.pingViolations = new Map();
    this.giveaways = new Map();
    this.giveawayEntries = [];
    this.giveawayWinners = [];
    this.userIdCounter = 1;
    this.activityLogIdCounter = 1;
    this.cooldownIdCounter = 1;
    this.pingBlockedUserIdCounter = 1;
    this.pingViolationIdCounter = 1;
    this.giveawayIdCounter = 1;
    this.giveawayEntryIdCounter = 1;
    this.giveawayWinnerIdCounter = 1;
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

  // Ping violations methods
  async getPingViolations(serverId: string, userId: string): Promise<PingViolation | undefined> {
    const key = `${serverId}:${userId}`;
    return this.pingViolations.get(key);
  }

  async updatePingViolationCount(serverId: string, userId: string, count: number): Promise<PingViolation> {
    const key = `${serverId}:${userId}`;
    const existingViolation = this.pingViolations.get(key);
    
    if (existingViolation) {
      // Update existing violation
      const updatedViolation: PingViolation = {
        ...existingViolation,
        count,
        lastViolation: new Date()
      };
      this.pingViolations.set(key, updatedViolation);
      return updatedViolation;
    } else {
      // Create new violation
      const id = this.pingViolationIdCounter++;
      const newViolation: PingViolation = {
        id,
        serverId,
        userId,
        count,
        lastViolation: new Date()
      };
      this.pingViolations.set(key, newViolation);
      return newViolation;
    }
  }
  
  // Giveaway methods
  async createGiveaway(giveaway: InsertGiveaway): Promise<Giveaway> {
    const id = this.giveawayIdCounter++;
    const newGiveaway: Giveaway = {
      ...giveaway,
      id,
      hasEnded: false,
      createdAt: new Date()
    };
    this.giveaways.set(id, newGiveaway);
    return newGiveaway;
  }

  async getGiveaway(id: number): Promise<Giveaway | undefined> {
    return this.giveaways.get(id);
  }

  async getGiveawayByMessageId(messageId: string): Promise<Giveaway | undefined> {
    return Array.from(this.giveaways.values()).find(
      giveaway => giveaway.messageId === messageId
    );
  }

  async getActiveGiveaways(serverId: string): Promise<Giveaway[]> {
    return Array.from(this.giveaways.values())
      .filter(giveaway => giveaway.serverId === serverId && !giveaway.hasEnded)
      .sort((a, b) => a.endTime.getTime() - b.endTime.getTime());
  }

  async getAllGiveaways(serverId: string, limit = 10): Promise<Giveaway[]> {
    return Array.from(this.giveaways.values())
      .filter(giveaway => giveaway.serverId === serverId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async updateGiveaway(id: number, hasEnded: boolean): Promise<Giveaway | undefined> {
    const giveaway = await this.getGiveaway(id);
    if (!giveaway) return undefined;

    const updatedGiveaway: Giveaway = {
      ...giveaway,
      hasEnded
    };
    
    this.giveaways.set(id, updatedGiveaway);
    return updatedGiveaway;
  }

  async deleteGiveaway(id: number): Promise<boolean> {
    return this.giveaways.delete(id);
  }
  
  // Giveaway entry methods
  async createGiveawayEntry(entry: InsertGiveawayEntry): Promise<GiveawayEntry> {
    const id = this.giveawayEntryIdCounter++;
    const newEntry: GiveawayEntry = {
      ...entry,
      id,
      enteredAt: new Date()
    };
    this.giveawayEntries.push(newEntry);
    return newEntry;
  }

  async getGiveawayEntries(giveawayId: number): Promise<GiveawayEntry[]> {
    return this.giveawayEntries
      .filter(entry => entry.giveawayId === giveawayId)
      .sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
  }

  async getGiveawayEntry(giveawayId: number, userId: string): Promise<GiveawayEntry | undefined> {
    return this.giveawayEntries.find(
      entry => entry.giveawayId === giveawayId && entry.userId === userId
    );
  }

  async deleteGiveawayEntry(giveawayId: number, userId: string): Promise<boolean> {
    const initialLength = this.giveawayEntries.length;
    this.giveawayEntries = this.giveawayEntries.filter(
      entry => !(entry.giveawayId === giveawayId && entry.userId === userId)
    );
    return initialLength !== this.giveawayEntries.length;
  }
  
  // Giveaway winner methods
  async createGiveawayWinner(winner: InsertGiveawayWinner): Promise<GiveawayWinner> {
    const id = this.giveawayWinnerIdCounter++;
    const newWinner: GiveawayWinner = {
      ...winner,
      id,
      selectedAt: new Date(),
      hasClaimed: false
    };
    this.giveawayWinners.push(newWinner);
    return newWinner;
  }

  async getGiveawayWinners(giveawayId: number): Promise<GiveawayWinner[]> {
    return this.giveawayWinners
      .filter(winner => winner.giveawayId === giveawayId)
      .sort((a, b) => a.selectedAt.getTime() - b.selectedAt.getTime());
  }

  async updateGiveawayWinner(id: number, hasClaimed: boolean): Promise<GiveawayWinner | undefined> {
    const winnerIndex = this.giveawayWinners.findIndex(winner => winner.id === id);
    if (winnerIndex === -1) return undefined;

    const winner = this.giveawayWinners[winnerIndex];
    const updatedWinner: GiveawayWinner = {
      ...winner,
      hasClaimed
    };
    
    this.giveawayWinners[winnerIndex] = updatedWinner;
    return updatedWinner;
  }
}

export const storage = new MemStorage();
