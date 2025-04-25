import { Command } from '../utils';
import { CommandCategory } from '@shared/schema';
import { PermissionsBitField, EmbedBuilder, GuildMember } from 'discord.js';
import { incrementModerationActions } from '../index';
import { storage } from '../../storage';

// Moderation commands collection
export const moderationCommands: Command[] = [
  // 1. Ban command
  {
    name: 'ban',
    description: 'Bans a user from the server permanently',
    usage: '!ban [@user] [reason]',
    category: CommandCategory.MODERATION,
    cooldown: 3,
    requiredPermissions: [PermissionsBitField.Flags.BanMembers],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return message.reply('You do not have permission to ban members.');
      }

      // Check if a user was mentioned
      const user = message.mentions.users.first();
      if (!user) {
        return message.reply('Please mention a user to ban.');
      }

      // Get the target member
      const member = message.guild?.members.cache.get(user.id);
      
      // Check if the member can be banned
      if (member) {
        if (!member.bannable) {
          return message.reply('I cannot ban this user. They may have higher permissions than me.');
        }

        if (message.member.roles.highest.position <= member.roles.highest.position) {
          return message.reply('You cannot ban this user as they have higher or equal roles to you.');
        }
      }

      // Extract reason
      const reason = args.slice(1).join(' ') || 'No reason provided';

      try {
        // Ban the user
        await message.guild?.members.ban(user.id, { reason });

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `ban ${user.tag}`
          });
        }

        // Send success message
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('User Banned')
          .setDescription(`${user.tag} has been banned from the server.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error banning user:', error);
        return message.reply('An error occurred while trying to ban the user.');
      }
    }
  },

  // 2. Kick command
  {
    name: 'kick',
    description: 'Kicks a user from the server',
    usage: '!kick [@user] [reason]',
    category: CommandCategory.MODERATION,
    cooldown: 3,
    requiredPermissions: [PermissionsBitField.Flags.KickMembers],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return message.reply('You do not have permission to kick members.');
      }

      // Check if a user was mentioned
      const user = message.mentions.users.first();
      if (!user) {
        return message.reply('Please mention a user to kick.');
      }

      // Get the target member
      const member = message.guild?.members.cache.get(user.id);
      if (!member) {
        return message.reply('This user is not in the server.');
      }

      // Check if the member can be kicked
      if (!member.kickable) {
        return message.reply('I cannot kick this user. They may have higher permissions than me.');
      }

      if (message.member.roles.highest.position <= member.roles.highest.position) {
        return message.reply('You cannot kick this user as they have higher or equal roles to you.');
      }

      // Extract reason
      const reason = args.slice(1).join(' ') || 'No reason provided';

      try {
        // Kick the user
        await member.kick(reason);

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `kick ${user.tag}`
          });
        }

        // Send success message
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('User Kicked')
          .setDescription(`${user.tag} has been kicked from the server.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error kicking user:', error);
        return message.reply('An error occurred while trying to kick the user.');
      }
    }
  },

  // 3. Timeout (mute) command
  {
    name: 'timeout',
    description: 'Temporarily prevents a user from sending messages and joining voice channels',
    usage: '!timeout [@user] [duration in minutes] [reason]',
    aliases: ['mute'],
    category: CommandCategory.MODERATION,
    cooldown: 3,
    requiredPermissions: [PermissionsBitField.Flags.ModerateMembers],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('You do not have permission to timeout members.');
      }

      // Check if a user was mentioned
      const user = message.mentions.users.first();
      if (!user) {
        return message.reply('Please mention a user to timeout.');
      }

      // Get the target member
      const member = message.guild?.members.cache.get(user.id);
      if (!member) {
        return message.reply('This user is not in the server.');
      }

      // Check if the member can be timed out
      if (!member.moderatable) {
        return message.reply('I cannot timeout this user. They may have higher permissions than me.');
      }

      if (message.member.roles.highest.position <= member.roles.highest.position) {
        return message.reply('You cannot timeout this user as they have higher or equal roles to you.');
      }

      // Parse duration
      const duration = parseInt(args[1]);
      if (isNaN(duration) || duration <= 0) {
        return message.reply('Please provide a valid duration in minutes.');
      }

      // Cap duration at 28 days (Discord limit)
      const timeoutDuration = Math.min(duration * 60 * 1000, 28 * 24 * 60 * 60 * 1000);

      // Extract reason
      const reason = args.slice(2).join(' ') || 'No reason provided';

      try {
        // Apply timeout
        await member.timeout(timeoutDuration, reason);

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `timeout ${user.tag}`
          });
        }

        // Send success message
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('User Timed Out')
          .setDescription(`${user.tag} has been timed out for ${duration} minute(s).`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error timing out user:', error);
        return message.reply('An error occurred while trying to timeout the user.');
      }
    }
  },

  // 4. Untimeout (unmute) command
  {
    name: 'untimeout',
    description: 'Removes a timeout from a user',
    usage: '!untimeout [@user] [reason]',
    aliases: ['unmute'],
    category: CommandCategory.MODERATION,
    cooldown: 3,
    requiredPermissions: [PermissionsBitField.Flags.ModerateMembers],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('You do not have permission to remove timeouts.');
      }

      // Check if a user was mentioned
      const user = message.mentions.users.first();
      if (!user) {
        return message.reply('Please mention a user to remove timeout from.');
      }

      // Get the target member
      const member = message.guild?.members.cache.get(user.id);
      if (!member) {
        return message.reply('This user is not in the server.');
      }

      // Check if the member is timed out
      if (!member.communicationDisabledUntil) {
        return message.reply('This user is not currently timed out.');
      }

      // Extract reason
      const reason = args.slice(1).join(' ') || 'No reason provided';

      try {
        // Remove timeout (set to null)
        await member.timeout(null, reason);

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `untimeout ${user.tag}`
          });
        }

        // Send success message
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Timeout Removed')
          .setDescription(`Timeout has been removed from ${user.tag}.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error removing timeout:', error);
        return message.reply('An error occurred while trying to remove the timeout.');
      }
    }
  },

  // 5. Clear (purge) command
  {
    name: 'clear',
    description: 'Deletes a specified number of messages from the channel',
    usage: '!clear [number] [optional: @user]',
    aliases: ['purge', 'prune'],
    category: CommandCategory.MODERATION,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ManageMessages],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply('You do not have permission to delete messages.');
      }

      // Parse number of messages
      const amount = parseInt(args[0]);
      if (isNaN(amount) || amount <= 0 || amount > 100) {
        return message.reply('Please provide a number between 1 and 100.');
      }

      // Check if user is targeted
      const targetUser = message.mentions.users.first();

      try {
        // Delete the command message first
        await message.delete();

        // Fetch messages to delete
        const messages = await message.channel.messages.fetch({ limit: 100 });
        
        let messagesToDelete;
        if (targetUser) {
          // Filter messages by the target user
          messagesToDelete = messages
            .filter(msg => msg.author.id === targetUser.id)
            .first(amount);
        } else {
          // Just get the specified number of messages
          messagesToDelete = messages.first(amount);
        }

        // Filter out messages older than 14 days (Discord limit)
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const validMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);

        // Bulk delete valid messages
        if (validMessages.length > 0) {
          // @ts-ignore - TypeScript doesn't like this but it works
          await message.channel.bulkDelete(validMessages);
        }

        // Handle messages that are too old (delete individually)
        const oldMessages = messagesToDelete.filter(msg => msg.createdTimestamp <= twoWeeksAgo);
        for (const msg of oldMessages) {
          await msg.delete();
        }

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `clear ${amount}`
          });
        }

        // Send success message (and delete it after a few seconds)
        const successMsg = await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setDescription(`🧹 Successfully deleted ${messagesToDelete.length} messages${targetUser ? ` from ${targetUser.tag}` : ''}.`)
          ]
        });

        // Delete success message after 5 seconds
        setTimeout(() => {
          successMsg.delete().catch(console.error);
        }, 5000);

      } catch (error) {
        console.error('Error clearing messages:', error);
        return message.channel.send('An error occurred while trying to delete messages.');
      }
    }
  },

  // 6. Warn command
  {
    name: 'warn',
    description: 'Issues a warning to a user',
    usage: '!warn [@user] [reason]',
    category: CommandCategory.MODERATION,
    cooldown: 3,
    requiredPermissions: [PermissionsBitField.Flags.ModerateMembers],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply('You do not have permission to warn members.');
      }

      // Check if a user was mentioned
      const user = message.mentions.users.first();
      if (!user) {
        return message.reply('Please mention a user to warn.');
      }

      // Extract reason
      const reason = args.slice(1).join(' ');
      if (!reason) {
        return message.reply('Please provide a reason for the warning.');
      }

      try {
        // Send DM to warned user if possible
        try {
          const warningEmbed = new EmbedBuilder()
            .setColor(0xFFCC4D)
            .setTitle(`Warning from ${message.guild?.name}`)
            .setDescription(`You have received a warning.`)
            .addFields(
              { name: 'Reason', value: reason },
              { name: 'Moderator', value: message.author.tag }
            )
            .setTimestamp();

          await user.send({ embeds: [warningEmbed] });
        } catch (dmError) {
          console.error('Could not send DM to user:', dmError);
          // Continue anyway - some users have DMs disabled
        }

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `warn ${user.tag}`
          });
        }

        // Send success message in channel
        const embed = new EmbedBuilder()
          .setColor(0xFFCC4D)
          .setTitle('User Warned')
          .setDescription(`${user.tag} has been warned.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error warning user:', error);
        return message.reply('An error occurred while trying to warn the user.');
      }
    }
  },

  // 7. Lock channel command
  {
    name: 'lock',
    description: 'Locks a channel, preventing users from sending messages',
    usage: '!lock [optional: reason]',
    category: CommandCategory.MODERATION,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ManageChannels],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return message.reply('You do not have permission to lock channels.');
      }

      // Extract reason
      const reason = args.join(' ') || 'No reason provided';

      try {
        // Get the channel
        const channel = message.channel;
        const everyoneRole = message.guild?.roles.everyone;

        if (!everyoneRole) {
          return message.reply('Could not find the everyone role.');
        }

        // Update permissions for everyone role
        await channel.permissionOverwrites.create(everyoneRole, {
          SendMessages: false
        });

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `lock ${channel.name}`
          });
        }

        // Send success message
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('Channel Locked')
          .setDescription(`This channel has been locked.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error locking channel:', error);
        return message.reply('An error occurred while trying to lock the channel.');
      }
    }
  },

  // 8. Unlock channel command
  {
    name: 'unlock',
    description: 'Unlocks a channel, allowing users to send messages again',
    usage: '!unlock [optional: reason]',
    category: CommandCategory.MODERATION,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ManageChannels],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return message.reply('You do not have permission to unlock channels.');
      }

      // Extract reason
      const reason = args.join(' ') || 'No reason provided';

      try {
        // Get the channel
        const channel = message.channel;
        const everyoneRole = message.guild?.roles.everyone;

        if (!everyoneRole) {
          return message.reply('Could not find the everyone role.');
        }

        // Update permissions for everyone role
        await channel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: null // Reset to default
        });

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `unlock ${channel.name}`
          });
        }

        // Send success message
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Channel Unlocked')
          .setDescription(`This channel has been unlocked.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error unlocking channel:', error);
        return message.reply('An error occurred while trying to unlock the channel.');
      }
    }
  },

  // 9. Slowmode command
  {
    name: 'slowmode',
    description: 'Sets the slowmode cooldown in the current channel',
    usage: '!slowmode [seconds]',
    category: CommandCategory.MODERATION,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ManageChannels],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return message.reply('You do not have permission to change slowmode settings.');
      }

      // Parse seconds
      const seconds = parseInt(args[0]);
      
      // Check if valid
      if (isNaN(seconds) || seconds < 0 || seconds > 21600) { // 21600 = 6 hours (Discord limit)
        return message.reply('Please provide a valid slowmode time in seconds (0-21600).');
      }

      try {
        // Set slowmode
        await message.channel.setRateLimitPerUser(seconds);

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `slowmode ${seconds}`
          });
        }

        // Send success message
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Slowmode Updated')
          .setDescription(seconds === 0 
            ? 'Slowmode has been turned off in this channel.' 
            : `Slowmode has been set to ${seconds} second(s) in this channel.`)
          .addFields(
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error setting slowmode:', error);
        return message.reply('An error occurred while trying to set slowmode.');
      }
    }
  },

  // 10. Nickname command
  {
    name: 'nickname',
    description: 'Changes the nickname of a user',
    usage: '!nickname [@user] [new nickname]',
    aliases: ['nick'],
    category: CommandCategory.MODERATION,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ManageNicknames],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
        return message.reply('You do not have permission to change nicknames.');
      }

      // Check if a user was mentioned
      const user = message.mentions.users.first();
      if (!user) {
        return message.reply('Please mention a user to change their nickname.');
      }

      // Get the target member
      const member = message.guild?.members.cache.get(user.id);
      if (!member) {
        return message.reply('This user is not in the server.');
      }

      // Check if the member's nickname can be changed
      if (!member.manageable) {
        return message.reply('I cannot change this user\'s nickname. They may have higher permissions than me.');
      }

      // Extract new nickname (or reset if none provided)
      const newNickname = args.slice(1).join(' ') || null; // null resets to username

      try {
        // Set the new nickname
        await member.setNickname(newNickname);

        // Record moderation action
        incrementModerationActions();
        
        // Log activity
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `nickname ${user.tag}`
          });
        }

        // Send success message
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Nickname Changed')
          .setDescription(newNickname
            ? `${user.tag}'s nickname has been changed to: **${newNickname}**`
            : `${user.tag}'s nickname has been reset.`)
          .addFields(
            { name: 'Moderator', value: message.author.tag }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error changing nickname:', error);
        return message.reply('An error occurred while trying to change the nickname.');
      }
    }
  },

  // 11. Role command
  {
    name: 'role',
    description: 'Adds or removes a role from a user',
    usage: '!role [@user] [@role]',
    category: CommandCategory.MODERATION,
    cooldown: 5,
    requiredPermissions: [PermissionsBitField.Flags.ManageRoles],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return message.reply('You do not have permission to manage roles.');
      }

      // Check if a user was mentioned
      const user = message.mentions.users.first();
      if (!user) {
        return message.reply('Please mention a user to add/remove a role.');
      }

      // Check if a role was mentioned
      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply('Please mention a role to add/remove.');
      }

      // Get the target member
      const member = message.guild?.members.cache.get(user.id);
      if (!member) {
        return message.reply('This user is not in the server.');
      }

      // Check if bot can manage this role
      if (role.position >= message.guild?.members.me?.roles.highest.position!) {
        return message.reply('I cannot manage this role as it is higher than my highest role.');
      }

      // Check if user can manage this role
      if (role.position >= message.member.roles.highest.position) {
        return message.reply('You cannot manage this role as it is higher than or equal to your highest role.');
      }

      try {
        // Check if user already has the role
        const hasRole = member.roles.cache.has(role.id);

        if (hasRole) {
          // Remove the role
          await member.roles.remove(role);

          // Record moderation action
          incrementModerationActions();
          
          // Log activity
          if (message.guild) {
            await storage.createActivityLog({
              serverId: message.guild.id,
              userId: message.author.id,
              username: message.author.tag,
              command: `role ${user.tag} -${role.name}`
            });
          }

          // Send success message
          const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Role Removed')
            .setDescription(`Role **${role.name}** has been removed from ${user.tag}.`)
            .addFields(
              { name: 'Moderator', value: message.author.tag }
            )
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        } else {
          // Add the role
          await member.roles.add(role);

          // Record moderation action
          incrementModerationActions();
          
          // Log activity
          if (message.guild) {
            await storage.createActivityLog({
              serverId: message.guild.id,
              userId: message.author.id,
              username: message.author.tag,
              command: `role ${user.tag} +${role.name}`
            });
          }

          // Send success message
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Role Added')
            .setDescription(`Role **${role.name}** has been added to ${user.tag}.`)
            .addFields(
              { name: 'Moderator', value: message.author.tag }
            )
            .setTimestamp();

          return message.reply({ embeds: [embed] });
        }
      } catch (error) {
        console.error('Error managing role:', error);
        return message.reply('An error occurred while trying to manage the role.');
      }
    }
  },

  // 12. Set prefix command
  {
    name: 'setprefix',
    description: 'Changes the command prefix for the server',
    usage: '!setprefix [new prefix]',
    category: CommandCategory.MODERATION,
    cooldown: 10,
    requiredPermissions: [PermissionsBitField.Flags.ManageGuild],
    execute: async (message, args) => {
      // Check if user has permission
      if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply('You do not have permission to change the server prefix.');
      }

      // Check if a new prefix is provided
      if (!args.length) {
        return message.reply('Please provide a new prefix.');
      }

      // Get the new prefix
      const newPrefix = args[0];

      // Validate prefix length
      if (newPrefix.length > 5) {
        return message.reply('Prefix cannot be longer than 5 characters.');
      }

      try {
        // Update the prefix in database
        if (!message.guild) {
          return message.reply('This command can only be used in a server.');
        }

        // Check if server exists in DB
        let server = await storage.getServer(message.guild.id);
        
        if (server) {
          // Update existing server
          server = await storage.updateServer(message.guild.id, { prefix: newPrefix });
        } else {
          // Create new server entry
          server = await storage.createServer({
            id: message.guild.id,
            name: message.guild.name,
            prefix: newPrefix,
            antiPingEnabled: false,
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
          command: `setprefix ${newPrefix}`
        });

        // Send success message
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Prefix Changed')
          .setDescription(`The command prefix has been updated to: \`${newPrefix}\``)
          .setFooter({ text: `Changed by ${message.author.tag}` });

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error changing prefix:', error);
        return message.reply('An error occurred while trying to change the prefix.');
      }
    }
  },
];
