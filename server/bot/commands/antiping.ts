import { Command, getCommandPrefix } from '../utils';
import { CommandCategory } from '@shared/schema';
import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { incrementModerationActions } from '../index';
import { storage } from '../../storage';

// Anti-ping commands collection
export const antipingCommands: Command[] = [
  // 1. Anti-ping toggle command
  {
    name: 'antiping',
    description: 'Manages anti-ping protection for the server',
    usage: '+antiping [on/off/protect/bypass/exclude/include/settings]',
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

      // Get the server from storage
      let server = await storage.getServer(message.guild.id);
      
      // If server doesn't exist, create it with default settings
      if (!server) {
        server = await storage.createServer({
          id: message.guild.id,
          name: message.guild.name,
          prefix: '+', // Set default prefix to + as requested
          antiPingEnabled: false,
          antiPingExcludedRoles: [],
          antiPingPunishment: 'warn'
        });
      }

      // Show settings if no arguments or "settings" argument
      if (!args.length || args[0].toLowerCase() === 'settings') {
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('Anti-Ping Configuration')
          .addFields(
            { name: 'Status', value: server.antiPingEnabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
            { 
              name: 'Punishment', 
              value: server.antiPingPunishment ? 
                server.antiPingPunishment.charAt(0).toUpperCase() + server.antiPingPunishment.slice(1) : 
                'Warn', 
              inline: true 
            },
            { 
              name: 'Protected Roles', 
              value: server.antiPingProtectedRoles && server.antiPingProtectedRoles.length ? 
                server.antiPingProtectedRoles.map(id => `<@&${id}>`).join(', ') : 
                'None' 
            },
            { 
              name: 'Bypass Roles', 
              value: server.antiPingBypassRoles && server.antiPingBypassRoles.length ? 
                server.antiPingBypassRoles.map(id => `<@&${id}>`).join(', ') : 
                'None' 
            },
            { 
              name: 'Excluded Roles', 
              value: server.antiPingExcludedRoles && server.antiPingExcludedRoles.length ? 
                server.antiPingExcludedRoles.map(id => `<@&${id}>`).join(', ') : 
                'None' 
            },
            { name: 'Commands', value: [
              `\`${getCommandPrefix(message)}antiping [on/off]\` - Toggle anti-ping protection`,
              `\`${getCommandPrefix(message)}antiping protect @role\` - Add a role to protected list`,
              `\`${getCommandPrefix(message)}antiping bypass @role\` - Add a role to bypass list`,
              `\`${getCommandPrefix(message)}antiping exclude @role\` - Exclude a role from anti-ping`,
              `\`${getCommandPrefix(message)}antiping include @role\` - Remove role from exclusion list`
            ].join('\n') }
          )
          .setFooter({ text: `Requested by ${message.author.tag}` })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // Process commands
      const action = args[0].toLowerCase();

      switch (action) {
        case 'on':
        case 'off': {
          const enable = action === 'on';
          
          // Update server
          server = await storage.updateServer(message.guild.id, { antiPingEnabled: enable });
          
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
              { name: 'Configuration', value: `Use \`${getCommandPrefix(message)}antiping settings\` to see current settings.` }
            )
            .setFooter({ text: `Configured by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
          
        case 'protect': {
          const role = message.mentions.roles.first();
          
          if (!role) {
            return message.reply('Please mention a role to protect from pings.');
          }

          // Get the current protected roles (which may not exist in the schema yet)
          // Using any to bypass type checking temporarily
          const server_any = server as any;
          const protectedRoles = Array.isArray(server_any.antiPingProtectedRoles) 
            ? server_any.antiPingProtectedRoles 
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

          // Initialize the array if it doesn't exist
          const bypassRoles = server.antiPingBypassRoles || [];
          
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

          // Initialize excluded roles array if null
          const excludedRolesArray = server.antiPingExcludedRoles || [];
          
          // Check if role is already excluded
          if (excludedRolesArray.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is already excluded from anti-ping protection.`);
          }

          // Add role to excluded list
          const excludedRoles = [...excludedRolesArray, role.id];
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

          // Initialize excluded roles array if null
          const excludedRolesArray = server.antiPingExcludedRoles || [];
          
          // Check if role is even excluded
          if (!excludedRolesArray.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is not excluded from anti-ping protection.`);
          }

          // Remove role from excluded list
          const excludedRoles = excludedRolesArray.filter(id => id !== role.id);
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
          return message.reply(`Unknown action: "${action}". Use \`${getCommandPrefix(message)}antiping\` without arguments to see available options.`);
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
          prefix: '+', // Default prefix set to + as requested
          antiPingEnabled: false,
          antiPingExcludedRoles: [],
          antiPingPunishment: 'warn'
        });
      }

      // No arguments - display current configuration
      if (!args.length) {
        const punishment = server.antiPingPunishment || 'warn';
        const excludedRoles = server.antiPingExcludedRoles || [];
        
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('Anti-Ping Configuration')
          .addFields(
            { name: 'Status', value: server.antiPingEnabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
            { name: 'Punishment', value: punishment.charAt(0).toUpperCase() + punishment.slice(1), inline: true },
            { name: 'Excluded Roles', value: excludedRoles.length ? excludedRoles.map(id => `<@&${id}>`).join(', ') : 'None' },
            { name: 'Commands', value: [
              `\`${getCommandPrefix(message)}antiping [on/off]\` - Toggle anti-ping protection`,
              `\`${getCommandPrefix(message)}antipingconfig punishment [warn/timeout/kick/ban]\` - Set punishment type`,
              `\`${getCommandPrefix(message)}antipingconfig exclude @role\` - Exclude a role from anti-ping`,
              `\`${getCommandPrefix(message)}antipingconfig include @role\` - Remove exclusion for a role`
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

          // Initialize excluded roles array if null
          const excludedRolesArray = server.antiPingExcludedRoles || [];
          
          // Check if role is already excluded
          if (excludedRolesArray.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is already excluded from anti-ping protection.`);
          }

          // Add role to excluded list
          const excludedRoles = [...excludedRolesArray, role.id];
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

          // Initialize excluded roles array if null
          const excludedRolesArray = server.antiPingExcludedRoles || [];
          
          // Check if role is even excluded
          if (!excludedRolesArray.includes(role.id)) {
            return message.reply(`The role <@&${role.id}> is not excluded from anti-ping protection.`);
          }

          // Remove role from excluded list
          const excludedRoles = excludedRolesArray.filter(id => id !== role.id);
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
        command: `pingblock ${user.tag}`
      });

      // Increment moderation actions
      incrementModerationActions();

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('User Blocked from Pinging')
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
    description: 'Unblocks pings from a previously blocked user',
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
        return message.reply(`<@${user.id}> is not currently blocked from pinging others.`);
      }

      // Remove user from ping blocked list
      await storage.deletePingBlockedUser(message.guild.id, user.id);

      // Log activity
      await storage.createActivityLog({
        serverId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        command: `pingunblock ${user.tag}`
      });

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('User Unblocked from Pinging')
        .setDescription(`<@${user.id}> can now ping others in this server again.`)
        .addFields(
          { name: 'Unblocked by', value: `<@${message.author.id}>`, inline: true }
        )
        .setFooter({ text: `ID: ${user.id}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  },

  // 5. Ping blocked list command
  {
    name: 'pingblocklist',
    description: 'Shows a list of users blocked from pinging',
    usage: '+pingblocklist',
    aliases: ['pingblocked'],
    category: CommandCategory.ANTIPING,
    cooldown: 3,
    requiredPermissions: [PermissionsBitField.Flags.ModerateMembers],
    execute: async (message) => {
      // Check permissions
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('You need the Moderate Members permission to use this command.');
      }

      if (!message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      // Get all blocked users for this server
      const blockedUsers = await storage.getPingBlockedUsers(message.guild.id);

      if (!blockedUsers.length) {
        return message.reply('There are no users currently blocked from pinging others in this server.');
      }

      // Create list embed
      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Users Blocked from Pinging')
        .setDescription('The following users are prevented from pinging others:')
        .addFields(
          blockedUsers.map(user => ({
            name: `User ID: ${user.userId}`,
            value: [
              `Blocked by: <@${user.blockedBy}>`,
              `Blocked on: ${user.timestamp.toLocaleString()}`,
              `Reason: ${user.reason || 'No reason provided'}`
            ].join('\n')
          }))
        )
        .setFooter({ text: `Total blocked: ${blockedUsers.length}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  }
];