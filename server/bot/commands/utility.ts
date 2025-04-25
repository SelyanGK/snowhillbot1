import { Command, getCommandPrefix } from '../utils';
import { CommandCategory } from '@shared/schema';
import { EmbedBuilder, version as discordJsVersion, TextChannel, PermissionsBitField } from 'discord.js';
import { incrementCommandsUsed } from '../index';
import { storage } from '../../storage';
import { performance } from 'perf_hooks';
import os from 'os';

// Schedule tracking for recurring messages
interface ScheduledMessage {
  id: string;
  channelId: string;
  serverId: string;
  createdBy: string;
  content: string;
  interval: number; // in minutes
  nextRun: Date;
  timer: NodeJS.Timeout;
}

const scheduledMessages = new Map<string, ScheduledMessage>();

// Utility commands collection
export const utilityCommands: Command[] = [
  // New Schedule command
  {
    name: 'schedule',
    description: 'Schedule recurring messages in a channel',
    usage: '+schedule [action] [parameters]',
    aliases: ['recurring', 'recur'],
    category: CommandCategory.UTILITY,
    cooldown: 10,
    requiredPermissions: ['ManageMessages'],
    execute: async (message, args) => {
      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }
      
      const prefix = getCommandPrefix(message);
      
      // Check for sufficient permissions
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply('You need the **Manage Messages** permission to use this command.');
      }
      
      // If no args provided, show help
      if (args.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📅 Scheduled Messages')
          .setDescription('Schedule messages to be sent automatically at regular intervals.')
          .addFields(
            { name: `${prefix}schedule create [interval] [channel] [message]`, value: 'Creates a new scheduled message.\n' +
              '• interval: Time in minutes between messages (15-10080)\n' +
              '• channel: The target channel (mention)\n' +
              '• message: The message content to send', inline: false },
            { name: `${prefix}schedule list`, value: 'Lists all scheduled messages for this server.', inline: false },
            { name: `${prefix}schedule remove [id]`, value: 'Removes a scheduled message by its ID.', inline: false },
            { name: 'Examples', value: `${prefix}schedule create 60 #announcements Daily reminder to check announcements!\n` +
              `${prefix}schedule list\n` +
              `${prefix}schedule remove 123456`, inline: false }
          )
          .setFooter({ text: 'Scheduled messages persist until manually removed or the bot restarts.' });
        
        return message.reply({ embeds: [embed] });
      }
      
      const action = args[0]?.toLowerCase();
      
      // Handle different actions
      switch (action) {
        case 'create':
        case 'add':
        case 'new':
          // Check arguments
          if (args.length < 4) {
            return message.reply(`Please provide all required parameters: ${prefix}schedule create [interval] [channel] [message]`);
          }
          
          // Parse interval
          const interval = parseInt(args[1]);
          if (isNaN(interval) || interval < 15 || interval > 10080) { // 15 min to 7 days (10080 min)
            return message.reply('Please provide a valid interval between 15 and 10080 minutes (7 days).');
          }
          
          // Parse channel
          const channelMention = args[2];
          const channelId = channelMention.replace(/[<#>]/g, '');
          const channel = message.guild.channels.cache.get(channelId);
          
          if (!channel || !(channel instanceof TextChannel)) {
            return message.reply('Please provide a valid text channel.');
          }
          
          // Check bot permissions for the channel
          const permissions = channel.permissionsFor(message.guild.members.me!);
          if (!permissions || !permissions.has(['SendMessages', 'ViewChannel'])) {
            return message.reply(`I don't have permission to send messages in ${channel}.`);
          }
          
          // Get message content
          const content = args.slice(3).join(' ');
          if (!content || content.length > 2000) {
            return message.reply('Please provide a valid message content (1-2000 characters).');
          }
          
          // Create a unique ID for this scheduled message
          const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
          const nextRun = new Date(Date.now() + interval * 60000);
          
          // Set up recurring timer
          const timer = setInterval(async () => {
            try {
              await channel.send(content);
              
              // Update next run time
              const scheduled = scheduledMessages.get(id);
              if (scheduled) {
                scheduled.nextRun = new Date(Date.now() + interval * 60000);
              }
            } catch (error) {
              console.error(`Error sending scheduled message ${id}:`, error);
              
              // If channel no longer exists or bot lost permissions, clean up
              try {
                const ch = message.guild!.channels.cache.get(channel.id);
                if (!ch || !(ch instanceof TextChannel)) {
                  clearInterval(timer);
                  scheduledMessages.delete(id);
                  console.log(`Removed scheduled message ${id} - channel no longer exists.`);
                }
              } catch (e) {
                // Ignore errors in cleanup
              }
            }
          }, interval * 60000);
          
          // Store scheduled message
          scheduledMessages.set(id, {
            id,
            channelId: channel.id,
            serverId: message.guild.id,
            createdBy: message.author.id,
            content,
            interval,
            nextRun,
            timer
          });
          
          // Send confirmation
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📅 Scheduled Message Created')
            .addFields(
              { name: 'ID', value: id, inline: true },
              { name: 'Interval', value: `${interval} minutes`, inline: true },
              { name: 'Channel', value: `<#${channel.id}>`, inline: true },
              { name: 'First Run', value: `<t:${Math.floor(nextRun.getTime() / 1000)}:R>`, inline: true },
              { name: 'Created By', value: `<@${message.author.id}>`, inline: true },
              { name: 'Message Content', value: content.length > 1024 ? content.substring(0, 1021) + '...' : content }
            );
          
          return message.reply({ embeds: [embed] });
        
        case 'list':
          // Get all scheduled messages for this server
          const serverSchedules = Array.from(scheduledMessages.values())
            .filter(schedule => schedule.serverId === message.guild!.id);
          
          if (serverSchedules.length === 0) {
            return message.reply('There are no scheduled messages in this server.');
          }
          
          // Create embed with list
          const listEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📅 Scheduled Messages (${serverSchedules.length})`)
            .setDescription('Here are all the scheduled messages for this server:');
          
          // Add fields for each scheduled message
          serverSchedules.forEach(schedule => {
            const channel = message.guild!.channels.cache.get(schedule.channelId);
            const channelName = channel ? `<#${channel.id}>` : 'Unknown Channel';
            
            listEmbed.addFields({
              name: `ID: ${schedule.id}`,
              value: `**Channel:** ${channelName}\n` +
                `**Interval:** ${schedule.interval} minutes\n` +
                `**Next Run:** <t:${Math.floor(schedule.nextRun.getTime() / 1000)}:R>\n` +
                `**Content:** ${schedule.content.length > 100 ? schedule.content.substring(0, 97) + '...' : schedule.content}`
            });
          });
          
          return message.reply({ embeds: [listEmbed] });
        
        case 'remove':
        case 'delete':
          // Check for ID
          if (args.length < 2) {
            return message.reply(`Please provide the ID of the scheduled message to remove: ${prefix}schedule remove [id]`);
          }
          
          const removeId = args[1];
          const scheduleToRemove = scheduledMessages.get(removeId);
          
          // Check if schedule exists and belongs to this server
          if (!scheduleToRemove) {
            return message.reply(`No scheduled message found with ID: ${removeId}`);
          }
          
          if (scheduleToRemove.serverId !== message.guild.id) {
            return message.reply(`No scheduled message found with ID: ${removeId}`);
          }
          
          // Clear interval and remove from map
          clearInterval(scheduleToRemove.timer);
          scheduledMessages.delete(removeId);
          
          return message.reply(`✅ Scheduled message with ID ${removeId} has been removed.`);
        
        default:
          return message.reply(`Unknown action: ${action}. Use \`${prefix}schedule\` for help.`);
      }
    }
  },
  
  // 1. Ping command
  {
    name: 'ping',
    description: 'Checks the bot\'s response time',
    usage: '+ping',
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message) => {
      // Record start time
      const start = performance.now();
      
      // Send initial message
      const msg = await message.reply('🏓 Pinging...');
      
      // Calculate bot latency
      const botLatency = Math.round(performance.now() - start);
      
      // Calculate API latency
      const apiLatency = message.client.ws.ping;
      
      // Create and send embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🏓 Pong!')
        .addFields(
          { name: 'Bot Latency', value: `${botLatency}ms`, inline: true },
          { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
        );
      
      await msg.edit({ content: null, embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      if (message.guild) {
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: 'ping'
        });
      }
    }
  },

  // 2. Serverinfo command
  {
    name: 'serverinfo',
    description: 'Displays information about the current server',
    usage: '!serverinfo',
    aliases: ['server', 'guild', 'guildinfo'],
    category: CommandCategory.UTILITY,
    cooldown: 10,
    requiredPermissions: [],
    execute: async (message) => {
      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }
      
      // Fetch the guild
      const guild = message.guild;
      await guild.fetch();
      
      // Count roles (excluding @everyone)
      const roleCount = guild.roles.cache.size - 1;
      
      // Count channels
      const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
      const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
      const categoryChannels = guild.channels.cache.filter(c => c.type === 4).size;
      
      // Get boost status
      const boostLevel = guild.premiumTier;
      const boostCount = guild.premiumSubscriptionCount;
      
      // Server creation date
      const createdAt = guild.createdAt;
      const createdDaysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`${guild.name} Server Information`)
        .setThumbnail(guild.iconURL() || '')
        .addFields(
          { name: 'Server ID', value: guild.id, inline: true },
          { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
          { name: 'Created', value: `${createdAt.toUTCString()}\n(${createdDaysAgo} days ago)`, inline: false },
          { name: 'Members', value: `${guild.memberCount} members`, inline: true },
          { name: 'Channels', value: `${textChannels} text | ${voiceChannels} voice | ${categoryChannels} categories`, inline: true },
          { name: 'Roles', value: `${roleCount} roles`, inline: true },
          { name: 'Boost Status', value: `Level ${boostLevel} (${boostCount} boosts)`, inline: true },
          { name: 'Verification Level', value: guild.verificationLevel.toString(), inline: true }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();
      
      // Add server banner if available
      if (guild.banner) {
        embed.setImage(guild.bannerURL() || '');
      }
      
      await message.reply({ embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      await storage.createActivityLog({
        serverId: guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: 'serverinfo'
      });
    }
  },

  // 3. Userinfo command
  {
    name: 'userinfo',
    description: 'Displays information about a user',
    usage: '!userinfo [@user]',
    aliases: ['whois', 'user'],
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }
      
      // Target user (mentioned user or message author)
      const user = message.mentions.users.first() || message.author;
      
      // Get the member object
      const member = await message.guild.members.fetch(user.id);
      
      // Calculate join dates
      const joinedAt = member.joinedAt;
      const createdAt = user.createdAt;
      
      const joinedDaysAgo = joinedAt ? Math.floor((Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const createdDaysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      
      // Get roles (excluding @everyone)
      const roles = member.roles.cache
        .filter(role => role.id !== message.guild!.id)
        .sort((a, b) => b.position - a.position)
        .map(role => `<@&${role.id}>`)
        .join(', ') || 'None';
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(member.displayHexColor || 0x5865F2)
        .setTitle(`${user.tag}'s Information`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'User ID', value: user.id, inline: true },
          { name: 'Nickname', value: member.nickname || 'None', inline: true },
          { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
          { name: 'Account Created', value: `${createdAt.toUTCString()}\n(${createdDaysAgo} days ago)`, inline: false },
          { name: 'Joined Server', value: joinedAt ? `${joinedAt.toUTCString()}\n(${joinedDaysAgo} days ago)` : 'Unknown', inline: false },
          { name: `Roles [${member.roles.cache.size - 1}]`, value: roles.length > 1024 ? roles.substring(0, 1021) + '...' : roles, inline: false }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();
      
      // Add banner if available (for users with nitro)
      try {
        const fetchedUser = await user.fetch();
        if (fetchedUser.banner) {
          embed.setImage(fetchedUser.bannerURL({ size: 512 }) || '');
        }
      } catch (error) {
        // Ignore errors fetching banner
      }
      
      await message.reply({ embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      await storage.createActivityLog({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: `userinfo ${user.tag !== message.author.tag ? user.tag : ''}`
      });
    }
  },

  // 4. Avatar command
  {
    name: 'avatar',
    description: 'Shows a user\'s avatar',
    usage: '!avatar [@user]',
    aliases: ['pfp', 'icon'],
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      // Target user (mentioned user or message author)
      const user = message.mentions.users.first() || message.author;
      
      // Create embed with avatar
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`${user.tag}'s Avatar`)
        .setImage(user.displayAvatarURL({ size: 512 }))
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      if (message.guild) {
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: `avatar ${user.tag !== message.author.tag ? user.tag : ''}`
        });
      }
    }
  },

  // 5. Stats command (Bot statistics)
  {
    name: 'stats',
    description: 'Shows statistics about the bot',
    usage: '!stats',
    aliases: ['botstats', 'info', 'botinfo'],
    category: CommandCategory.UTILITY,
    cooldown: 10,
    requiredPermissions: [],
    execute: async (message) => {
      const client = message.client;
      
      // Calculate uptime
      const uptime = client.uptime;
      let uptimeString = 'Unknown';
      
      if (uptime) {
        const seconds = Math.floor(uptime / 1000) % 60;
        const minutes = Math.floor(uptime / (1000 * 60)) % 60;
        const hours = Math.floor(uptime / (1000 * 60 * 60)) % 24;
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
        
        uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      }
      
      // Get system info
      const memoryUsage = process.memoryUsage();
      const memoryUsedMB = Math.round(memoryUsage.rss / 1024 / 1024);
      const totalMemoryMB = Math.round(os.totalmem() / 1024 / 1024);
      const memoryPercentage = Math.round((memoryUsedMB / totalMemoryMB) * 100);
      
      // Get stats
      const guildCount = client.guilds.cache.size;
      const userCount = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
      const channelCount = client.channels.cache.size;
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Snowhill Bot Statistics')
        .setThumbnail(client.user?.displayAvatarURL() || '')
        .addFields(
          { name: 'Bot Info', value: [
            `**Servers:** ${guildCount}`,
            `**Users:** ${userCount}`,
            `**Channels:** ${channelCount}`,
            `**Uptime:** ${uptimeString}`
          ].join('\n'), inline: false },
          { name: 'System Info', value: [
            `**Memory:** ${memoryUsedMB}MB / ${totalMemoryMB}MB (${memoryPercentage}%)`,
            `**Node.js:** ${process.version}`,
            `**Discord.js:** v${discordJsVersion}`,
            `**Platform:** ${os.platform()} ${os.release()}`
          ].join('\n'), inline: false }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      if (message.guild) {
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: 'stats'
        });
      }
    }
  },

  // 6. Invite command
  {
    name: 'invite',
    description: 'Generates an invite link for the bot',
    usage: '!invite',
    category: CommandCategory.UTILITY,
    cooldown: 10,
    requiredPermissions: [],
    execute: async (message) => {
      // Generate bot invite with necessary permissions
      const client = message.client;
      const inviteUrl = client.generateInvite({
        scopes: ['bot', 'applications.commands'],
        permissions: [
          'ViewChannel',
          'SendMessages',
          'EmbedLinks',
          'AttachFiles',
          'ReadMessageHistory',
          'UseExternalEmojis',
          'AddReactions',
          'BanMembers',
          'KickMembers',
          'ModerateMembers',
          'ManageMessages',
          'ManageChannels',
          'ManageRoles'
        ]
      });
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Invite Snowhill Bot')
        .setDescription(`Click the link below to add Snowhill Bot to your server:`)
        .addFields(
          { name: 'Invite Link', value: `[Click Here](${inviteUrl})` }
        )
        .setFooter({ text: 'Thank you for using Snowhill Bot!' });
      
      await message.reply({ embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      if (message.guild) {
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: 'invite'
        });
      }
    }
  },

  // 7. Say command
  {
    name: 'say',
    description: 'Makes the bot say something',
    usage: '!say [message]',
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: ['ManageMessages'],
    execute: async (message, args) => {
      // Check for required permissions
      if (!message.member?.permissions.has('ManageMessages')) {
        return message.reply('You need the Manage Messages permission to use this command.');
      }
      
      // Check if a message was provided
      if (!args.length) {
        return message.reply('Please provide a message for me to say.');
      }
      
      // Join the arguments to form the message
      const text = args.join(' ');
      
      // Delete the user's command message if in a guild
      if (message.guild) {
        try {
          await message.delete();
        } catch (error) {
          // Couldn't delete message, continue anyway
        }
      }
      
      // Send the message
      await message.channel.send(text);
      
      // Log command usage
      incrementCommandsUsed();
      
      if (message.guild) {
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: 'say'
        });
      }
    }
  },

  // 8. Poll command (advanced version)
  {
    name: 'advpoll',
    description: 'Creates an advanced poll with multiple options',
    usage: '!advpoll "Question" "Option 1" "Option 2" "Option 3"...',
    aliases: ['advancedpoll', 'polladvanced'],
    category: CommandCategory.UTILITY,
    cooldown: 30,
    requiredPermissions: [],
    execute: async (message, args) => {
      // Combine args and extract quoted parts
      const combined = args.join(' ');
      const matches = combined.match(/"([^"]+)"/g);
      
      if (!matches || matches.length < 3) {
        return message.reply('Please provide a question and at least 2 options enclosed in quotation marks. Example: `!advpoll "Favorite color?" "Red" "Blue" "Green"`');
      }
      
      // Extract question and options
      const question = matches[0].replace(/"/g, '');
      const options = matches.slice(1).map(option => option.replace(/"/g, ''));
      
      // Limit options to 10 (because of available emoji reactions)
      if (options.length > 10) {
        return message.reply('You can only have a maximum of 10 options in a poll.');
      }
      
      // Emoji number mappings
      const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      
      // Create formatted options text with emojis
      const optionsText = options.map((option, index) => `${reactions[index]} ${option}`).join('\n\n');
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📊 Poll: ${question}`)
        .setDescription(optionsText)
        .setFooter({ text: `Poll created by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();
      
      // Send poll message
      const pollMessage = await message.channel.send({ embeds: [embed] });
      
      // Add reactions for voting
      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(reactions[i]);
      }
      
      // Send confirmation to user
      await message.reply('Poll created!');
      
      // Log command usage
      incrementCommandsUsed();
      
      if (message.guild) {
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: 'advpoll'
        });
      }
    }
  },

  // 9. Reminder command
  {
    name: 'remind',
    description: 'Sets a reminder for a specified time',
    usage: '!remind [time] [reminder text]',
    aliases: ['reminder', 'remindme'],
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (args.length < 2) {
        return message.reply('Please provide both a time and reminder text. Example: `!remind 10m Check the oven`');
      }
      
      // Get time string and parse it
      const timeStr = args[0].toLowerCase();
      const timeRegex = /^(\d+)([smhdw])$/;
      const match = timeStr.match(timeRegex);
      
      if (!match) {
        return message.reply('Invalid time format. Use a number followed by s(seconds), m(minutes), h(hours), d(days), or w(weeks). Example: `10m`, `1h`, `30s`');
      }
      
      // Parse the value and unit
      const value = parseInt(match[1]);
      const unit = match[2];
      
      // Calculate milliseconds
      let milliseconds = 0;
      switch (unit) {
        case 's': milliseconds = value * 1000; break;
        case 'm': milliseconds = value * 60 * 1000; break;
        case 'h': milliseconds = value * 60 * 60 * 1000; break;
        case 'd': milliseconds = value * 24 * 60 * 60 * 1000; break;
        case 'w': milliseconds = value * 7 * 24 * 60 * 60 * 1000; break;
      }
      
      // Limit maximum reminder time to 7 days
      const maxTime = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (milliseconds > maxTime) {
        return message.reply('Reminder time too long. Maximum reminder time is 7 days.');
      }
      
      // Get the reminder text
      const reminderText = args.slice(1).join(' ');
      
      // Calculate and format reminder time
      const now = new Date();
      const reminderTime = new Date(now.getTime() + milliseconds);
      
      // Create confirmation embed
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⏰ Reminder Set')
        .setDescription(`I'll remind you: "${reminderText}"`)
        .addFields(
          { name: 'Reminder Time', value: `<t:${Math.floor(reminderTime.getTime() / 1000)}:R>` }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` });
      
      await message.reply({ embeds: [confirmEmbed] });
      
      // Set the reminder
      setTimeout(async () => {
        try {
          // Create reminder embed
          const reminderEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏰ Reminder')
            .setDescription(reminderText)
            .addFields(
              { name: 'Reminder Set', value: `<t:${Math.floor(now.getTime() / 1000)}:R>` }
            )
            .setFooter({ text: `Requested by ${message.author.tag}` });
          
          // Send DM to user
          await message.author.send({ 
            content: `Hey ${message.author}, here's your reminder!`,
            embeds: [reminderEmbed] 
          });
        } catch (error) {
          // If can't DM, send in channel
          try {
            await message.channel.send({
              content: `<@${message.author.id}>, here's your reminder!`,
              embeds: [
                new EmbedBuilder()
                  .setColor(0x5865F2)
                  .setTitle('⏰ Reminder')
                  .setDescription(reminderText)
              ]
            });
          } catch (channelError) {
            console.error('Failed to send reminder:', channelError);
          }
        }
      }, milliseconds);
      
      // Log command usage
      incrementCommandsUsed();
      
      if (message.guild) {
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: 'remind'
        });
      }
    }
  },

  // 10. Role info command
  {
    name: 'roleinfo',
    description: 'Displays information about a role',
    usage: '!roleinfo [@role]',
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }
      
      // Get the role
      const role = message.mentions.roles.first();
      
      if (!role) {
        return message.reply('Please mention a role to get information about.');
      }
      
      // Format creation date
      const createdAt = role.createdAt;
      const createdDaysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      
      // Get role permissions
      const permissions = role.permissions.toArray();
      const formattedPermissions = permissions.length ? permissions.join(', ').replace(/_/g, ' ').toLowerCase() : 'None';
      
      // Count members with this role
      const membersWithRole = role.members.size;
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(role.color || 0x5865F2)
        .setTitle(`Role Information: ${role.name}`)
        .addFields(
          { name: 'Role ID', value: role.id, inline: true },
          { name: 'Color', value: role.hexColor, inline: true },
          { name: 'Position', value: role.position.toString(), inline: true },
          { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
          { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
          { name: 'Managed', value: role.managed ? 'Yes' : 'No', inline: true },
          { name: 'Created', value: `${createdAt.toUTCString()}\n(${createdDaysAgo} days ago)`, inline: false },
          { name: 'Members', value: membersWithRole.toString(), inline: true },
          { name: 'Key Permissions', value: formattedPermissions.length > 1024 ? formattedPermissions.substring(0, 1021) + '...' : formattedPermissions, inline: false }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      await storage.createActivityLog({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: `roleinfo ${role.name}`
      });
    }
  },

  // 11. Channel info command
  {
    name: 'channelinfo',
    description: 'Displays information about a channel',
    usage: '!channelinfo [#channel]',
    aliases: ['channel'],
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }
      
      // Get the channel (mentioned or current)
      const channel = message.mentions.channels.first() || message.channel;
      
      // Format creation date
      const createdAt = channel.createdAt;
      const createdDaysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      
      // Get channel type
      let channelType = 'Unknown';
      switch (channel.type) {
        case 0: channelType = 'Text Channel'; break;
        case 2: channelType = 'Voice Channel'; break;
        case 4: channelType = 'Category'; break;
        case 5: channelType = 'Announcement Channel'; break;
        case 10: channelType = 'Thread'; break;
        case 11: channelType = 'Thread (Private)'; break;
        case 13: channelType = 'Stage Channel'; break;
        case 15: channelType = 'Forum Channel'; break;
      }
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Channel Information: ${channel.name}`)
        .addFields(
          { name: 'Channel ID', value: channel.id, inline: true },
          { name: 'Type', value: channelType, inline: true },
          { name: 'Category', value: channel.parent ? channel.parent.name : 'None', inline: true },
          { name: 'Position', value: channel.position.toString(), inline: true },
          { name: 'Created', value: `${createdAt.toUTCString()}\n(${createdDaysAgo} days ago)`, inline: false }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();
      
      // Add extra fields based on channel type
      if (channel.type === 0) {
        // Text channel
        const slowmode = channel.rateLimitPerUser;
        embed.addFields(
          { name: 'NSFW', value: channel.nsfw ? 'Yes' : 'No', inline: true },
          { name: 'Slowmode', value: slowmode ? `${slowmode} seconds` : 'Disabled', inline: true }
        );
      } else if (channel.type === 2) {
        // Voice channel
        const userLimit = channel.userLimit;
        const bitrate = channel.bitrate;
        embed.addFields(
          { name: 'User Limit', value: userLimit ? userLimit.toString() : 'Unlimited', inline: true },
          { name: 'Bitrate', value: `${Math.floor(bitrate / 1000)} kbps`, inline: true }
        );
      }
      
      await message.reply({ embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      await storage.createActivityLog({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: `channelinfo ${channel.id !== message.channel.id ? channel.name : ''}`
      });
    }
  },

  // 12. Emoji info command
  {
    name: 'emojiinfo',
    description: 'Displays information about an emoji',
    usage: '!emojiinfo [emoji]',
    aliases: ['emoji'],
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }
      
      // Regex to match custom emoji
      const emojiRegex = /<a?:([a-zA-Z0-9_]+):(\d+)>/;
      const match = args[0]?.match(emojiRegex);
      
      if (!match) {
        return message.reply('Please provide a custom server emoji. Example: `!emojiinfo 😀` or `!emojiinfo :custom_emoji:`');
      }
      
      // Extract emoji info
      const emojiName = match[1];
      const emojiId = match[2];
      const animated = args[0].startsWith('<a:');
      
      // Try to fetch the emoji
      let emoji;
      try {
        emoji = await message.guild.emojis.fetch(emojiId);
      } catch (error) {
        return message.reply('This emoji is not from this server or could not be found.');
      }
      
      // Format creation date
      const createdAt = emoji.createdAt;
      const createdDaysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      
      // Get emoji URLs
      const emojiUrl = emoji.url;
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Emoji Information: ${emoji.name}`)
        .setThumbnail(emojiUrl)
        .addFields(
          { name: 'Emoji ID', value: emoji.id, inline: true },
          { name: 'Name', value: emoji.name || 'Unknown', inline: true },
          { name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true },
          { name: 'Server', value: emoji.guild.name, inline: true },
          { name: 'Created', value: `${createdAt.toUTCString()}\n(${createdDaysAgo} days ago)`, inline: false },
          { name: 'Usage', value: `\`<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>\``, inline: false },
          { name: 'URL', value: `[Download](${emojiUrl})`, inline: false }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      await storage.createActivityLog({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: `emojiinfo ${emojiName}`
      });
    }
  },

  // 13. Calculate command
  {
    name: 'calculate',
    description: 'Performs a mathematical calculation',
    usage: '!calculate [expression]',
    aliases: ['calc', 'math'],
    category: CommandCategory.UTILITY,
    cooldown: 3,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!args.length) {
        return message.reply('Please provide a mathematical expression to calculate.');
      }
      
      // Join args to get the expression
      const expression = args.join(' ');
      
      // Define safe math functions
      const mathFunctions = {
        abs: Math.abs,
        acos: Math.acos,
        asin: Math.asin,
        atan: Math.atan,
        atan2: Math.atan2,
        ceil: Math.ceil,
        cos: Math.cos,
        exp: Math.exp,
        floor: Math.floor,
        log: Math.log,
        max: Math.max,
        min: Math.min,
        pow: Math.pow,
        random: Math.random,
        round: Math.round,
        sin: Math.sin,
        sqrt: Math.sqrt,
        tan: Math.tan,
        PI: Math.PI,
        E: Math.E
      };
      
      try {
        // Create a safe function to evaluate the expression
        const safeEval = (expr: string) => {
          // Check for unsafe patterns (e.g., function calls that aren't whitelisted)
          const unsafePattern = /[^0-9+\-*/().,%\s]/g;
          const matches = expr.match(unsafePattern);
          
          if (matches) {
            const safeMatches = matches.filter(match => !Object.keys(mathFunctions).includes(match));
            if (safeMatches.length > 0) {
              throw new Error('Expression contains unsafe characters or functions');
            }
          }
          
          // Replace math function names with their values
          let safeExpr = expr;
          for (const [name, func] of Object.entries(mathFunctions)) {
            safeExpr = safeExpr.replace(new RegExp(name, 'g'), `mathFunctions.${name}`);
          }
          
          // Use Function constructor to evaluate in isolated scope
          const fn = new Function('mathFunctions', `"use strict"; return ${safeExpr};`);
          return fn(mathFunctions);
        };
        
        // Calculate the result
        const result = safeEval(expression);
        
        // Format the result
        let formattedResult;
        if (typeof result === 'number') {
          if (Number.isInteger(result)) {
            formattedResult = result.toString();
          } else {
            formattedResult = result.toFixed(4).replace(/\.?0+$/, '');
          }
        } else {
          formattedResult = String(result);
        }
        
        // Create embed
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🧮 Calculator')
          .addFields(
            { name: 'Expression', value: '```\n' + expression + '\n```' },
            { name: 'Result', value: '```\n' + formattedResult + '\n```' }
          )
          .setFooter({ text: `Requested by ${message.author.tag}` });
        
        await message.reply({ embeds: [embed] });
      } catch (error) {
        return message.reply('I couldn\'t calculate that expression. Please check your syntax and try again.');
      }
      
      // Log command usage
      incrementCommandsUsed();
      
      if (message.guild) {
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: 'calculate'
        });
      }
    }
  },

  // 14. AFK command
  {
    name: 'afk',
    description: 'Sets your AFK status with an optional reason',
    usage: '!afk [reason]',
    category: CommandCategory.UTILITY,
    cooldown: 10,
    requiredPermissions: [],
    execute: async (message, args) => {
      // Get the reason (or default)
      const reason = args.length ? args.join(' ') : 'No reason specified';
      
      // Change nickname to indicate AFK (if possible)
      if (message.guild && message.member && message.guild.members.me?.permissions.has('ManageNicknames')) {
        const currentNick = message.member.nickname || message.author.username;
        
        // Only add [AFK] if not already there
        if (!currentNick.startsWith('[AFK]')) {
          try {
            await message.member.setNickname(`[AFK] ${currentNick.length > 27 ? currentNick.substring(0, 27) : currentNick}`);
          } catch (error) {
            // Ignore errors if can't change nickname
          }
        }
      }
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('AFK Status Set')
        .setDescription(`${message.author.tag} is now AFK.`)
        .addFields(
          { name: 'Reason', value: reason }
        )
        .setFooter({ text: 'I\'ll notify users who mention you' });
      
      await message.reply({ embeds: [embed] });
      
      // Log command usage
      incrementCommandsUsed();
      
      if (message.guild) {
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: 'afk'
        });
      }
      
      // Note: In a full implementation, you would store the AFK status in a database
      // and have a message event handler to handle mentions of AFK users
    }
  },

  // 15. Server Banner command
  {
    name: 'banner',
    description: 'Shows the server\'s banner or a user\'s banner',
    usage: '!banner [optional: user]',
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }
      
      // Check if user is mentioned
      const mentionedUser = message.mentions.users.first();
      
      if (mentionedUser) {
        // Show user banner
        try {
          const fetchedUser = await mentionedUser.fetch();
          
          if (!fetchedUser.banner) {
            return message.reply(`${mentionedUser.tag} doesn't have a banner.`);
          }
          
          const bannerUrl = fetchedUser.bannerURL({ size: 4096 });
          
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`${mentionedUser.tag}'s Banner`)
            .setImage(bannerUrl)
            .setFooter({ text: `Requested by ${message.author.tag}` });
          
          await message.reply({ embeds: [embed] });
        } catch (error) {
          return message.reply('Failed to fetch user banner.');
        }
      } else {
        // Show server banner
        const guild = await message.guild.fetch();
        
        if (!guild.banner) {
          return message.reply('This server doesn\'t have a banner.');
        }
        
        const bannerUrl = guild.bannerURL({ size: 4096 });
        
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`${guild.name}'s Banner`)
          .setImage(bannerUrl)
          .setFooter({ text: `Requested by ${message.author.tag}` });
        
        await message.reply({ embeds: [embed] });
      }
      
      // Log command usage
      incrementCommandsUsed();
      
      await storage.createActivityLog({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: `banner ${mentionedUser ? mentionedUser.tag : ''}`
      });
    }
  },
];
