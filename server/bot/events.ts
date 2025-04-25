import { Client, Events, Message, GuildMember, Collection, ChannelType, User, PermissionsBitField } from 'discord.js';
import { getPrefix, incrementCommandsUsed, incrementModerationActions } from './index';
import { storage } from '../storage';
import { log } from '../vite';
import { checkCooldown, hasCooldown, setCooldown } from './utils';

// Map to store AFK users
const afkUsers = new Map<string, { reason: string; timestamp: number }>();

// Map to store ping tracking data
const userPings = new Map<string, {
  count: number;
  lastPingTime: number;
  targets: Set<string>;
}>();

// Setup event handlers for the Discord bot
export function setupEvents(client: Client): void {
  // Ready event
  client.once(Events.ClientReady, () => {
    log(`Logged in as ${client.user?.tag}!`, 'bot');
    
    // Set the bot's activity
    client.user?.setActivity('!help | Snowhill', { type: 3 }); // 3 = Watching
    
    // Setup interval to clear expired cooldowns
    setInterval(async () => {
      await storage.deleteExpiredCooldowns();
    }, 60000); // Check every minute
  });

  // Message create event (for commands)
  client.on(Events.MessageCreate, async (message: Message) => {
    // Ignore messages from bots
    if (message.author.bot) return;
    
    // Handle AFK users returning
    if (afkUsers.has(message.author.id)) {
      // Remove AFK status
      afkUsers.delete(message.author.id);
      
      // Reset nickname if possible (remove [AFK] prefix)
      if (message.guild && message.member) {
        try {
          const currentNick = message.member.nickname || message.author.username;
          if (currentNick.startsWith('[AFK]')) {
            await message.member.setNickname(currentNick.substring(5).trim());
          }
        } catch (error) {
          // Ignore errors if can't change nickname
        }
      }
      
      // Let the user know their AFK status was removed
      await message.reply('Welcome back! I\'ve removed your AFK status.');
    }
    
    // Handle mentions of AFK users
    if (message.mentions.users.size > 0) {
      for (const [userId, user] of message.mentions.users) {
        if (afkUsers.has(userId)) {
          const afkInfo = afkUsers.get(userId)!;
          const duration = Math.floor((Date.now() - afkInfo.timestamp) / 60000); // minutes
          
          await message.reply(`${user.tag} is AFK: ${afkInfo.reason} (${duration} minutes ago)`);
        }
      }
    }
    
    // Process commands
    if (message.guild) {
      const guildId = message.guild.id;
      
      // Get server prefix (default to ! if not found)
      const prefix = await getPrefix(guildId);
      
      // Check if message starts with prefix
      if (!message.content.startsWith(prefix)) {
        // Not a command, check for ping abuse if anti-ping is enabled
        await handlePossiblePingAbuse(message);
        return;
      }
      
      // Extract command name and arguments
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift()?.toLowerCase();
      
      if (!commandName) return;
      
      // Find command by name or alias
      const command = client.commands.get(commandName) || 
                      client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
      
      if (!command) return;
      
      // Check permissions
      if (command.requiredPermissions && command.requiredPermissions.length > 0) {
        if (!message.member?.permissions.has(command.requiredPermissions)) {
          return message.reply('You do not have the required permissions to use this command.');
        }
      }
      
      // Check cooldown
      if (command.cooldown && command.cooldown > 0) {
        const cooldownKey = `${message.author.id}:${command.name}`;
        
        if (await hasCooldown(cooldownKey)) {
          const remainingTime = await checkCooldown(cooldownKey);
          
          if (remainingTime > 0) {
            return message.reply(`Please wait ${remainingTime.toFixed(1)} more seconds before using the \`${command.name}\` command again.`);
          }
        }
        
        // Set cooldown
        await setCooldown(cooldownKey, command.cooldown);
      }
      
      // Execute command
      try {
        await command.execute(message, args, client);
        incrementCommandsUsed();
        
        // Log command usage
        if (message.guild) {
          try {
            await storage.createActivityLog({
              serverId: message.guild.id,
              userId: message.author.id,
              username: message.author.tag,
              command: `${commandName} ${args.join(' ')}`
            });
          } catch (error) {
            console.error('Error logging activity:', error);
          }
        }
      } catch (error) {
        console.error(`Error executing ${commandName} command:`, error);
        message.reply('There was an error trying to execute that command!');
      }
    }
  });

  // Guild member add event
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    // Get server settings to see if we need to do anything special
    try {
      const server = await storage.getServer(member.guild.id);
      
      // If server has anti-raid mode enabled, we might want to restrict the new member
      if (server && server.antiPingEnabled && server.antiPingPunishment === 'timeout') {
        // This would be where you could implement extra verification for new members
        log(`New member joined during heightened security: ${member.user.tag}`, 'bot');
      }
    } catch (error) {
      console.error('Error handling new member:', error);
    }
  });

  // Handle voice state updates
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    // This could be used to log voice channel activity or moderate voice channels
    if (!oldState.channelId && newState.channelId) {
      // User joined a voice channel
      log(`${newState.member?.user.tag} joined voice channel: ${newState.channel?.name}`, 'debug');
    } else if (oldState.channelId && !newState.channelId) {
      // User left a voice channel
      log(`${oldState.member?.user.tag} left voice channel: ${oldState.channel?.name}`, 'debug');
    }
  });

  // Error handling
  client.on(Events.Error, (error) => {
    console.error('Discord client error:', error);
  });
}

