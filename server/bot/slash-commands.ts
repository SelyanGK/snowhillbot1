import { 
  Client, 
  Interaction, 
  CommandInteraction, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ApplicationCommandOptionType,
  ChannelType
} from 'discord.js';
import { storage } from '../storage';
import { log } from '../vite';
import { incrementCommandsUsed, incrementModerationActions } from './index';
import { CommandCategory } from '@shared/schema';
import { performance } from 'perf_hooks';

export function setupSlashCommands(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      try {
        await handleSlashCommand(interaction);
      } catch (error) {
        console.error('Error handling slash command:', error);
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
    
    if (interaction.isButton()) {
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

async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const { client, commandName } = interaction;
  const command = client.commands.get(commandName);
  
  if (!command) {
    await interaction.reply({
      content: `Command /${commandName} not found.`,
      ephemeral: true
    });
    return;
  }
  
  if (command.requiredPermissions && command.requiredPermissions.length > 0) {
    const memberPermissions = interaction.member?.permissions;
    
    if (!memberPermissions) {
      await interaction.reply({
        content: `You don't have the required permissions to use this command.`,
        ephemeral: true
      });
      return;
    }
    
    let hasPermissions = true;
    if (typeof memberPermissions === 'string') {
      hasPermissions = false;
    } else {
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
    
    const expiresAt = new Date(Date.now() + command.cooldown * 1000);
    await storage.createCommandCooldown({
      userId,
      command: command.name,
      expiresAt
    });
  }
  
  incrementCommandsUsed();
  
  if (command.category === CommandCategory.MODERATION) {
    incrementModerationActions();
    
    if (interaction.guildId) {
      await storage.createActivityLog({
        serverId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.tag,
        command: `/${command.name}`,
      });
    }
  }
  
  await executeSlashCommand(interaction, command);
}

async function executeSlashCommand(interaction: ChatInputCommandInteraction, command: any) {
  if (['ban', 'kick', 'mute', 'slowmode', 'clear', 'antiping'].includes(command.name)) {
    await interaction.deferReply();
  }
  
  const user = interaction.options.getUser('user');
  const member = user ? interaction.guild?.members.cache.get(user.id) : null;
  const role = interaction.options.getRole('role');
  const channel = interaction.options.getChannel('channel');
  const reason = interaction.options.getString('reason');
  const message = interaction.options.getString('message');
  const duration = interaction.options.getString('duration');
  const amount = interaction.options.getInteger('amount');
  
  const start = performance.now();

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
          
          if (banDuration) {
            banArgs.push(banDuration);
          }
          
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
          
          if (kickDuration) {
            kickArgs.push(kickDuration);
          }
          
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
          const clearAmount = interaction.options.getInteger('amount');
          if (!clearAmount) {
            await mockMessage.reply('Please specify the number of messages to delete.');
            return;
          }
          
          const clearArgs = [clearAmount.toString()];
          await command.execute(mockMessage, clearArgs, interaction.client);
          break;
          
        case 'slowmode':
          const slowmodeChannel = interaction.options.getChannel('channel') || interaction.channel;
          const seconds = interaction.options.getInteger('seconds') ?? 0;
          
          if (seconds < 0 || seconds > 21600) {
            await mockMessage.reply('Slowmode duration must be between 0 and 21600 seconds (6 hours).');
            return;
          }

          if (!slowmodeChannel || !slowmodeChannel.isTextBased()) {
            await mockMessage.reply('Invalid text channel.');
            return;
          }

          const slowmodeArgs = [slowmodeChannel.id, seconds.toString()];
          await command.execute(mockMessage, slowmodeArgs, interaction.client);
          break;
          
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    // ... rest of your existing code for other command categories
  }
}

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