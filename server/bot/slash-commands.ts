import { Client, Interaction, CommandInteraction, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { storage } from '../storage';
import { log } from '../vite';
import { incrementCommandsUsed, incrementModerationActions } from './index';
import { CommandCategory } from '@shared/schema';
import { performance } from 'perf_hooks';

/**
 * Sets up slash command interaction handlers
 */
// This function is declared later in the file - no need to have it at the top level
// Will be removed here to avoid confusion

export function setupSlashCommands(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    try {
      await handleSlashCommand(interaction);
    } catch (error) {
      console.error('Error handling slash command:', error);
      
      // Respond with error if the interaction hasn't been replied to yet
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'There was an error executing this command.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: 'There was an error executing this command.',
          ephemeral: true
        });
      }
    }
  });
}

/**
 * Handles a slash command interaction
 */
async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  // Get the command from the text commands collection
  const { client, commandName } = interaction;
  const command = client.commands.get(commandName);
  
  if (!command) {
    await interaction.reply({
      content: `Command /${commandName} not found.`,
      ephemeral: true
    });
    return;
  }
  
  // Check permissions
  const memberPermissions = interaction.member?.permissions;
  if (command.requiredPermissions && command.requiredPermissions.length > 0) {
    if (!memberPermissions || !command.requiredPermissions.every(perm => memberPermissions.has(perm))) {
      await interaction.reply({
        content: `You don't have the required permissions to use this command.`,
        ephemeral: true
      });
      return;
    }
  }
  
  // Check cooldown
  if (command.cooldown > 0) {
    const userId = interaction.user.id;
    const cooldownKey = `${userId}:${command.name}`;
    
    const existingCooldown = await storage.getCommandCooldown(userId, command.name);
    if (existingCooldown && existingCooldown.expiresAt > new Date()) {
      const timeLeft = Math.ceil((existingCooldown.expiresAt.getTime() - Date.now()) / 1000);
      await interaction.reply({
        content: `Please wait ${timeLeft} seconds before using this command again.`,
        ephemeral: true
      });
      return;
    }
    
    // Set cooldown
    const expiresAt = new Date(Date.now() + command.cooldown * 1000);
    await storage.createCommandCooldown({
      userId,
      command: command.name,
      expiresAt
    });
  }
  
  // Handle the command based on category and name
  incrementCommandsUsed();
  
  // For moderation commands, log the action and increment counter
  if (command.category === CommandCategory.MODERATION) {
    incrementModerationActions();
    
    // Log the activity
    if (interaction.guildId) {
      await storage.createActivityLog({
        serverId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.tag,
        command: `/${command.name}`,
      });
    }
  }
  
  // Execute command based on the category and name
  await executeSlashCommand(interaction, command);
}

/**
 * Executes a slash command based on its category and name
 */
async function executeSlashCommand(interaction: ChatInputCommandInteraction, command: any) {
  // Defer the reply for commands that might take time
  if (['ban', 'kick', 'mute', 'slowmode', 'clear', 'antiping'].includes(command.name)) {
    await interaction.deferReply();
  }
  
  // Extract common parameters based on command options
  const user = interaction.options.getUser('user');
  const member = user ? interaction.guild?.members.cache.get(user.id) : null;
  const role = interaction.options.getRole('role');
  const channel = interaction.options.getChannel('channel');
  const reason = interaction.options.getString('reason');
  const message = interaction.options.getString('message');
  const duration = interaction.options.getString('duration');
  const amount = interaction.options.getInteger('amount');
  
  // Record start time for performance measurement
  const start = performance.now();

  // Create a mock Message object to pass to the original execute function
  // This will allow us to reuse the exact same code for both text and slash commands
  const mockMessage = {
    author: interaction.user,
    member: interaction.member,
    channel: interaction.channel,
    guild: interaction.guild,
    client: interaction.client,
    content: `/${command.name}`,
    reply: async (content: any) => {
      if (typeof content === 'string') {
        return await interaction.replied 
          ? interaction.followUp(content) 
          : interaction.reply(content);
      } else if (content.embeds) {
        return await interaction.replied 
          ? interaction.followUp({ embeds: content.embeds }) 
          : interaction.reply({ embeds: content.embeds });
      } else {
        return await interaction.replied 
          ? interaction.followUp(content) 
          : interaction.reply(content);
      }
    },
    // Add more methods/properties as needed
    delete: async () => {
      // Can't delete an interaction, so this is a no-op
      return Promise.resolve();
    }
  };
  
  // Convert slash command options to text command args
  const args: string[] = [];
  
  // Add each option to args to match text command format
  if (user) args.push(user.id);
  if (role) args.push(role.id);
  if (channel) args.push(channel.id);
  if (reason) args.push(reason);
  if (message) args.push(message);
  if (duration) args.push(duration);
  if (amount !== null && amount !== undefined) args.push(amount.toString());
  
  // Helper function for commands that need more advanced implementation  
  const advancedImplementationNeeded = async () => {
    try {
      // Attempt to use the original command's execute method
      await command.execute(mockMessage, args, interaction.client);
    } catch (error) {
      console.error("Error executing command:", error);
      await interaction.reply({
        content: 'This command has advanced features that are available using the text command. Try using `+' + command.name + '` for full functionality.',
        ephemeral: true
      });
    }
  };
  
  switch (command.category) {
    case CommandCategory.MODERATION:
      switch (command.name) {
        case 'kick':
        case 'ban':
        case 'timeout':
        case 'mute':
        case 'untimeout':
        case 'unmute':
          // Use the original text command implementation
          await advancedImplementationNeeded();
          break;
          
        case 'clear':
        case 'purge':
        case 'slowmode':
          // Use the original text command implementation
          await advancedImplementationNeeded();
          break;
          
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.ANTIPING:
      // Use the original text command implementation
      await advancedImplementationNeeded();
      break;
      
    case CommandCategory.UTILITY:
      switch (command.name) {
        case 'ping':
        case 'help':
        case 'serverinfo':
        default:
          // Use the original text command implementation for all utility commands
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.FUN:
      switch (command.name) {
        case '8ball':
        case 'roll':
        case 'coinflip':
        default:
          // Use the original text command implementation for all fun commands
          await advancedImplementationNeeded();
      }
      break;
      
    default:
      await advancedImplementationNeeded();
  }
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
function formatDuration(ms: number): string {
  if (ms === 0) return '0 seconds';
  
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  
  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (seconds > 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
  
  return parts.join(', ');
}