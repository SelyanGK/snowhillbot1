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
          if (!member) {
            await interaction.editReply('You need to specify a user to remove timeout from.');
            return;
          }
          
          if (!member.communicationDisabledUntil) {
            await interaction.editReply('This user is not currently timed out.');
            return;
          }
          
          try {
            // Try to send a DM before removing timeout
            let dmSuccess = false;
            try {
              const dmEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle(`Your timeout in ${interaction.guild.name} has been removed`)
                .setDescription(`A moderator has removed your timeout.`)
                .addFields(
                  { name: 'Action', value: 'TIMEOUT REMOVED' },
                  { name: 'Reason', value: reason || 'No reason provided' },
                  { name: 'Moderator', value: interaction.user.tag }
                )
                .setTimestamp();
                
              await member.send({ embeds: [dmEmbed] });
              dmSuccess = true;
            } catch (dmError) {
              console.error('Could not DM user about timeout removal:', dmError);
              // Continue with the timeout removal even if DM fails
            }
            
            // Remove timeout
            await member.timeout(null, reason || 'No reason provided');
            
            // Create embed for success message
            const successEmbed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('Timeout Removed')
              .setDescription(`Timeout has been removed from ${member.user.tag}.`)
              .addFields(
                { name: 'Reason', value: reason || 'No reason provided' },
                { name: 'Moderator', value: interaction.user.tag },
                { name: 'DM Notification', value: dmSuccess ? '✅ User was notified via DM' : '❌ Could not DM user' }
              )
              .setTimestamp();
              
            await interaction.editReply({ embeds: [successEmbed] });
            
            // Log to mod-logs if the channel exists
            const modLogsChannel = interaction.guild?.channels.cache.find(
              (channel: any) => channel.name === 'mod-logs' && channel.isTextBased()
            );
            
            if (modLogsChannel && modLogsChannel.isTextBased()) {
              await modLogsChannel.send({ embeds: [successEmbed] });
            }
          } catch (error) {
            await interaction.editReply(`Failed to remove timeout from ${member.user.tag}: ${error.message}`);
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
              const targetUser = user ? `from ${user.tag}` : '';
              
              // Filter messages by user if specified
              const messagesToDelete = user 
                ? messages.filter(msg => msg.author.id === user.id)
                : messages;
                
              await interaction.channel.bulkDelete(messagesToDelete);
              
              // Create embed for success message
              const successEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setDescription(`🧹 Successfully deleted ${messagesToDelete.size} messages${targetUser}.`)
                .setTimestamp();
                
              await interaction.editReply({ embeds: [successEmbed] });
              
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
              
              // Create embed for success message
              const successEmbed = new EmbedBuilder()
                .setColor(slowmodeDuration === 0 ? 0x57F287 : 0xF1C40F)
                .setTitle(slowmodeDuration === 0 ? 'Slowmode Disabled' : 'Slowmode Enabled')
                .setDescription(
                  slowmodeDuration === 0 
                    ? `Slowmode has been disabled in ${channel.name}.` 
                    : `Slowmode has been set to ${formatDuration(slowmodeDuration * 1000)} in ${channel.name}.`
                )
                .addFields(
                  { name: 'Reason', value: reason || 'No reason provided' },
                  { name: 'Moderator', value: interaction.user.tag }
                )
                .setTimestamp();
                
              await interaction.editReply({ embeds: [successEmbed] });
              
              // Log to mod-logs if the channel exists
              const modLogsChannel = interaction.guild?.channels.cache.find(
                (ch: any) => ch.name === 'mod-logs' && ch.isTextBased()
              );
              
              if (modLogsChannel && modLogsChannel.isTextBased()) {
                await modLogsChannel.send({ embeds: [successEmbed] });
              }
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
            
            const enableEmbed = new EmbedBuilder()
              .setColor(0x57F287) // Green for enabled
              .setTitle('Anti-Ping Protection Enabled')
              .setDescription('Anti-ping protection is now active on this server.')
              .addFields(
                { name: 'Status', value: '✅ Enabled' },
                { name: 'Action By', value: interaction.user.tag }
              )
              .setFooter({ text: 'Users pinging excessively will now be automatically timed out' })
              .setTimestamp();
              
            await interaction.editReply({ embeds: [enableEmbed] });
            break;
            
          case 'disable':
            await storage.updateServer(interaction.guildId, { antiPingEnabled: false });
            
            const disableEmbed = new EmbedBuilder()
              .setColor(0xED4245) // Red for disabled
              .setTitle('Anti-Ping Protection Disabled')
              .setDescription('Anti-ping protection has been deactivated on this server.')
              .addFields(
                { name: 'Status', value: '❌ Disabled' },
                { name: 'Action By', value: interaction.user.tag }
              )
              .setFooter({ text: 'Users will no longer be timed out for excessive pinging' })
              .setTimestamp();
              
            await interaction.editReply({ embeds: [disableEmbed] });
            break;
            
          case 'set-bypass-role':
            if (!role) {
              await interaction.editReply('You need to specify a role.');
              return;
            }
            
            await storage.updateServer(interaction.guildId, { antiPingBypassRole: role.id });
            
            const bypassEmbed = new EmbedBuilder()
              .setColor(0x3498DB)
              .setTitle('Anti-Ping Bypass Role Updated')
              .setDescription(`Users with the ${role.name} role can now bypass anti-ping restrictions.`)
              .addFields(
                { name: 'Role', value: role.name },
                { name: 'Role ID', value: role.id },
                { name: 'Updated By', value: interaction.user.tag }
              )
              .setTimestamp();
              
            await interaction.editReply({ embeds: [bypassEmbed] });
            break;
            
          case 'set-protected-role':
            if (!role) {
              await interaction.editReply('You need to specify a role.');
              return;
            }
            
            await storage.updateServer(interaction.guildId, { antiPingProtectedRole: role.id });
            
            const protectedEmbed = new EmbedBuilder()
              .setColor(0x3498DB)
              .setTitle('Anti-Ping Protected Role Updated')
              .setDescription(`The ${role.name} role is now protected from excessive pings.`)
              .addFields(
                { name: 'Role', value: role.name },
                { name: 'Role ID', value: role.id },
                { name: 'Updated By', value: interaction.user.tag }
              )
              .setTimestamp();
              
            await interaction.editReply({ embeds: [protectedEmbed] });
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
            
            const addExcludeEmbed = new EmbedBuilder()
              .setColor(0x3498DB)
              .setTitle('Role Added to Anti-Ping Exclusions')
              .setDescription(`The ${role.name} role has been added to the anti-ping exclusion list.`)
              .addFields(
                { name: 'Role', value: role.name },
                { name: 'Role ID', value: role.id },
                { name: 'Updated By', value: interaction.user.tag }
              )
              .setTimestamp();
              
            await interaction.editReply({ embeds: [addExcludeEmbed] });
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
            
            const removeExcludeEmbed = new EmbedBuilder()
              .setColor(0x3498DB)
              .setTitle('Role Removed from Anti-Ping Exclusions')
              .setDescription(`The ${role.name} role has been removed from the anti-ping exclusion list.`)
              .addFields(
                { name: 'Role', value: role.name },
                { name: 'Role ID', value: role.id },
                { name: 'Updated By', value: interaction.user.tag }
              )
              .setTimestamp();
              
            await interaction.editReply({ embeds: [removeExcludeEmbed] });
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
            
            // Color based on enabled status
            const settingsColor = settings.antiPingEnabled ? 0x57F287 : 0xED4245;
            
            const settingsEmbed = new EmbedBuilder()
              .setColor(settingsColor)
              .setTitle('Anti-Ping Protection Settings')
              .setDescription('Current configuration for anti-ping protection on this server.')
              .addFields(
                { 
                  name: 'Status', 
                  value: settings.antiPingEnabled ? '✅ Enabled' : '❌ Disabled', 
                  inline: true 
                },
                { 
                  name: 'Punishment Type', 
                  value: settings.antiPingPunishment || 'timeout', 
                  inline: true 
                },
                { 
                  name: 'Bypass Role', 
                  value: bypassRole,
                  inline: true 
                },
                { 
                  name: 'Protected Role', 
                  value: protectedRole, 
                  inline: true 
                },
                { 
                  name: 'Excluded Roles', 
                  value: excludedRoleNames 
                }
              )
              .setFooter({ text: `Server ID: ${interaction.guildId}` })
              .setTimestamp();
            
            await interaction.editReply({ embeds: [settingsEmbed] });
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
          // Use the original text command implementation
          await advancedImplementationNeeded();
          break;
        
        case 'help':
          const commandParam = interaction.options.getString('command');
          
          if (commandParam) {
            // Search for the specific command
            const command = interaction.client.commands.get(commandParam.toLowerCase());
            
            if (!command) {
              await interaction.reply({
                content: `Command \`${commandParam}\` not found. Use \`/help\` to see all available commands.`,
                ephemeral: true
              });
              return;
            }
            
            // Create an embed for the specific command
            const commandHelpEmbed = new EmbedBuilder()
              .setColor(0x3498DB)
              .setTitle(`Command: ${command.name}`)
              .setDescription(command.description)
              .addFields(
                { name: 'Usage', value: command.usage.replace(/^!/, '+') },
                { name: 'Category', value: command.category },
                { name: 'Cooldown', value: `${command.cooldown} seconds` }
              );
              
            if (command.aliases && command.aliases.length > 0) {
              commandHelpEmbed.addFields({ name: 'Aliases', value: command.aliases.join(', ') });
            }
            
            if (command.requiredPermissions && command.requiredPermissions.length > 0) {
              const permNames = command.requiredPermissions.map((perm: any) => {
                const permName = String(perm).replace(/([A-Z])/g, ' $1').trim();
                return `\`${permName}\``;
              });
              commandHelpEmbed.addFields({ name: 'Required Permissions', value: permNames.join(', ') });
            }
            
            await interaction.reply({
              embeds: [commandHelpEmbed],
              ephemeral: true
            });
            return;
          }
          
          // Show all commands if no specific command was requested
          const categories = Object.values(CommandCategory);
          const commandsByCategory: Record<string, string[]> = {};
          
          // Group commands by category
          for (const cmd of interaction.client.commands.values()) {
            if (!commandsByCategory[cmd.category]) {
              commandsByCategory[cmd.category] = [];
            }
            commandsByCategory[cmd.category].push(cmd.name);
          }
          
          // Create a help embed
          const helpEmbed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('Bot Commands')
            .setDescription('Here are all the available commands:')
            .setFooter({ text: 'For detailed help on a specific command, use `/help [command]` or `+help [command]`' });
          
          // Add each category as a field
          for (const category of categories) {
            const commands = commandsByCategory[category] || [];
            if (commands.length > 0) {
              helpEmbed.addFields({
                name: `${category} Commands`,
                value: commands.map(cmd => `\`${cmd}\``).join(', ')
              });
            }
          }
          
          await interaction.reply({
            embeds: [helpEmbed],
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