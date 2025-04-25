import { CommandCategory } from "@shared/schema";
import { Client, Message, PermissionResolvable } from "discord.js";
import { storage } from "../storage";

// Command interface
export interface Command {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  category: CommandCategory;
  cooldown: number;
  requiredPermissions: PermissionResolvable[];
  execute: (message: Message, args: string[], client: Client) => Promise<any>;
}

// Date utility to format dates
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Check if a command is on cooldown
export async function hasCooldown(key: string): Promise<boolean> {
  // Parse the key
  const [userId, command] = key.split(':');
  
  // Check if cooldown exists in DB
  const cooldown = await storage.getCommandCooldown(userId, command);
  
  return !!cooldown;
}

// Check how much time is left on a cooldown
export async function checkCooldown(key: string): Promise<number> {
  // Parse the key
  const [userId, command] = key.split(':');
  
  // Get cooldown from DB
  const cooldown = await storage.getCommandCooldown(userId, command);
  
  // If no cooldown, return 0
  if (!cooldown) {
    return 0;
  }
  
  // Calculate remaining time
  const now = new Date();
  const expiresAt = cooldown.expiresAt;
  const remainingTime = (expiresAt.getTime() - now.getTime()) / 1000; // in seconds
  
  // If already expired, return 0
  if (remainingTime <= 0) {
    return 0;
  }
  
  return remainingTime;
}

// Set a cooldown for a command
export async function setCooldown(key: string, duration: number): Promise<void> {
  // Parse the key
  const [userId, command] = key.split(':');
  
  // Calculate expiry time
  const expiresAt = new Date(Date.now() + duration * 1000);
  
  // Save to DB
  await storage.createCommandCooldown({
    userId,
    command,
    expiresAt
  });
}

// Generate a random integer between min and max (inclusive)
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Validate and sanitize user input
export function sanitizeInput(input: string): string {
  // Remove dangerous characters and limit length
  return input
    .replace(/[^\w\s.,!?@#$%^&*()\[\]{}:;'"<>\/\\-_+=]/g, '')
    .substring(0, 1000);
}

// Check if a string is a valid URL
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Format duration in milliseconds to human-readable string
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  
  const parts = [];
  
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

// Parse emoji from string
export function parseEmoji(text: string): { id: string; name: string; animated: boolean } | null {
  const emojiRegex = /<(a)?:(\w+):(\d+)>/;
  const match = text.match(emojiRegex);
  
  if (!match) return null;
  
  return {
    animated: !!match[1],
    name: match[2],
    id: match[3]
  };
}

// Chunk an array into smaller arrays of a specified size
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  
  return chunks;
}

// Get user permission level for a guild (0 = normal user, 1 = moderator, 2 = admin, 3 = owner)
export function getUserPermissionLevel(message: Message): number {
  if (!message.guild) return 0;
  
  if (message.guild.ownerId === message.author.id) {
    return 3; // Guild owner
  }
  
  const member = message.member;
  if (!member) return 0;
  
  if (member.permissions.has('Administrator')) {
    return 2; // Admin
  }
  
  if (member.permissions.has(['KickMembers', 'BanMembers', 'ManageMessages'])) {
    return 1; // Moderator
  }
  
  return 0; // Normal user
}
