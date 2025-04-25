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
  const mockMessage = {
    author: interaction.user,
    member: interaction.member,
    channel: interaction.channel,
    guild: interaction.guild,
    client: interaction.client,
    content: `/${command.name}`,
    commandName: command.name,
    mentions: {
      users: {
        first: () => user
      },
      roles: {
        first: () => role
      },
    },
    reply: async (content: any) => {
      try {
        if (interaction.replied || interaction.deferred) {
          if (typeof content === 'string') {
            return await interaction.followUp(content);
          } else if (content.embeds) {
            return await interaction.followUp({ embeds: content.embeds });
          } else {
            return await interaction.followUp(content);
          }
        } else {
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
    delete: async () => {
      return Promise.resolve();
    }
  };
  
  const args: string[] = [];
  
  if (user) args.push(user.id);
  if (role) args.push(role.id);
  if (channel) args.push(channel.id);
  if (reason) args.push(reason);
  if (message) args.push(message);
  if (duration) args.push(duration);
  if (amount !== null && amount !== undefined) args.push(amount.toString());
  
  const advancedImplementationNeeded = async () => {
    try {
      await command.execute(mockMessage, args, interaction.client);
    } catch (error) {
      console.error("Error executing command:", error);
      
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
          const banUser = interaction.options.getUser('user');
          if (!banUser) {
            await mockMessage.reply('Please specify a user to ban.');
            return;
          }
          
          const banDuration = interaction.options.getString('duration') || null;
          const banReason = interaction.options.getString('reason') || 'No reason provided';
          
          const banArgs = [`<@${banUser.id}>`];
          if (banDuration) banArgs.push(banDuration);
          banArgs.push(banReason);
          
          await command.execute(mockMessage, banArgs, interaction.client);
          break;
          
        case 'kick':
          const kickUser = interaction.options.getUser('user');
          if (!kickUser) {
            await mockMessage.reply('Please specify a user to kick.');
            return;
          }
          
          const kickDuration = interaction.options.getString('duration') || null;
          const kickReason = interaction.options.getString('reason') || 'No reason provided';
          
          const kickArgs = [`<@${kickUser.id}>`];
          if (kickDuration) kickArgs.push(kickDuration);
          kickArgs.push(kickReason);
          
          await command.execute(mockMessage, kickArgs, interaction.client);
          break;
          
        case 'timeout':
        case 'mute':
          const muteUser = interaction.options.getUser('user');
          if (!muteUser) {
            await mockMessage.reply('Please specify a user to timeout/mute.');
            return;
          }
          
          const muteDuration = interaction.options.getString('duration') || '1h';
          const muteReason = interaction.options.getString('reason') || 'No reason provided';
          const muteArgs = [`<@${muteUser.id}>`, muteDuration, muteReason];
          await command.execute(mockMessage, muteArgs, interaction.client);
          break;
          
        case 'untimeout':
        case 'unmute':
          const unmuteUser = interaction.options.getUser('user');
          if (!unmuteUser) {
            await mockMessage.reply('Please specify a user to remove timeout/unmute.');
            return;
          }
          
          const unmuteArgs = [`<@${unmuteUser.id}>`];
          await command.execute(mockMessage, unmuteArgs, interaction.client);
          break;
          
        case 'clear':
        case 'purge':
          const purgeAmount = interaction.options.getInteger('amount');
          if (!purgeAmount) {
            await mockMessage.reply('Please specify the number of messages to delete.');
            return;
          }
          
          const purgeArgs = [purgeAmount.toString()];
          await command.execute(mockMessage, purgeArgs, interaction.client);
          break;
          
        case 'slowmode':
          // Fixed slowmode command with proper seconds parameter
          const slowmodeChannel = interaction.options.getChannel('channel') || interaction.channel;
          const seconds = interaction.options.getInteger('seconds') || 0;
          
          if (!slowmodeChannel) {
            return await mockMessage.reply('Invalid channel.');
          }
          
          if (seconds < 0 || seconds > 21600) {
            return await mockMessage.reply('Slowmode duration must be between 0 and 21600 seconds (6 hours).');
          }
          
          const slowmodeArgs = [slowmodeChannel.id, seconds.toString()];
          await command.execute(mockMessage, slowmodeArgs, interaction.client);
          break;
          
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.ANTIPING:
      switch (command.name) {
        case 'antiping':
          try {
            const subcommand = interaction.options.getSubcommand(true);
            
            if (subcommand === 'enable') {
              await command.execute(mockMessage, ['on'], interaction.client);
            } 
            else if (subcommand === 'disable') {
              await command.execute(mockMessage, ['off'], interaction.client);
            } 
            else if (subcommand === 'set-bypass-role') {
              const role = interaction.options.getRole('role');
              if (!role) {
                await mockMessage.reply('Please specify a role.');
                return;
              }
              
              const bypassMockMessage = {
                ...mockMessage,
                mentions: {
                  ...mockMessage.mentions,
                  roles: {
                    first: () => role 
                  }
                }
              };
              
              await command.execute(bypassMockMessage, ['bypass'], interaction.client);
            } 
            else if (subcommand === 'set-protected-role') {
              const role = interaction.options.getRole('role');
              if (!role) {
                await mockMessage.reply('Please specify a role.');
                return;
              }
              
              const protectMockMessage = {
                ...mockMessage,
                mentions: {
                  ...mockMessage.mentions,
                  roles: {
                    first: () => role 
                  }
                }
              };
              
              await command.execute(protectMockMessage, ['protect'], interaction.client);
            } 
            else if (subcommand === 'add-excluded-role') {
              const role = interaction.options.getRole('role');
              if (!role) {
                await mockMessage.reply('Please specify a role.');
                return;
              }
              
              const excludeMockMessage = {
                ...mockMessage,
                mentions: {
                  ...mockMessage.mentions,
                  roles: {
                    first: () => role 
                  }
                }
              };
              
              await command.execute(excludeMockMessage, ['exclude'], interaction.client);
            } 
            else if (subcommand === 'remove-excluded-role') {
              const role = interaction.options.getRole('role');
              if (!role) {
                await mockMessage.reply('Please specify a role.');
                return;
              }
              
              const includeMockMessage = {
                ...mockMessage,
                mentions: {
                  ...mockMessage.mentions,
                  roles: {
                    first: () => role 
                  }
                }
              };
              
              await command.execute(includeMockMessage, ['include'], interaction.client);
            } 
            else if (subcommand === 'settings') {
              await command.execute(mockMessage, ['settings'], interaction.client);
            } 
            else {
              await mockMessage.reply(`Unknown subcommand: ${subcommand}. Please use one of: enable, disable, set-bypass-role, set-protected-role, add-excluded-role, remove-excluded-role, settings.`);
            }
          } catch (error) {
            console.error("Error processing antiping subcommand:", error);
            await mockMessage.reply('Error processing the command. Make sure you provided all required parameters.');
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
          const gChannel = interaction.options.getChannel('channel') || 
                           interaction.options.getChannel('gchannel');
          const gDuration = interaction.options.getString('duration') || 
                            interaction.options.getString('gduration');
          const prize = interaction.options.getString('prize');
          const winners = interaction.options.getInteger('winners') || 1;
          const requiredRole = interaction.options.getRole('required-role');
          
          if (!gChannel || !gDuration || !prize) {
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
          
          if (winners !== 1) createArgs.push(winners.toString());
          if (requiredRole) createArgs.push(requiredRole.id);
          
          await command.execute(mockMessage, createArgs, interaction.client);
          break;
          
        case 'gend':
          const endGiveawayId = interaction.options.getInteger('giveaway-id');
          if (!endGiveawayId) {
            return await mockMessage.reply('Please provide a giveaway ID!');
          }
          
          await command.execute(mockMessage, [endGiveawayId.toString()], interaction.client);
          break;
          
        case 'greroll':
          const rerollGiveawayId = interaction.options.getInteger('giveaway-id');
          const rerollCount = interaction.options.getInteger('count') || 1;
          
          if (!rerollGiveawayId) {
            return await mockMessage.reply('Please provide a giveaway ID!');
          }
          
          const rerollArgs = [rerollGiveawayId.toString()];
          if (rerollCount !== 1) rerollArgs.push(rerollCount.toString());
          
          await command.execute(mockMessage, rerollArgs, interaction.client);
          break;
          
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.UTILITY:
      switch (command.name) {
        case 'ping':
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        case 'help':
          const helpCategory = interaction.options.getString('category');
          const helpArgs = helpCategory ? [helpCategory] : [];
          await command.execute(mockMessage, helpArgs, interaction.client);
          break;
          
        case 'serverinfo':
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        case 'userinfo':
          const userInfoTarget = interaction.options.getUser('user');
          const userInfoArgs = userInfoTarget ? [userInfoTarget.id] : [];
          await command.execute(mockMessage, userInfoArgs, interaction.client);
          break;
          
        case 'avatar':
          const avatarTarget = interaction.options.getUser('user');
          const avatarArgs = avatarTarget ? [avatarTarget.id] : [];
          await command.execute(mockMessage, avatarArgs, interaction.client);
          break;
          
        case 'poll':
          const question = interaction.options.getString('message');
          const options = interaction.options.getString('options');
          
          if (!question) {
            return await mockMessage.reply('Please provide a poll question!');
          }
          
          const pollArgs = [question];
          if (options) pollArgs.push(options);
          
          await command.execute(mockMessage, pollArgs, interaction.client);
          break;
          
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.FUN:
      switch (command.name) {
        case '8ball':
          const question8ball = interaction.options.getString('question');
          if (!question8ball) {
            return await mockMessage.reply('Please ask a question!');
          }
          
          await command.execute(mockMessage, [question8ball], interaction.client);
          break;
          
        case 'roll':
          const sides = interaction.options.getInteger('amount');
          const rollArgs = sides ? [sides.toString()] : [];
          await command.execute(mockMessage, rollArgs, interaction.client);
          break;
          
        case 'coinflip':
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        case 'rps':
          const choice = interaction.options.getString('message');
          const rpsArgs = choice ? [choice] : [];
          await command.execute(mockMessage, rpsArgs, interaction.client);
          break;
          
        case 'joke':
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        case 'fact':
          await command.execute(mockMessage, [], interaction.client);
          break;
          
        default:
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