import { Client, Interaction, CommandInteraction, ChatInputCommandInteraction } from 'discord.js';
import { storage } from '../storage';
import { log } from '../vite';
import { incrementCommandsUsed, incrementModerationActions } from './index';
import { CommandCategory } from '@shared/schema';

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
  
  // Helper function for commands that need more advanced implementation
  const advancedImplementationNeeded = async () => {
    await interaction.reply({
      content: 'This command has advanced features that are available using the text command. Try using `+' + command.name + '` for full functionality.',
      ephemeral: true
    });
  };
  
  switch (command.category) {
    case CommandCategory.MODERATION:
      switch (command.name) {
        case 'kick':
          if (!member) {
            await interaction.editReply('You need to specify a user to kick.');
            return;
          }
          
          try {
            await member.kick(reason || 'No reason provided');
            await interaction.editReply(`Successfully kicked ${member.user.tag}${reason ? ` for: ${reason}` : ''}.`);
          } catch (error) {
            await interaction.editReply(`Failed to kick ${member.user.tag}: ${error.message}`);
          }
          break;
          
        case 'ban':
          if (!member) {
            await interaction.editReply('You need to specify a user to ban.');
            return;
          }
          
          try {
            await member.ban({ reason: reason || 'No reason provided' });
            await interaction.editReply(`Successfully banned ${member.user.tag}${reason ? ` for: ${reason}` : ''}.`);
          } catch (error) {
            await interaction.editReply(`Failed to ban ${member.user.tag}: ${error.message}`);
          }
          break;
          
        case 'timeout':
        case 'mute':
          if (!member) {
            await interaction.editReply('You need to specify a user to timeout.');
            return;
          }
          
          // Parse duration
          let timeoutDuration = 60 * 1000; // Default: 1 minute
          if (duration) {
            const match = duration.match(/^(\d+)([smhdw])$/);
            if (match) {
              const value = parseInt(match[1]);
              const unit = match[2];
              
              switch (unit) {
                case 's': timeoutDuration = value * 1000; break;
                case 'm': timeoutDuration = value * 60 * 1000; break;
                case 'h': timeoutDuration = value * 60 * 60 * 1000; break;
                case 'd': timeoutDuration = value * 24 * 60 * 60 * 1000; break;
                case 'w': timeoutDuration = value * 7 * 24 * 60 * 60 * 1000; break;
              }
              
              // Max timeout is 28 days
              if (timeoutDuration > 28 * 24 * 60 * 60 * 1000) {
                timeoutDuration = 28 * 24 * 60 * 60 * 1000;
              }
            }
          }
          
          try {
            await member.timeout(timeoutDuration, reason || 'No reason provided');
            await interaction.editReply(`Successfully timed out ${member.user.tag} for ${formatDuration(timeoutDuration)}${reason ? ` for: ${reason}` : ''}.`);
          } catch (error) {
            await interaction.editReply(`Failed to timeout ${member.user.tag}: ${error.message}`);
          }
          break;
          
        case 'clear':
        case 'purge':
          const deleteAmount = amount || 10; // Default to 10 messages
          if (deleteAmount < 1 || deleteAmount > 100) {
            await interaction.editReply('You can only delete between 1 and 100 messages at once.');
            return;
          }
          
          try {
            const messages = await interaction.channel?.messages.fetch({ limit: deleteAmount });
            if (messages && interaction.channel?.isTextBased()) {
              await interaction.channel.bulkDelete(messages);
              await interaction.editReply(`Successfully deleted ${messages.size} messages.`);
              
              // Delete the reply after 5 seconds
              setTimeout(() => {
                interaction.deleteReply().catch(console.error);
              }, 5000);
            }
          } catch (error) {
            await interaction.editReply(`Failed to delete messages: ${error.message}`);
          }
          break;
          
        case 'slowmode':
          if (!channel || !channel.isTextBased()) {
            await interaction.editReply('You need to specify a valid text channel.');
            return;
          }
          
          const slowmodeDuration = amount || 0; // 0 disables slowmode
          if (slowmodeDuration < 0 || slowmodeDuration > 21600) {
            await interaction.editReply('Slowmode can be between 0 and 21600 seconds (6 hours).');
            return;
          }
          
          try {
            // Check if the channel has setRateLimitPerUser method
            if ('setRateLimitPerUser' in channel) {
              await channel.setRateLimitPerUser(slowmodeDuration, reason || 'No reason provided');
              await interaction.editReply(`Successfully set slowmode to ${formatDuration(slowmodeDuration * 1000)} in ${channel.name}.`);
            } else {
              await interaction.editReply('This channel type does not support slowmode.');
            }
          } catch (error) {
            await interaction.editReply(`Failed to set slowmode: ${error.message}`);
          }
          break;
          
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.ANTIPING:
      if (command.name === 'antiping') {
        const subcommand = interaction.options.getSubcommand();
        
        if (!interaction.guildId) {
          await interaction.editReply('This command can only be used in a server.');
          return;
        }
        
        const server = await storage.getServer(interaction.guildId);
        if (!server) {
          // Create the server settings
          await storage.createServer({
            id: interaction.guildId,
            name: interaction.guild?.name || 'Unknown Server',
            prefix: '+',
            antiPingEnabled: false,
            antiPingExcludedRoles: [],
            antiPingBypassRole: null,
            antiPingProtectedRole: null,
            antiPingPunishment: 'timeout'
          });
        }
        
        switch (subcommand) {
          case 'enable':
            await storage.updateServer(interaction.guildId, { antiPingEnabled: true });
            await interaction.editReply('Anti-ping protection has been enabled.');
            break;
            
          case 'disable':
            await storage.updateServer(interaction.guildId, { antiPingEnabled: false });
            await interaction.editReply('Anti-ping protection has been disabled.');
            break;
            
          case 'set-bypass-role':
            if (!role) {
              await interaction.editReply('You need to specify a role.');
              return;
            }
            
            await storage.updateServer(interaction.guildId, { antiPingBypassRole: role.id });
            await interaction.editReply(`Set ${role.name} as the anti-ping bypass role.`);
            break;
            
          case 'set-protected-role':
            if (!role) {
              await interaction.editReply('You need to specify a role.');
              return;
            }
            
            await storage.updateServer(interaction.guildId, { antiPingProtectedRole: role.id });
            await interaction.editReply(`Set ${role.name} as the anti-ping protected role.`);
            break;
            
          case 'add-excluded-role':
            if (!role) {
              await interaction.editReply('You need to specify a role.');
              return;
            }
            
            const server = await storage.getServer(interaction.guildId);
            if (!server) {
              await interaction.editReply('Server settings not found.');
              return;
            }
            
            const excludedRoles = server.antiPingExcludedRoles || [];
            if (excludedRoles.includes(role.id)) {
              await interaction.editReply(`${role.name} is already excluded from anti-ping.`);
              return;
            }
            
            excludedRoles.push(role.id);
            await storage.updateServer(interaction.guildId, { antiPingExcludedRoles: excludedRoles });
            await interaction.editReply(`Added ${role.name} to anti-ping exclusions.`);
            break;
            
          case 'remove-excluded-role':
            if (!role) {
              await interaction.editReply('You need to specify a role.');
              return;
            }
            
            const serverData = await storage.getServer(interaction.guildId);
            if (!serverData) {
              await interaction.editReply('Server settings not found.');
              return;
            }
            
            const currentExcludedRoles = serverData.antiPingExcludedRoles || [];
            if (!currentExcludedRoles.includes(role.id)) {
              await interaction.editReply(`${role.name} is not in the exclusion list.`);
              return;
            }
            
            const updatedExcludedRoles = currentExcludedRoles.filter(id => id !== role.id);
            await storage.updateServer(interaction.guildId, { antiPingExcludedRoles: updatedExcludedRoles });
            await interaction.editReply(`Removed ${role.name} from anti-ping exclusions.`);
            break;
            
          case 'settings':
            const settings = await storage.getServer(interaction.guildId);
            if (!settings) {
              await interaction.editReply('Server settings not found.');
              return;
            }
            
            const bypassRole = settings.antiPingBypassRole ? 
              interaction.guild?.roles.cache.get(settings.antiPingBypassRole)?.name || 'Unknown Role' : 
              'None';
              
            const protectedRole = settings.antiPingProtectedRole ? 
              interaction.guild?.roles.cache.get(settings.antiPingProtectedRole)?.name || 'Unknown Role' : 
              'None';
              
            const excludedRoleNames = settings.antiPingExcludedRoles && settings.antiPingExcludedRoles.length > 0 ? 
              settings.antiPingExcludedRoles.map(id => 
                interaction.guild?.roles.cache.get(id)?.name || 'Unknown Role'
              ).join(', ') : 
              'None';
            
            await interaction.editReply(`**Anti-Ping Settings**
- Status: ${settings.antiPingEnabled ? 'Enabled' : 'Disabled'}
- Bypass Role: ${bypassRole}
- Protected Role: ${protectedRole}
- Excluded Roles: ${excludedRoleNames}
- Punishment: ${settings.antiPingPunishment || 'timeout'}`);
            break;
            
          default:
            await interaction.editReply('Unknown antiping subcommand.');
        }
      } else {
        await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.UTILITY:
      switch (command.name) {
        case 'ping':
          const latency = Math.round(client.ws.ping);
          await interaction.reply(`Pong! 🏓 Bot latency: ${latency}ms`);
          break;
        
        case 'help':
          const categories = Object.values(CommandCategory);
          const commandsByCategory: Record<string, string[]> = {};
          
          // Group commands by category
          for (const cmd of interaction.client.commands.values()) {
            if (!commandsByCategory[cmd.category]) {
              commandsByCategory[cmd.category] = [];
            }
            commandsByCategory[cmd.category].push(cmd.name);
          }
          
          let helpMessage = '**Available Commands**\n\n';
          
          for (const category of categories) {
            const commands = commandsByCategory[category] || [];
            if (commands.length > 0) {
              helpMessage += `**${category}**\n`;
              helpMessage += commands.map(cmd => `\`/${cmd}\` or \`+${cmd}\``).join(', ');
              helpMessage += '\n\n';
            }
          }
          
          helpMessage += 'For detailed help on a specific command, use `/help [command]` or `+help [command]`';
          
          await interaction.reply({
            content: helpMessage,
            ephemeral: true
          });
          break;
          
        case 'serverinfo':
          if (!interaction.guild) {
            await interaction.reply('This command can only be used in a server.');
            return;
          }
          
          const guild = interaction.guild;
          const owner = await guild.fetchOwner();
          const memberCount = guild.memberCount;
          const createdAt = guild.createdAt.toDateString();
          
          const embed = {
            title: guild.name,
            description: `Information about this server`,
            fields: [
              {
                name: 'Owner',
                value: owner.user.tag,
                inline: true
              },
              {
                name: 'Members',
                value: memberCount.toString(),
                inline: true
              },
              {
                name: 'Created At',
                value: createdAt,
                inline: true
              },
              {
                name: 'Server ID',
                value: guild.id,
                inline: true
              }
            ],
            color: 0x3498db,
            thumbnail: {
              url: guild.iconURL() || ''
            }
          };
          
          await interaction.reply({ embeds: [embed] });
          break;
        
        default:
          await advancedImplementationNeeded();
      }
      break;
      
    case CommandCategory.FUN:
      switch (command.name) {
        case '8ball':
          const question = interaction.options.getString('question');
          if (!question) {
            await interaction.reply('You need to ask a question!');
            return;
          }
          
          const responses = [
            'It is certain.', 'It is decidedly so.', 'Without a doubt.',
            'Yes definitely.', 'You may rely on it.', 'As I see it, yes.',
            'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.',
            'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.',
            'Cannot predict now.', 'Concentrate and ask again.',
            'Don\'t count on it.', 'My reply is no.', 'My sources say no.',
            'Outlook not so good.', 'Very doubtful.'
          ];
          
          const response = responses[Math.floor(Math.random() * responses.length)];
          
          await interaction.reply({
            content: `**Question:** ${question}\n**Answer:** ${response}`,
            ephemeral: false
          });
          break;
          
        case 'roll':
          const diceCount = amount || 1;
          if (diceCount < 1 || diceCount > 10) {
            await interaction.reply('You can roll between 1 and 10 dice at once.');
            return;
          }
          
          const results = [];
          let total = 0;
          
          for (let i = 0; i < diceCount; i++) {
            const roll = Math.floor(Math.random() * 6) + 1;
            results.push(roll);
            total += roll;
          }
          
          await interaction.reply({
            content: `You rolled ${diceCount} dice: ${results.join(', ')}. Total: ${total}`,
            ephemeral: false
          });
          break;
          
        case 'coinflip':
          const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
          await interaction.reply(`The coin landed on: **${result}**`);
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