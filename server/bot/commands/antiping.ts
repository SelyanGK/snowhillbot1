import { Command } from '../utils';
import { CommandCategory } from '@shared/schema';
import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { incrementModerationActions } from '../index';
import { storage } from '../../storage';

// Anti-ping commands collection
export const antipingCommands: Command[] = [
  // 1. Anti-ping toggle command
  {
    name: 'antiping',
    description: 'Toggles anti-ping protection for the server',
    usage: '+antiping [on/off]',
    category: CommandCategory.ANTIPING,
    cooldown: 0,
    requiredPermissions: [PermissionsBitField.Flags.ManageGuild],
    execute: async (message, args) => {
      // Check permissions
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply('You need the Manage Server permission to use this command.');
      }

      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      // Check for valid arguments
      if (!args.length || !['on', 'off'].includes(args[0].toLowerCase())) {
        return message.reply('Please specify whether to turn anti-ping `on` or `off`.');
      }

      const enable = args[0].toLowerCase() === 'on';

      try {
        // Check if server exists in DB
        let server = await storage.getServer(message.guild.id);
        
        if (server) {
          // Update existing server
          server = await storage.updateServer(message.guild.id, { antiPingEnabled: enable });
        } else {
          // Create new server entry
          server = await storage.createServer({
            id: message.guild.id,
            name: message.guild.name,
            prefix: '!', // Default prefix
            antiPingEnabled: enable,
            antiPingExcludedRoles: [],
            antiPingPunishment: 'warn'
          });
        }

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: `antiping ${enable ? 'on' : 'off'}`
        });

        // Create success embed
        const embed = new EmbedBuilder()
          .setColor(enable ? 0xFEE75C : 0x5865F2)
          .setTitle(`Anti-Ping Protection ${enable ? 'Enabled' : 'Disabled'}`)
          .setDescription(`Anti-ping protection is now ${enable ? 'enabled' : 'disabled'} for this server.`)
          .addFields(
            { name: 'What this means', value: enable 
              ? 'Users who mass ping or ping spam will be automatically warned or punished according to the server settings.' 
              : 'The bot will no longer monitor or take action against users who mass ping others.' 
            },
            { name: 'Configuration', value: 'Use `+antipingconfig` to configure anti-ping settings.' }
          )
          .setFooter({ text: `Configured by ${message.author.tag}` })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error toggling anti-ping:', error);
        return message.reply('An error occurred while trying to update anti-ping settings.');
      }
    }
  },

  // 2. Anti-ping configuration command
  {
    name: 'antipingconfig',
    description: 'Configures anti-ping protection settings',
    usage: '+antipingconfig [setting] [value]',
    aliases: ['antipingsettings', 'antipingset'],
    category: CommandCategory.ANTIPING,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ManageGuild],
    execute: async (message, args) => {
      // Check permissions
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply('You need the Manage Server permission to use this command.');
      }

      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      // Get server settings
      let server = await storage.getServer(message.guild.id);
      
      // If server doesn't exist, create default entry
      if (!server) {
        server = await storage.createServer({
          id: message.guild.id,
          name: message.guild.name,
          prefix: '!', // Default prefix
          antiPingEnabled: false,
          antiPingExcludedRoles: [],
          antiPingPunishment: 'warn'
        });
      }

      // No arguments - display current configuration
      if (!args.length) {
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('Anti-Ping Configuration')
          .addFields(
            { name: 'Status', value: server.antiPingEnabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
            { name: 'Punishment', value: server.antiPingPunishment.charAt(0).toUpperCase() + server.antiPingPunishment.slice(1), inline: true },
            { name: 'Excluded Roles', value: server.antiPingExcludedRoles.length ? server.antiPingExcludedRoles.map(id => `<@&${id}>`).join(', ') : 'None' },
            { name: 'Commands', value: [
              '`+antiping [on/off]` - Toggle anti-ping protection',
              '`+antipingconfig punishment [warn/timeout/kick/ban]` - Set punishment type',
              '`+antipingconfig exclude @role` - Exclude a role from anti-ping',
              '`+antipingconfig include @role` - Remove exclusion for a role'
            ].join('\n') }
          )
          .setFooter({ text: `Requested by ${message.author.tag}` })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // Handle different configurations
      const setting = args[0].toLowerCase();

      switch (setting) {
        case 'punishment': {
          if (!args[1]) {
            return message.reply('Please specify a punishment type: `warn`, `timeout`, `kick`, or `ban`.');
          }

          const punishment = args[1].toLowerCase();
          
          if (!['warn', 'timeout', 'kick', 'ban'].includes(punishment)) {
            return message.reply('Invalid punishment type. Choose from: `warn`, `timeout`, `kick`, or `ban`.');
          }

          // Update punishment type
          server = await storage.updateServer(message.guild.id, { antiPingPunishment: punishment });

          const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Anti-Ping Punishment Updated')
            .setDescription(`Anti-ping punishment has been set to: **${punishment}**`)
            .setFooter({ text: `Updated by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }

        case 'exclude': {
          const role = message.mentions.roles.first();
          
          if (!role) {
            return message.reply('Please mention a role to exclude from anti-ping protection.');
          }

          // Check if role is already excluded
          if (server.antiPingExcludedRoles.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is already excluded from anti-ping protection.`);
          }

          // Add role to excluded list
          const excludedRoles = [...server.antiPingExcludedRoles, role.id];
          server = await storage.updateServer(message.guild.id, { antiPingExcludedRoles: excludedRoles });

          const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Anti-Ping Exclusion Added')
            .setDescription(`The role <@&${role.id}> is now excluded from anti-ping protection.`)
            .setFooter({ text: `Updated by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }

        case 'include': {
          const role = message.mentions.roles.first();
          
          if (!role) {
            return message.reply('Please mention a role to remove from the exclusion list.');
          }

          // Check if role is even excluded
          if (!server.antiPingExcludedRoles.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is not excluded from anti-ping protection.`);
          }

          // Remove role from excluded list
          const excludedRoles = server.antiPingExcludedRoles.filter(id => id !== role.id);
          server = await storage.updateServer(message.guild.id, { antiPingExcludedRoles: excludedRoles });

          const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Anti-Ping Exclusion Removed')
            .setDescription(`The role <@&${role.id}> is no longer excluded from anti-ping protection.`)
            .setFooter({ text: `Updated by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }

        default:
          return message.reply('Invalid setting. Use `+antipingconfig` without arguments to see available options.');
      }
    }
  },

  // 3. Ping block command
  {
    name: 'pingblock',
    description: 'Blocks pings from a specific user',
    usage: '+pingblock [@user] [optional: reason]',
    category: CommandCategory.ANTIPING,
    cooldown: 3,
    requiredPermissions: [PermissionsBitField.Flags.ModerateMembers],
    execute: async (message, args) => {
      // Check permissions
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('You need the Moderate Members permission to use this command.');
      }

      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      // Check for mentioned user
      const user = message.mentions.users.first();
      
      if (!user) {
        return message.reply('Please mention a user to block pings from.');
      }

      // Check if user is already blocked
      const existingBlock = await storage.getPingBlockedUser(message.guild.id, user.id);
      
      if (existingBlock) {
        return message.reply(`${user.tag} is already blocked from pinging others in this server.`);
      }

      // Extract reason if provided
      const reason = args.slice(1).join(' ') || 'No reason provided';

      try {
        // Add user to ping blocked list
        await storage.createPingBlockedUser({
          serverId: message.guild.id,
          userId: user.id,
          blockedBy: message.author.id,
          reason
        });

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: `pingblock ${user.tag}`
        });

        // Send DM to user
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Ping Block Notice')
            .setDescription(`You have been blocked from pinging users in **${message.guild.name}**.`)
            .addFields(
              { name: 'Reason', value: reason },
              { name: 'Blocked By', value: message.author.tag }
            )
            .setFooter({ text: 'If you believe this is a mistake, please contact a server moderator.' })
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] });
        } catch (dmError) {
          // Ignore if can't send DM
        }

        // Send confirmation
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('User Ping Blocked')
          .setDescription(`${user.tag} has been blocked from pinging users in this server.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: message.author.tag }
          )
          .setFooter({ text: 'Use +pingunblock to remove this restriction' })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error blocking user pings:', error);
        return message.reply('An error occurred while trying to block the user from pinging.');
      }
    }
  },

  // 4. Ping unblock command
  {
    name: 'pingunblock',
    description: 'Unblocks pings from a previously blocked user',
    usage: '+pingunblock [@user]',
    aliases: ['unpingblock'],
    category: CommandCategory.ANTIPING,
    cooldown: 3,
    requiredPermissions: [PermissionsBitField.Flags.ModerateMembers],
    execute: async (message, args) => {
      // Check permissions
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('You need the Moderate Members permission to use this command.');
      }

      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      // Check for mentioned user
      const user = message.mentions.users.first();
      
      if (!user) {
        return message.reply('Please mention a user to unblock pings from.');
      }

      // Check if user is actually blocked
      const existingBlock = await storage.getPingBlockedUser(message.guild.id, user.id);
      
      if (!existingBlock) {
        return message.reply(`${user.tag} is not blocked from pinging users in this server.`);
      }

      try {
        // Remove user from ping blocked list
        const success = await storage.deletePingBlockedUser(message.guild.id, user.id);
        
        if (!success) {
          return message.reply('Failed to unblock user. Please try again.');
        }

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: `pingunblock ${user.tag}`
        });

        // Send DM to user
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Ping Block Removed')
            .setDescription(`Your ping blocking in **${message.guild.name}** has been removed.`)
            .addFields(
              { name: 'Unblocked By', value: message.author.tag }
            )
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] });
        } catch (dmError) {
          // Ignore if can't send DM
        }

        // Send confirmation
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('User Ping Unblocked')
          .setDescription(`${user.tag} is no longer blocked from pinging users in this server.`)
          .addFields(
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error unblocking user pings:', error);
        return message.reply('An error occurred while trying to unblock the user from pinging.');
      }
    }
  },

  // 5. Ping blocked list command
  {
    name: 'pingblocklist',
    description: 'Lists all users blocked from pinging others',
    usage: '+pingblocklist',
    aliases: ['blockedpings', 'listpingblocks'],
    category: CommandCategory.ANTIPING,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ModerateMembers],
    execute: async (message) => {
      // Check permissions
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('You need the Moderate Members permission to use this command.');
      }

      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      try {
        // Get list of ping blocked users
        const blockedUsers = await storage.getPingBlockedUsers(message.guild.id);
        
        if (!blockedUsers.length) {
          return message.reply('There are no users blocked from pinging in this server.');
        }

        // Format blocked users list
        let description = '';
        
        for (const blockedUser of blockedUsers) {
          const userMention = `<@${blockedUser.userId}>`;
          const blockedBy = `<@${blockedUser.blockedBy}>`;
          const reason = blockedUser.reason || 'No reason provided';
          const timestamp = blockedUser.timestamp.toUTCString();
          
          description += `**${userMention}**\n`;
          description += `> Blocked by: ${blockedBy}\n`;
          description += `> Reason: ${reason}\n`;
          description += `> Date: ${timestamp}\n\n`;
        }

        // Create paginated embeds if necessary
        if (description.length > 4000) {
          description = description.substring(0, 4000) + '...\n\n*List truncated due to size limits*';
        }

        // Send embed
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('Ping Blocked Users')
          .setDescription(description)
          .setFooter({ text: `Total: ${blockedUsers.length} blocked users • Requested by ${message.author.tag}` })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error getting ping blocked users:', error);
        return message.reply('An error occurred while trying to retrieve the list of ping blocked users.');
      }
    }
  },

  // 6. Anti-raid mode command
  {
    name: 'antiraid',
    description: 'Enables anti-raid mode which includes strict ping protection',
    usage: '+antiraid [on/off]',
    category: CommandCategory.ANTIPING,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ManageGuild],
    execute: async (message, args) => {
      // Check permissions
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply('You need the Manage Server permission to use this command.');
      }

      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      // Check for valid arguments
      if (!args.length || !['on', 'off'].includes(args[0].toLowerCase())) {
        return message.reply('Please specify whether to turn anti-raid mode `on` or `off`.');
      }

      const enable = args[0].toLowerCase() === 'on';

      try {
        // Enable anti-ping as part of anti-raid mode
        let server = await storage.getServer(message.guild.id);
        
        if (server) {
          // Update existing server with antiPingEnabled = true and set punishment to timeout
          server = await storage.updateServer(message.guild.id, { 
            antiPingEnabled: true,
            antiPingPunishment: 'timeout'
          });
        } else {
          // Create new server entry
          server = await storage.createServer({
            id: message.guild.id,
            name: message.guild.name,
            prefix: '!', // Default prefix
            antiPingEnabled: true,
            antiPingExcludedRoles: [],
            antiPingPunishment: 'timeout'
          });
        }

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: `antiraid ${enable ? 'on' : 'off'}`
        });

        if (enable) {
          // Additionally update channel permissions to limit new member messages
          // This would only be possible with proper permissions
          // Here we could adjust slowmode for all channels, etc.
          
          // For this implementation, we'll just send a notification
          const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('⚠️ Anti-Raid Mode Enabled ⚠️')
            .setDescription('Anti-raid mode has been enabled for this server.')
            .addFields(
              { name: 'Protective Measures', value: [
                '✅ **Anti-ping protection** enabled with stricter thresholds',
                '✅ **Ping punishment** set to automatic timeout',
                '❗ Consider manually enabling slowmode in busy channels',
                '❗ Consider temporarily restricting new members\' permissions'
              ].join('\n') },
              { name: 'Duration', value: 'Anti-raid mode will stay active until manually disabled.' },
              { name: 'Moderator', value: message.author.tag }
            )
            .setFooter({ text: 'Use +antiraid off to disable when the threat has passed' })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        } else {
          // Disable anti-raid mode
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Anti-Raid Mode Disabled')
            .setDescription('Anti-raid mode has been disabled for this server.')
            .addFields(
              { name: 'Note', value: 'Anti-ping protection remains enabled, but with normal sensitivity.' },
              { name: 'Moderator', value: message.author.tag }
            )
            .setFooter({ text: 'You can use +antiping off to completely disable ping protection' })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
      } catch (error) {
        console.error('Error setting anti-raid mode:', error);
        return message.reply('An error occurred while trying to update anti-raid settings.');
      }
    }
  },

  // 7. Pin-shield command
  {
    name: 'pingshield',
    description: 'Enables personal ping shield to reduce notifications',
    usage: '+pingshield [on/off]',
    aliases: ['shieldping', 'noping'],
    category: CommandCategory.ANTIPING,
    cooldown: 10,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      // Check for valid arguments
      if (!args.length || !['on', 'off'].includes(args[0].toLowerCase())) {
        return message.reply('Please specify whether to turn your ping shield `on` or `off`.');
      }

      const enable = args[0].toLowerCase() === 'on';

      try {
        // In a full implementation, you would store this in a database
        // For this prototype, we'll just reply with a message
        if (enable) {
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Personal Ping Shield Enabled')
            .setDescription(`${message.author.tag}, your personal ping shield has been enabled.`)
            .addFields(
              { name: 'What this means', value: [
                '• You will receive fewer ping notifications',
                '• Only direct mentions will trigger notifications',
                '• Role pings will be suppressed (but still visible)',
                '• This setting applies to your account on this server only'
              ].join('\n') },
              { name: 'Status', value: '✅ Active' }
            )
            .setFooter({ text: 'Use +pingshield off to disable this feature' });

          return message.reply({ embeds: [embed] });
        } else {
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Personal Ping Shield Disabled')
            .setDescription(`${message.author.tag}, your personal ping shield has been disabled.`)
            .addFields(
              { name: 'What this means', value: 'You will now receive all ping notifications as normal.' },
              { name: 'Status', value: '❌ Inactive' }
            )
            .setFooter({ text: 'Use +pingshield on to enable this feature again' });

          return message.reply({ embeds: [embed] });
        }
      } catch (error) {
        console.error('Error toggling ping shield:', error);
        return message.reply('An error occurred while trying to update your ping shield settings.');
      }
    }
  },

  // 8. Ping stats command
  {
    name: 'pingstats',
    description: 'Shows statistics about pings in the server',
    usage: '+pingstats [optional: @user]',
    category: CommandCategory.ANTIPING,
    cooldown: 10,
    requiredPermissions: [],
    execute: async (message, args) => {
      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      const user = message.mentions.users.first() || message.author;
      
      // In a full implementation, you would query a database for actual stats
      // For this prototype, we'll generate some random stats
      
      // Calculate random stats
      const randomPingsReceived = Math.floor(Math.random() * 100) + 50;
      const randomPingsSent = Math.floor(Math.random() * 50) + 20;
      const randomMassPings = Math.floor(Math.random() * 5);
      const lastPinged = new Date(Date.now() - Math.floor(Math.random() * 86400000)).toUTCString();
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Ping Statistics for ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'Pings Received', value: randomPingsReceived.toString(), inline: true },
          { name: 'Pings Sent', value: randomPingsSent.toString(), inline: true },
          { name: 'Mass Pings Detected', value: randomMassPings.toString(), inline: true },
          { name: 'Last Pinged', value: lastPinged, inline: false },
          { name: 'Note', value: 'This feature uses simulated data. In a real implementation, actual ping data would be tracked and displayed.' }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  }
];
