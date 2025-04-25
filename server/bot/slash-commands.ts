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

import { handleGiveawayButtonClick } from './commands/giveaway';

export function setupSlashCommands(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
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
      return;
    }
    
    // Handle button interactions
    if (interaction.isButton()) {
      // Check if it's a giveaway button
      const customId = interaction.customId;
      if (customId.startsWith('giveaway_enter_')) {
        const giveawayId = parseInt(customId.replace('giveaway_enter_', ''), 10);
        if (!isNaN(giveawayId)) {
          try {
            await handleGiveawayButtonClick(interaction, giveawayId);
          } catch (error) {
            console.error('Error handling giveaway button:', error);
            try {
              if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                  content: 'There was an error processing your request.',
                  ephemeral: true
                });
              } else {
                await interaction.reply({
                  content: 'There was an error processing your request.',
                  ephemeral: true
                });
              }
            } catch (replyError) {
              console.error('Error replying to interaction:', replyError);
            }
          }
        }
      }
      return;
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
  if (command.requiredPermissions && command.requiredPermissions.length > 0) {
    // Need to cast to GuildMemberRoleManager to access the permissions properly
    const memberPermissions = interaction.member?.permissions;
    
    if (!memberPermissions) {
      await interaction.reply({
        content: `You don't have the required permissions to use this command.`,
        ephemeral: true
      });
      return;
    }
    
    // Check if the member has the required permissions
    let hasPermissions = true;
    if (typeof memberPermissions === 'string') {
      // Handle string permissions (unlikely but possible)
      hasPermissions = false;
    } else {
      // Normal permissions object
      hasPermissions = command.requiredPermissions.every(perm => memberPermissions.has(perm));
    }
    
    if (!hasPermissions) {
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
    commandName: command.name, // Special property to identify slash commands
    reply: async (content: any) => {
      try {
        // Check if the interaction has been replied to or deferred
        if (interaction.replied || interaction.deferred) {
          // Use followUp for interactions that have been replied to or deferred
          if (typeof content === 'string') {
            return await interaction.followUp(content);
          } else if (content.embeds) {
            return await interaction.followUp({ embeds: content.embeds });
          } else {
            return await interaction.followUp(content);
          }
        } else {
          // Use reply for interactions that haven't been replied to yet
          if (typeof content === 'string') {
            return await interaction.reply(content);
          } else if (content.embeds) {
            return await interaction.reply({ embeds: content.embeds });
          } else {
            return await interaction.reply(content);
          }
        }
      } catch (error) {
        console.error('Error replying to interaction:', error);
        // If an error occurs, try one last attempt to send a message
        try {
          return await interaction.followUp({
            content: 'There was an error processing your command.',
            ephemeral: true
          });
        } catch (followUpError) {
          console.error('Failed to send follow-up message:', followUpError);
          return null;
        }
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
      
      // Check if the interaction has already been replied to
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'This command has advanced features that are available using the text command. Try using `+' + command.name + '` for full functionality.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: 'This command has advanced features that are available using the text command. Try using `+' + command.name + '` for full functionality.',
          ephemeral: true
        });
      }
    }
  };
  
  switch (command.category) {
    case CommandCategory.MODERATION:
      switch (command.name) {
        case 'ban':
          // Handle ban command
          const banUser = interaction.options.getUser('user');
          if (!banUser) {
            await mockMessage.reply('Please specify a user to ban.');
            return;
          }
          
          const banDuration = interaction.options.getString('duration') || null;
          const banReason = interaction.options.getString('reason') || 'No reason provided';
          
          // Create args array: [user, duration (if provided), reason]
          // Format user mention properly for Discord.js
          const banArgs = [`<@${banUser.id}>`];
          
          // Add duration if provided
          if (banDuration) {
            banArgs.push(banDuration);
          }
          
          // Add reason as a single string (not split into separate words)
          banArgs.push(banReason);
          
          await command.execute(mockMessage, banArgs, interaction.client);
          break;
          
        case 'kick':
          // Handle kick command
          const kickUser = interaction.options.getUser('user');
          if (!kickUser) {
            await mockMessage.reply('Please specify a user to kick.');
            return;
          }
          
          const kickDuration = interaction.options.getString('duration') || null;
          const kickReason = interaction.options.getString('reason') || 'No reason provided';
          
          // Create args array: [user, duration (if provided), reason]
          // Format user mention properly for Discord.js
          const kickArgs = [`<@${kickUser.id}>`];
          
          // Add duration if provided
          if (kickDuration) {
            kickArgs.push(kickDuration);
          }
          
          // Add reason as a single string (not split into separate words)
          kickArgs.push(kickReason);
          
          await command.execute(mockMessage, kickArgs, interaction.client);
          break;
          
        case 'timeout':
        case 'mute':
          // Handle timeout/mute command
          const muteUser = interaction.options.getUser('user');
          if (!muteUser) {
            await mockMessage.reply('Please specify a user to timeout/mute.');
            return;
          }
          
          const duration = interaction.options.getString('duration') || '1h';
          const muteReason = interaction.options.getString('reason') || 'No reason provided';
          // Format user mention properly for Discord.js
          const muteArgs = [`<@${muteUser.id}>`, duration, muteReason];
          await command.execute(mockMessage, muteArgs, interaction.client);
          break;
          
        case 'untimeout':
        case 'unmute':
          // Handle untimeout/unmute command
          const unmuteUser = interaction.options.getUser('user');
          if (!unmuteUser) {
            await mockMessage.reply('Please specify a user to remove timeout/unmute.');
            return;
          }
          
          // Format user mention properly for Discord.js
          const unmuteArgs = [`<@${unmuteUser.id}>`];
          await command.execute(mockMessage, unmuteArgs, interaction.client);
          break;
          
        case 'clear':
        case 'purge':
          // Handle clear/purge command
          const amount = interaction.options.getInteger('amount');
          if (!amount) {
            await mockMessage.reply('Please specify the number of messages to delete.');
            return;
          }
          
          const clearArgs = [amount.toString()];
          await command.execute(mockMessage, clearArgs, interaction.client);
          break;
          
        case 'slowmode':
          // Handle slowmode command
          const slowmodeChannel = interaction.options.getChannel('channel') || interaction.channel;
          const seconds = interaction.options.getInteger('amount') || 0;
          
          // Check if the channel is not null
          if (!slowmodeChannel) {
            return await mockMessage.reply('Invalid channel.');
          }
          
          const slowmodeArgs = [slowmodeChannel.toString(), seconds.toString()];
          await command.execute(mockMessage, slowmodeArgs, interaction.client);
          break;
          
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.ANTIPING:
      switch (command.name) {
        case 'antiping':
          // Handle subcommands for antiping
          const subcommand = interaction.options.getSubcommand(true);
          
          if (subcommand === 'enable') {
            // Handle enable subcommand
            const args = ['on']; // Use 'on' for the enable subcommand
            await command.execute(mockMessage, args, interaction.client);
          } else if (subcommand === 'disable') {
            // Handle disable subcommand
            const args = ['off']; // Use 'off' for the disable subcommand
            await command.execute(mockMessage, args, interaction.client);
          } else if (subcommand === 'set-bypass-role') {
            // Handle set-bypass-role subcommand
            const role = interaction.options.getRole('role');
            if (!role) {
              await mockMessage.reply('Please specify a role.');
              return;
            }
            const args = ['bypass', role.id];
            await command.execute(mockMessage, args, interaction.client);
          } else if (subcommand === 'set-protected-role') {
            // Handle set-protected-role subcommand
            const role = interaction.options.getRole('role');
            if (!role) {
              await mockMessage.reply('Please specify a role.');
              return;
            }
            const args = ['protect', role.id];
            await command.execute(mockMessage, args, interaction.client);
          } else if (subcommand === 'add-excluded-role') {
            // Handle add-excluded-role subcommand
            const role = interaction.options.getRole('role');
            if (!role) {
              await mockMessage.reply('Please specify a role.');
              return;
            }
            const args = ['exclude', role.id];
            await command.execute(mockMessage, args, interaction.client);
          } else if (subcommand === 'remove-excluded-role') {
            // Handle remove-excluded-role subcommand
            const role = interaction.options.getRole('role');
            if (!role) {
              await mockMessage.reply('Please specify a role.');
              return;
            }
            const args = ['include', role.id];
            await command.execute(mockMessage, args, interaction.client);
          } else if (subcommand === 'settings') {
            // Handle settings subcommand - no args needed for settings display
            const args: string[] = [];
            await command.execute(mockMessage, args, interaction.client);
          } else {
            // Default case for unknown subcommands
            await advancedImplementationNeeded();
          }
          break;
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.GIVEAWAY:
      switch (command.name) {
        case 'gcreate':
        case 'gcreategiveaway':
          // Handle giveaway creation
          // Add debug logging to see what options are available
          console.log('Giveaway command options:', interaction.options);
          
          // Check for options with various parameter names (handling multiple possibilities)
          // Prioritize the expected parameter names now that we've standardized them
          const gChannel = interaction.options.getChannel('channel') || 
                           interaction.options.getChannel('gchannel');
                           
          const gDuration = interaction.options.getString('duration') || 
                            interaction.options.getString('gduration');
                            
          const prize = interaction.options.getString('prize');
          const winners = interaction.options.getInteger('winners') || 1;
          const requiredRole = interaction.options.getRole('required-role');
          
          console.log('Giveaway params:', { gChannel, gDuration, prize, winners, requiredRole });
          
          if (!gChannel || !gDuration || !prize) {
            // Show more detailed errors to help debug
            const missing = [];
            if (!gChannel) missing.push('channel');
            if (!gDuration) missing.push('duration');
            if (!prize) missing.push('prize');
            
            return await mockMessage.reply(`Missing required fields: ${missing.join(', ')} - please make sure all required options are provided.`);
          }
          
          const createArgs = [
            gChannel.id,
            gDuration,
            prize
          ];
          
          if (winners !== 1) {
            createArgs.push(winners.toString());
          }
          
          if (requiredRole) {
            createArgs.push(requiredRole.id);
          }
          
          await command.execute(mockMessage, createArgs, interaction.client);
          break;
          
        case 'gend':
          // Handle giveaway ending
          const endGiveawayId = interaction.options.getInteger('giveaway-id');
          if (!endGiveawayId) {
            return await mockMessage.reply('Please provide a giveaway ID!');
          }
          
          await command.execute(mockMessage, [endGiveawayId.toString()], interaction.client);
          break;
          
        case 'greroll':
          // Handle giveaway reroll
          const rerollGiveawayId = interaction.options.getInteger('giveaway-id');
          const rerollCount = interaction.options.getInteger('count') || 1;
          
          if (!rerollGiveawayId) {
            return await mockMessage.reply('Please provide a giveaway ID!');
          }
          
          const rerollArgs = [rerollGiveawayId.toString()];
          if (rerollCount !== 1) {
            rerollArgs.push(rerollCount.toString());
          }
          
          await command.execute(mockMessage, rerollArgs, interaction.client);
          break;
          
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.UTILITY:
      switch (command.name) {
        case 'ping':
          // Simple ping command, no args needed
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        case 'help':
          // Help command with optional category parameter
          const helpCategory = interaction.options.getString('category');
          const helpArgs = helpCategory ? [helpCategory] : [];
          await command.execute(mockMessage, helpArgs, interaction.client);
          break;
          
        case 'serverinfo':
          // Server info command, no args needed
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        case 'userinfo':
          // User info command with optional user parameter
          const userInfoTarget = interaction.options.getUser('user');
          const userInfoArgs = userInfoTarget ? [userInfoTarget.id] : [];
          await command.execute(mockMessage, userInfoArgs, interaction.client);
          break;
          
        case 'avatar':
          // Avatar command with optional user parameter
          const avatarTarget = interaction.options.getUser('user');
          const avatarArgs = avatarTarget ? [avatarTarget.id] : [];
          await command.execute(mockMessage, avatarArgs, interaction.client);
          break;
          
        case 'poll':
          // Poll command with question and options
          const question = interaction.options.getString('message');
          const options = interaction.options.getString('options');
          
          if (!question) {
            return await mockMessage.reply('Please provide a poll question!');
          }
          
          const pollArgs = [question];
          if (options) {
            pollArgs.push(options);
          }
          
          await command.execute(mockMessage, pollArgs, interaction.client);
          break;
          
        default:
          // For other utility commands
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.FUN:
      switch (command.name) {
        case '8ball':
          // 8ball command with question parameter
          const question8ball = interaction.options.getString('question');
          if (!question8ball) {
            return await mockMessage.reply('Please ask a question!');
          }
          
          await command.execute(mockMessage, [question8ball], interaction.client);
          break;
          
        case 'roll':
          // Roll command with optional sides parameter
          const sides = interaction.options.getInteger('amount');
          const rollArgs = sides ? [sides.toString()] : [];
          await command.execute(mockMessage, rollArgs, interaction.client);
          break;
          
        case 'coinflip':
          // Coinflip command, no args needed
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        case 'rps':
          // Rock, paper, scissors command with choice parameter
          const choice = interaction.options.getString('message');
          const rpsArgs = choice ? [choice] : [];
          await command.execute(mockMessage, rpsArgs, interaction.client);
          break;
          
        case 'joke':
          // Joke command, no args needed
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        case 'fact':
          // Fact command, no args needed
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        default:
          // For other fun commands
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