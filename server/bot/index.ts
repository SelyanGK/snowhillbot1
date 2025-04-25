import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { loadCommands } from './commands';
import { setupEvents } from './events';
import { setupSlashCommands } from './slash-commands';
import { deploySlashCommands } from './deploy-commands';
import { storage } from '../storage';
import { log } from '../vite';

// Define bot client and intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

// Store commands for access
client.commands = new Collection();

// Stats
let commandsUsed = 0;
let moderationActionsCount = 0;

// Initialize bot
export async function initBot() {
  try {
    // Load all commands
    const commands = await loadCommands();
    commands.forEach((command) => {
      client.commands.set(command.name, command);
    });

    // Setup event handlers
    setupEvents(client);
    setupSlashCommands(client);

    // Connect to Discord
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      throw new Error('DISCORD_BOT_TOKEN is required to start the bot');
    }

    await client.login(token);
    log(`Bot logged in as ${client.user?.tag}`, 'bot');
    
    // Register slash commands
    if (client.user) {
      try {
        await deploySlashCommands(client.user.id, token);
        log('Slash commands deployed successfully', 'bot');
      } catch (error) {
        console.error('Error deploying slash commands:', error);
        log('Failed to deploy slash commands', 'bot');
      }
    }
    
    // Set bot activity
    client.user?.setActivity('+help | .gg/snowhill', { type: 3 }); // 3 = Watching

    return client;
  } catch (error) {
    console.error('Failed to start bot:', error);
    throw error;
  }
}

// Bot statistics getters
export function getBotStats() {
  return {
    serverCount: client.guilds.cache.size,
    userCount: client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0),
    commandsUsed,
    moderationActionsCount,
    uptime: client.uptime,
    isReady: client.isReady()
  };
}

// Increment counters
export function incrementCommandsUsed() {
  commandsUsed++;
}

export function incrementModerationActions() {
  moderationActionsCount++;
}

// Helper to get default prefix
export async function getPrefix(guildId: string): Promise<string> {
  try {
    const server = await storage.getServer(guildId);
    return server?.prefix || '+';
  } catch (error) {
    console.error('Error getting prefix:', error);
    return '+'; // Default prefix
  }
}

// Use this to get a client reference outside this file
export function getClient() {
  return client;
}