// Helper function to handle possible ping abuse
async function handlePossiblePingAbuse(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;
  
  // Skip messages from bots
  if (message.author.bot) return;
  
  // Get server configuration
  const server = await storage.getServer(message.guild.id);
  if (!server || !server.antiPingEnabled) return;

  // Check if user has Manage Messages permission (auto bypass)
  if (message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
  
  // Check if user has a bypass role
  if (Array.isArray(server.antiPingBypassRoles) && server.antiPingBypassRoles.length > 0) {
    const memberRoles = message.member.roles.cache.map(r => r.id);
    const hasBypassRole = server.antiPingBypassRoles.some(roleId => memberRoles.includes(roleId));
    if (hasBypassRole) return;
  }
  
  // Check if user is in excluded roles
  if (Array.isArray(server.antiPingExcludedRoles) && server.antiPingExcludedRoles.length > 0) {
    const memberRoles = message.member.roles.cache.map(r => r.id);
    const isExcluded = server.antiPingExcludedRoles.some(roleId => memberRoles.includes(roleId));
    if (isExcluded) return;
  }
  
  // Check if user is ping-blocked
  const isBlocked = await storage.getPingBlockedUser(message.guild.id, message.author.id);
  if (isBlocked) {
    await message.delete().catch(console.error);
    if (message.channel.type === ChannelType.GuildText) {
      await message.channel.send(`${message.author}, you are currently blocked from pinging users.`);
    }
    return;
  }
  
  // Get the server's protected roles
  const protectedRoles = Array.isArray(server.antiPingProtectedRoles) ? 
    server.antiPingProtectedRoles : [];
  
  // Check for any ping to a protected role - even a single ping is punished
  let hasProtectedRolePing = false;
  if (protectedRoles.length > 0 && message.mentions.roles.size > 0) {
    hasProtectedRolePing = message.mentions.roles.some(role => 
      protectedRoles.includes(role.id)
    );
  }
  
  // Check if users with protected roles were pinged
  let hasProtectedUserPing = false;
  if (protectedRoles.length > 0 && message.mentions.users.size > 0) {
    hasProtectedUserPing = message.mentions.users.some(user => {
      const member = message.guild?.members.cache.get(user.id);
      if (!member) return false;
      
      // Check if user has any protected role
      return protectedRoles.some(roleId => member.roles.cache.has(roleId));
    });
  }
  
  // Count total mentions for excessive ping detection
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  const isExcessivePinging = mentionCount >= 6;
  
  // Take action if:
  // 1. ANY protected role is pinged (even once)
  // 2. ANY user with a protected role is pinged (even once)
  // 3. There are excessive mentions (6 or more) in a single message
  if (hasProtectedRolePing || hasProtectedUserPing || isExcessivePinging) {
    console.log(`Antiping triggered: protectedRole=${hasProtectedRolePing}, protectedUser=${hasProtectedUserPing}, excessive=${isExcessivePinging}`);
    
    // Delete the message
    try {
      await message.delete();
    } catch (error) {
      console.error('Error deleting ping abuse message:', error);
    }
    
    // Get user's violation count
    const violations = await storage.getPingViolations(message.guild.id, message.author.id);
    const count = violations ? violations.count + 1 : 1;
    
    // Apply punishment based on server settings
    if (server.antiPingPunishment === 'escalate') {
      await applyEscalatingTimeout(message, count);
    } else {
      await applyPingPunishment(message, server.antiPingPunishment || 'warn');
    }
    
    // Update violation count
    await storage.updatePingViolationCount(message.guild.id, message.author.id, count);
  }
}

// Apply escalating ping abuse punishment
async function applyEscalatingTimeout(message: Message, violationCount: number): Promise<void> {
  if (!message.guild || !message.member) return;
  
  const user = message.author;
  const reason = 'Protected role ping violation';
  
  // Escalating timeout durations in minutes:
  // 1st offense: warning (no timeout)
  // 2nd offense: 3 minutes
  // 3rd offense: 5 minutes
  // 4th offense: 10 minutes
  // 5th offense: 15 minutes
  // 6th offense: 30 minutes
  // 7th offense: 60 minutes
  // 8th offense and beyond: 120 minutes
  
  const timeoutDurations = [0, 0, 3, 5, 10, 15, 30, 60];
  const maxDuration = 120; // 120 minutes (2 hours) max
  
  // Get timeout duration in minutes (capped at max duration)
  const durationMinutes = violationCount >= timeoutDurations.length 
    ? maxDuration 
    : timeoutDurations[violationCount];
  
  try {
    if (violationCount === 1) {
      // First offense: just a warning
      if (message.channel.type === ChannelType.GuildText) {
        await message.channel.send(`${user}, please do not ping protected roles. This is a warning.`);
      }
    } else if (durationMinutes > 0 && message.member.moderatable) {
      // Apply timeout with escalating duration
      const durationMs = durationMinutes * 60 * 1000;
      await message.member.timeout(durationMs, reason);
      if (message.channel.type === ChannelType.GuildText) {
        await message.channel.send(
          `${user} has been timed out for ${durationMinutes} minutes for pinging protected roles. ` +
          `This is offense #${violationCount}.`
        );
      }
      
      // Try to DM the user about their punishment
      try {
        await user.send(
          `You have been timed out in ${message.guild.name} for ${durationMinutes} minutes.\n` +
          `Reason: Pinging protected roles\n` +
          `This is your ${violationCount}${getNumberSuffix(violationCount)} offense.\n` +
          `Further violations will result in longer timeouts.`
        );
      } catch {
        // Unable to DM user, continue
        console.log(`Could not DM ${user.tag} about their timeout`);
      }
    }
    
    // Log moderation action
    incrementModerationActions();
    
    // Create activity log
    await storage.createActivityLog({
      serverId: message.guild.id,
      userId: message.client.user!.id,
      username: message.client.user!.tag,
      command: `anti-ping-escalate off#${violationCount} ${user.tag} ${durationMinutes}min`
    });
  } catch (error) {
    console.error('Error applying escalating timeout:', error);
  }
}

// Helper function to get the proper suffix for a number (1st, 2nd, 3rd, etc.)
function getNumberSuffix(num: number): string {
  if (num >= 11 && num <= 13) {
    return 'th';
  }
  
  switch (num % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// Apply ping abuse punishment
async function applyPingPunishment(message: Message, punishment: string): Promise<void> {
  if (!message.guild || !message.member) return;
  
  const user = message.author;
  const reason = 'Protected role ping violation';
  
  try {
    // Delete the offending message if it hasn't been deleted already
    try {
      await message.delete();
    } catch {
      // Message may have already been deleted, ignore this error
    }
    
    // Apply punishment based on server settings
    switch (punishment.toLowerCase()) {
      case 'warn':
        if (message.channel.type === ChannelType.GuildText) {
          await message.channel.send(`${user}, please do not ping protected roles. This is a warning.`);
        }
        break;
        
      case 'timeout':
        // 5 minute timeout
        if (message.member.moderatable) {
          await message.member.timeout(5 * 60 * 1000, reason);
          if (message.channel.type === ChannelType.GuildText) {
            await message.channel.send(`${user} has been timed out for 5 minutes for pinging protected roles.`);
          }
          
          // Try to DM the user about their punishment
          try {
            await user.send(
              `You have been timed out in ${message.guild.name} for 5 minutes.\n` +
              `Reason: Pinging protected roles\n` +
              `Please respect the server's ping restrictions.`
            );
          } catch {
            // Unable to DM user, continue
            console.log(`Could not DM ${user.tag} about their timeout`);
          }
        }
        break;
        
      case 'kick':
        if (message.member.kickable) {
          await message.member.kick(reason);
          if (message.channel.type === ChannelType.GuildText) {
            await message.channel.send(`${user.tag} has been kicked for pinging protected roles.`);
          }
          
          // Try to DM the user about their punishment
          try {
            await user.send(
              `You have been kicked from ${message.guild.name}.\n` +
              `Reason: Pinging protected roles\n` +
              `Please respect the server's ping restrictions if you rejoin.`
            );
          } catch {
            // Unable to DM user, continue
            console.log(`Could not DM ${user.tag} about their kick`);
          }
        }
        break;
        
      case 'ban':
        if (message.member.bannable) {
          // Try to DM the user before banning them
          try {
            await user.send(
              `You have been banned from ${message.guild.name}.\n` +
              `Reason: Pinging protected roles\n` +
              `This action cannot be appealed.`
            );
          } catch {
            // Unable to DM user, continue
            console.log(`Could not DM ${user.tag} about their ban`);
          }
          
          await message.member.ban({ reason });
          if (message.channel.type === ChannelType.GuildText) {
            await message.channel.send(`${user.tag} has been banned for pinging protected roles.`);
          }
        }
        break;
        
      case 'escalate':
        // Get the user's violation count
        const violations = await storage.getPingViolations(message.guild.id, user.id);
        const count = violations ? violations.count + 1 : 1;
        
        // Apply escalating timeout
        await applyEscalatingTimeout(message, count);
        
        // Update violation count
        await storage.updatePingViolationCount(message.guild.id, user.id, count);
        break;
    }
    
    // Log moderation action
    incrementModerationActions();
    
    // Create activity log
    await storage.createActivityLog({
      serverId: message.guild.id,
      userId: message.client.user!.id,
      username: message.client.user!.tag,
      command: `anti-ping-action ${punishment} ${user.tag}`
    });
  } catch (error) {
    console.error('Error applying ping punishment:', error);
  }
}
