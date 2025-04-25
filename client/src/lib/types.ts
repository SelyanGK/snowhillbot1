export enum CommandCategory {
  FUN = "FUN",
  MODERATION = "MODERATION",
  UTILITY = "UTILITY",
  ANTIPING = "ANTIPING"
}

export interface Command {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  category: CommandCategory;
  cooldown: number;
  requiredPermissions: string[];
}

export interface BotStats {
  serverCount: number;
  userCount: number;
  commandsUsed: number;
  moderationActionsCount: number;
  uptime?: number;
  isReady?: boolean;
}

export interface ActivityLog {
  id: number;
  serverId: string;
  userId: string;
  username: string;
  command: string;
  timestamp: Date;
}

export interface Server {
  id: string;
  name: string;
  prefix: string;
  antiPingEnabled: boolean;
  antiPingExcludedRoles: string[];
  antiPingPunishment: string;
  addedAt: Date;
}
