/**
 * Antiping command refactored for better array handling
 * This file provides commands to prevent excessive pinging and protect certain roles from being pinged
 */
import { EmbedBuilder, Message, PermissionsBitField } from 'discord.js';
import { CommandCategory } from '@shared/schema';
import { formatDuration, getCommandPrefix, getUserPermissionLevel } from '../utils';
import { storage } from '../../storage';

export default [
  // 1. Main anti-ping command
  {
    name: 'antiping',
    description: 'Prevents excessive role pings and protects certain roles',
    usage: '+antiping [on/off/settings/protect/bypass/exclude/include] [@role]',
    aliases: ['antipings', 'pingcontrol'],
    category: CommandCategory.ANTIPING,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ManageGuild],
    execute: async (message, args, client) => {
      // Check permissions
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply('You need the Manage Server permission to use this command.');
      }

      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      let server = await storage.getServer(message.guild.id);
      
      // Create server if it doesn't exist
      if (!server) {
        server = await storage.createServer({
          id: message.guild.id,
          name: message.guild.name,
          prefix: '+', // Default prefix set to + as requested
          antiPingEnabled: false,
          antiPingExcludedRoles: [],
          antiPingBypassRoles: [],
          antiPingProtectedRoles: [],
          antiPingPunishment: 'escalate' // Using escalate as default for progressive timeouts
        });
      }

      // If no arguments, display help
      if (!args.length) {
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('Anti-Ping Protection')
          .setDescription('Prevents users from excessively pinging roles and members.')
          .addFields(
            { name: 'Status', value: server.antiPingEnabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
            { name: 'Usage', value: [
              `\`${getCommandPrefix(message)}antiping on\` - Enable anti-ping protection`,
              `\`${getCommandPrefix(message)}antiping off\` - Disable anti-ping protection`,
              `\`${getCommandPrefix(message)}antiping settings\` - Display current settings`,
              `\`${getCommandPrefix(message)}antiping protect @role\` - Protect a role from pings`,
              `\`${getCommandPrefix(message)}antiping bypass @role\` - Allow a role to bypass protection`,
              `\`${getCommandPrefix(message)}antiping exclude @role\` - Exclude a role from triggering protection`,
              `\`${getCommandPrefix(message)}antiping include @role\` - Remove a role from exclusion list`
            ].join('\\n') },
            { name: 'Configuration', value: `Use \`${getCommandPrefix(message)}antiping settings\` to see current settings.` }
          )
          .setFooter({ text: `Configured by ${message.author.tag}` })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      const action = args[0].toLowerCase();
      
      switch (action) {
        case 'on':
        case 'enable': {
          // Enable anti-ping protection
          if (server.antiPingEnabled) {
            return message.reply('Anti-ping protection is already enabled.');
          }
          
          server = await storage.updateServer(message.guild.id, { antiPingEnabled: true });
          
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Anti-Ping Protection Enabled')
            .setDescription('Users who excessively ping roles or members will now be punished according to the configured settings.')
            .addFields(
              { name: 'Configuration', value: `Use \`${getCommandPrefix(message)}antiping settings\` to see current settings.` }
            )
            .setFooter({ text: `Configured by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
          
        case 'off':
        case 'disable': {
          // Disable anti-ping protection
          if (!server.antiPingEnabled) {
            return message.reply('Anti-ping protection is already disabled.');
          }
          
          server = await storage.updateServer(message.guild.id, { antiPingEnabled: false });
          
          const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Anti-Ping Protection Disabled')
            .setDescription('Users can now ping roles and members without restrictions.')
            .setFooter({ text: `Configured by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
          
        case 'settings': {
          // Display current settings
          const protectedRoles = Array.isArray(server.antiPingProtectedRoles) ? server.antiPingProtectedRoles : [];
          const bypassRoles = Array.isArray(server.antiPingBypassRoles) ? server.antiPingBypassRoles : [];
          const excludedRoles = Array.isArray(server.antiPingExcludedRoles) ? server.antiPingExcludedRoles : [];
          
          const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Anti-Ping Settings')
            .addFields(
              { name: 'Status', value: server.antiPingEnabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
              { name: 'Punishment', value: server.antiPingPunishment || 'escalate', inline: true },
              { name: 'Protected Roles', value: protectedRoles.length ? protectedRoles.map(id => `<@&${id}>`).join(', ') : 'None' },
              { name: 'Bypass Roles', value: bypassRoles.length ? bypassRoles.map(id => `<@&${id}>`).join(', ') : 'None' },
              { name: 'Excluded Roles', value: excludedRoles.length ? excludedRoles.map(id => `<@&${id}>`).join(', ') : 'None' }
            )
            .setFooter({ text: `Requested by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
          
        case 'protect': {
          const role = message.mentions.roles.first();
          
          if (!role) {
            return message.reply('Please mention a role to protect from pings.');
          }

          // Get the current protected roles
          const protectedRoles = Array.isArray(server.antiPingProtectedRoles) 
            ? server.antiPingProtectedRoles 
            : [];
          
          // Check if role is already protected
          if (protectedRoles.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is already protected from pings.`);
          }

          // Add role to protected list
          const updatedRoles = [...protectedRoles, role.id];
          // Store the new list in the database
          await storage.updateServerCustomField(message.guild.id, 'antiPingProtectedRoles', updatedRoles);

          const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Protected Role Added')
            .setDescription(`The role <@&${role.id}> is now protected from pings. Users who excessively ping this role will be punished.`)
            .setFooter({ text: `Updated by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
          
        case 'bypass': {
          const role = message.mentions.roles.first();
          
          if (!role) {
            return message.reply('Please mention a role to add to the bypass list.');
          }

          // Get the current bypass roles
          const bypassRoles = Array.isArray(server.antiPingBypassRoles) 
            ? server.antiPingBypassRoles 
            : [];
          
          // Check if role is already on bypass list
          if (bypassRoles.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is already on the bypass list.`);
          }

          // Add role to bypass list
          const updatedRoles = [...bypassRoles, role.id];
          await storage.updateServerCustomField(message.guild.id, 'antiPingBypassRoles', updatedRoles);

          const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Bypass Role Added')
            .setDescription(`The role <@&${role.id}> has been added to the bypass list. Users with this role can ping freely.`)
            .setFooter({ text: `Updated by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
          
        case 'exclude': {
          const role = message.mentions.roles.first();
          
          if (!role) {
            return message.reply('Please mention a role to exclude from anti-ping protection.');
          }

          // Get the current excluded roles
          const excludedRoles = Array.isArray(server.antiPingExcludedRoles) 
            ? server.antiPingExcludedRoles 
            : [];
          
          // Check if role is already excluded
          if (excludedRoles.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is already excluded from anti-ping protection.`);
          }

          // Add role to excluded list
          const updatedRoles = [...excludedRoles, role.id];
          await storage.updateServerCustomField(message.guild.id, 'antiPingExcludedRoles', updatedRoles);

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

          // Get the current excluded roles
          const excludedRoles = Array.isArray(server.antiPingExcludedRoles) 
            ? server.antiPingExcludedRoles 
            : [];
          
          // Check if role is even excluded
          if (!excludedRoles.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is not excluded from anti-ping protection.`);
          }

          // Remove role from excluded list
          const updatedRoles = excludedRoles.filter(id => id !== role.id);
          await storage.updateServerCustomField(message.guild.id, 'antiPingExcludedRoles', updatedRoles);

          const embed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Anti-Ping Exclusion Removed')
            .setDescription(`The role <@&${role.id}> is no longer excluded from anti-ping protection.`)
            .setFooter({ text: `Updated by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
          
        default:
          return message.reply(`Unknown action: "${action}". Use \`${getCommandPrefix(message)}antiping\` without arguments to see available options.`);
      }
    }
  },

  // 2. Anti-ping configuration command - Keep this for backward compatibility
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
          prefix: '+', // Default prefix set to + as requested
          antiPingEnabled: false,
          antiPingExcludedRoles: [],
          antiPingBypassRoles: [],
          antiPingProtectedRoles: [],
          antiPingPunishment: 'escalate'
        });
      }

      // No arguments - display current configuration
      if (!args.length) {
        // Get arrays safely (even if they're null or not arrays)
        const protectedRoles = Array.isArray(server.antiPingProtectedRoles) ? server.antiPingProtectedRoles : [];
        const bypassRoles = Array.isArray(server.antiPingBypassRoles) ? server.antiPingBypassRoles : [];
        const excludedRoles = Array.isArray(server.antiPingExcludedRoles) ? server.antiPingExcludedRoles : [];
        const punishment = server.antiPingPunishment || 'escalate';
        
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('Anti-Ping Configuration')
          .addFields(
            { name: 'Status', value: server.antiPingEnabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
            { name: 'Punishment', value: punishment.charAt(0).toUpperCase() + punishment.slice(1), inline: true },
            { name: 'Protected Roles', value: protectedRoles.length ? protectedRoles.map(id => `<@&${id}>`).join(', ') : 'None' },
            { name: 'Bypass Roles', value: bypassRoles.length ? bypassRoles.map(id => `<@&${id}>`).join(', ') : 'None' },
            { name: 'Excluded Roles', value: excludedRoles.length ? excludedRoles.map(id => `<@&${id}>`).join(', ') : 'None' },
            { name: 'Commands', value: [
              `\`${getCommandPrefix(message)}antiping [on/off]\` - Toggle anti-ping protection`,
              `\`${getCommandPrefix(message)}antipingconfig punishment [warn/timeout/kick/ban/escalate]\` - Set punishment type`,
              `\`${getCommandPrefix(message)}antiping protect @role\` - Protect a role from pings`,
              `\`${getCommandPrefix(message)}antiping bypass @role\` - Allow a role to bypass protection`,
              `\`${getCommandPrefix(message)}antiping exclude @role\` - Exclude a role from triggering protection`,
              `\`${getCommandPrefix(message)}antiping include @role\` - Remove a role from exclusion list`
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
            return message.reply('Please specify a punishment type: `warn`, `timeout`, `kick`, `ban`, or `escalate` (default).');
          }

          const punishment = args[1].toLowerCase();
          
          if (!['warn', 'timeout', 'kick', 'ban', 'escalate'].includes(punishment)) {
            return message.reply('Invalid punishment type. Choose from: `warn`, `timeout`, `kick`, `ban`, or `escalate`.');
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

        // For backward compatibility, provide a way to redirect to the main command
        case 'protect':
        case 'bypass':
        case 'exclude':
        case 'include': {
          return message.reply(`Please use \`${getCommandPrefix(message)}antiping ${setting} @role\` instead.`);
        }

        default:
          const prefix = getCommandPrefix(message);
          return message.reply(`Invalid setting. Use \`${prefix}antipingconfig\` without arguments to see available options.`);
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
        return message.reply(`<@${user.id}> is already blocked from pinging others.`);
      }

      // Get reason (optional)
      const reason = args.slice(1).join(' ') || null;

      // Add user to ping blocked list
      await storage.createPingBlockedUser({
        serverId: message.guild.id,
        userId: user.id,
        blockedBy: message.author.id,
        reason
      });

      // Log activity
      await storage.createActivityLog({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: `pingblock <@${user.id}>`
      });

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('User Ping Blocked')
        .setDescription(`<@${user.id}> has been blocked from pinging others in this server.`)
        .addFields(
          { name: 'Blocked by', value: `<@${message.author.id}>`, inline: true },
          { name: 'Reason', value: reason || 'No reason provided', inline: true }
        )
        .setFooter({ text: `ID: ${user.id}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  },

  // 4. Ping unblock command
  {
    name: 'pingunblock',
    description: 'Unblocks pings from a specific user',
    usage: '+pingunblock [@user]',
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

      // Check if user is blocked
      const existingBlock = await storage.getPingBlockedUser(message.guild.id, user.id);
      
      if (!existingBlock) {
        return message.reply(`<@${user.id}> is not blocked from pinging others.`);
      }

      // Remove user from ping blocked list
      const success = await storage.deletePingBlockedUser(message.guild.id, user.id);
      
      if (!success) {
        return message.reply('An error occurred while trying to unblock this user.');
      }

      // Log activity
      await storage.createActivityLog({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: `pingunblock <@${user.id}>`
      });

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('User Ping Unblocked')
        .setDescription(`<@${user.id}> can now ping others in this server again.`)
        .addFields(
          { name: 'Unblocked by', value: `<@${message.author.id}>`, inline: true }
        )
        .setFooter({ text: `ID: ${user.id}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  },

  // 5. Ping violations command
  {
    name: 'pingviolations',
    description: 'Shows ping violations for a user',
    usage: '+pingviolations [@user]',
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
        return message.reply('Please mention a user to check ping violations for.');
      }

      // Get violations for user
      const violations = await storage.getPingViolations(message.guild.id, user.id);
      
      if (!violations || violations.count === 0) {
        return message.reply(`<@${user.id}> has no recorded ping violations.`);
      }

      // Get timeout duration based on violation count
      const timeoutDurations = [
        0,                  // warning
        3 * 60 * 1000,      // 3 minutes
        5 * 60 * 1000,      // 5 minutes
        10 * 60 * 1000,     // 10 minutes
        15 * 60 * 1000,     // 15 minutes
        30 * 60 * 1000,     // 30 minutes
        60 * 60 * 1000,     // 1 hour
        120 * 60 * 1000     // 2 hours
      ];
      
      // Cap violations at max duration (2 hours)
      const violationIndex = Math.min(violations.count, timeoutDurations.length - 1);
      const nextTimeout = timeoutDurations[violationIndex];
      const formattedTimeout = formatDuration(nextTimeout);

      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('User Ping Violations')
        .setDescription(`<@${user.id}> has ${violations.count} ping violation(s).`)
        .addFields(
          { name: 'Last Violation', value: violations.lastViolation.toLocaleString(), inline: true },
          { name: 'Next Punishment', value: violationIndex === 0 ? 'Warning' : `Timeout for ${formattedTimeout}`, inline: true }
        )
        .setFooter({ text: `ID: ${user.id}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  },

  // 6. Reset ping violations command
  {
    name: 'resetpingviolations',
    description: 'Resets ping violations for a user',
    usage: '+resetpingviolations [@user]',
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
        return message.reply('Please mention a user to reset ping violations for.');
      }

      // Reset violations for user
      await storage.updatePingViolationCount(message.guild.id, user.id, 0);

      // Log activity
      await storage.createActivityLog({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: `resetpingviolations <@${user.id}>`
      });

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Ping Violations Reset')
        .setDescription(`Ping violations for <@${user.id}> have been reset to zero.`)
        .addFields(
          { name: 'Reset by', value: `<@${message.author.id}>`, inline: true }
        )
        .setFooter({ text: `ID: ${user.id}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  }
];