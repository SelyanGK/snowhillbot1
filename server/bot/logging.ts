import { 
  Client, 
  TextChannel, 
  EmbedBuilder, 
  GuildMember, 
  User, 
  Message, 
  PartialMessage, 
  GuildChannel, 
  Role,
  AuditLogEvent,
  Guild,
  Colors
} from 'discord.js';
import { formatDate } from './utils';
import { storage } from '../storage';

/**
 * Represents log settings for a server
 */
interface LogSettings {
  enabled: boolean;
  logChannelId: string | null;
  events: LogEvent[];
}

/**
 * Types of events that can be logged
 */
export enum LogEvent {
  MEMBER_JOIN = 'MEMBER_JOIN',
  MEMBER_LEAVE = 'MEMBER_LEAVE',
  MESSAGE_DELETE = 'MESSAGE_DELETE',
  MESSAGE_EDIT = 'MESSAGE_EDIT',
  CHANNEL_CREATE = 'CHANNEL_CREATE',
  CHANNEL_DELETE = 'CHANNEL_DELETE',
  CHANNEL_UPDATE = 'CHANNEL_UPDATE',
  ROLE_CREATE = 'ROLE_CREATE',
  ROLE_DELETE = 'ROLE_DELETE',
  ROLE_UPDATE = 'ROLE_UPDATE',
  NICKNAME_CHANGE = 'NICKNAME_CHANGE',
  MOD_ACTION = 'MOD_ACTION'
}

/**
 * Map of default enabled events for new servers
 */
const DEFAULT_ENABLED_EVENTS = [
  LogEvent.MEMBER_JOIN,
  LogEvent.MEMBER_LEAVE,
  LogEvent.MESSAGE_DELETE,
  LogEvent.MESSAGE_EDIT,
  LogEvent.MOD_ACTION
];

/**
 * Gets the log settings for a server
 */
export async function getLogSettings(guildId: string): Promise<LogSettings> {
  const server = await storage.getServer(guildId);
  
  // If server doesn't exist or doesn't have log settings yet, return defaults
  if (!server || !server.logSettings) {
    return {
      enabled: false,
      logChannelId: null,
      events: DEFAULT_ENABLED_EVENTS
    };
  }
  
  return JSON.parse(server.logSettings);
}

/**
 * Updates log settings for a server
 */
export async function updateLogSettings(guildId: string, settings: LogSettings): Promise<void> {
  await storage.updateServer(guildId, {
    logSettings: JSON.stringify(settings)
  });
}

/**
 * Enables logging for a server
 */
export async function enableLogging(guildId: string, logChannelId: string): Promise<boolean> {
  const settings = await getLogSettings(guildId);
  
  settings.enabled = true;
  settings.logChannelId = logChannelId;
  
  await updateLogSettings(guildId, settings);
  return true;
}

/**
 * Disables logging for a server
 */
export async function disableLogging(guildId: string): Promise<boolean> {
  const settings = await getLogSettings(guildId);
  
  settings.enabled = false;
  
  await updateLogSettings(guildId, settings);
  return true;
}

/**
 * Updates which events are logged for a server
 */
export async function updateLogEvents(guildId: string, events: LogEvent[]): Promise<boolean> {
  const settings = await getLogSettings(guildId);
  
  settings.events = events;
  
  await updateLogSettings(guildId, settings);
  return true;
}

/**
 * Checks if an event is enabled for logging
 */
export async function isEventLogged(guildId: string, event: LogEvent): Promise<boolean> {
  const settings = await getLogSettings(guildId);
  
  return settings.enabled && settings.events.includes(event);
}

/**
 * Gets the log channel for a guild
 */
async function getLogChannel(guild: Guild): Promise<TextChannel | null> {
  const settings = await getLogSettings(guild.id);
  
  if (!settings.enabled || !settings.logChannelId) {
    return null;
  }
  
  try {
    const channel = await guild.channels.fetch(settings.logChannelId);
    if (channel && channel.isTextBased() && !channel.isThread()) {
      return channel as TextChannel;
    }
  } catch (error) {
    console.error(`Error fetching log channel for guild ${guild.id}:`, error);
  }
  
  return null;
}

/**
 * Logs a member join event
 */
export async function logMemberJoin(member: GuildMember): Promise<void> {
  if (!await isEventLogged(member.guild.id, LogEvent.MEMBER_JOIN)) {
    return;
  }
  
  const logChannel = await getLogChannel(member.guild);
  if (!logChannel) return;
  
  const createdAt = member.user.createdAt;
  const daysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  
  const embed = new EmbedBuilder()
    .setTitle('Member Joined')
    .setColor(Colors.Green)
    .setDescription(`${member} joined the server`)
    .addFields(
      { name: 'User', value: `${member.user.tag} (${member.id})` },
      { name: 'Account Created', value: `${formatDate(createdAt)} (${daysAgo} days ago)` }
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
  
  await logChannel.send({ embeds: [embed] });
}

/**
 * Logs a member leave event
 */
export async function logMemberLeave(member: GuildMember): Promise<void> {
  if (!await isEventLogged(member.guild.id, LogEvent.MEMBER_LEAVE)) {
    return;
  }
  
  const logChannel = await getLogChannel(member.guild);
  if (!logChannel) return;
  
  // Try to find out if the member was kicked or banned
  const now = Date.now();
  const auditLogs = await member.guild.fetchAuditLogs({
    type: AuditLogEvent.MemberKick,
    limit: 5,
  });
  
  let kickLog = auditLogs.entries.find(
    entry => 
      entry.target?.id === member.id && 
      now - entry.createdTimestamp < 5000
  );
  
  if (kickLog) {
    // This was a kick, which will be logged separately by the moderation action
    return;
  }
  
  const banLogs = await member.guild.fetchAuditLogs({
    type: AuditLogEvent.MemberBanAdd,
    limit: 5,
  });
  
  let banLog = banLogs.entries.find(
    entry => 
      entry.target?.id === member.id && 
      now - entry.createdTimestamp < 5000
  );
  
  if (banLog) {
    // This was a ban, which will be logged separately by the moderation action
    return;
  }
  
  // If we get here, the member left voluntarily
  const embed = new EmbedBuilder()
    .setTitle('Member Left')
    .setColor(Colors.Red)
    .setDescription(`${member.user.tag} left the server`)
    .addFields(
      { name: 'User', value: `${member.user.tag} (${member.id})` },
      { name: 'Joined At', value: member.joinedAt ? formatDate(member.joinedAt) : 'Unknown' }
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
  
  await logChannel.send({ embeds: [embed] });
}

/**
 * Logs a message delete event
 */
export async function logMessageDelete(message: Message<boolean> | PartialMessage): Promise<void> {
  if (!message.guild || !await isEventLogged(message.guild.id, LogEvent.MESSAGE_DELETE)) {
    return;
  }
  
  const logChannel = await getLogChannel(message.guild);
  if (!logChannel) return;
  
  // Don't log messages from the log channel itself to prevent loops
  if (message.channel.id === logChannel.id) {
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('Message Deleted')
    .setColor(Colors.Red)
    .addFields(
      { name: 'Channel', value: `<#${message.channel.id}>` }
    )
    .setTimestamp();
  
  // Handle partial messages (messages that were deleted from cache)
  if (message.partial) {
    embed.setDescription('*Message content is not available*');
  } else {
    if (message.author) {
      embed.addFields({ name: 'Author', value: `${message.author.tag} (${message.author.id})` });
      embed.setThumbnail(message.author.displayAvatarURL());
    }
    
    if (message.content) {
      // Truncate long messages
      const content = message.content.length > 1024 
        ? message.content.substring(0, 1021) + '...' 
        : message.content;
        
      embed.addFields({ name: 'Content', value: content || '*No content*' });
    }
    
    if (message.attachments.size > 0) {
      const attachmentList = message.attachments
        .map(a => `[${a.name}](${a.url})`)
        .join('\n');
        
      embed.addFields({ name: 'Attachments', value: attachmentList.substring(0, 1024) });
    }
  }
  
  await logChannel.send({ embeds: [embed] });
}

/**
 * Logs a message edit event
 */
export async function logMessageEdit(oldMessage: Message<boolean> | PartialMessage, newMessage: Message<boolean> | PartialMessage): Promise<void> {
  if (!newMessage.guild || !await isEventLogged(newMessage.guild.id, LogEvent.MESSAGE_EDIT)) {
    return;
  }
  
  const logChannel = await getLogChannel(newMessage.guild);
  if (!logChannel) return;
  
  // Don't log edits from the log channel itself to prevent loops
  if (newMessage.channel.id === logChannel.id) {
    return;
  }
  
  // Don't log if there's no actual content change (e.g., embed loading)
  if (oldMessage.content === newMessage.content) {
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('Message Edited')
    .setColor(Colors.Gold)
    .addFields(
      { name: 'Channel', value: `<#${newMessage.channel.id}>` },
      { name: 'Jump to Message', value: `[Click Here](${newMessage.url})` }
    )
    .setTimestamp();
  
  // Handle partial messages
  if (oldMessage.partial) {
    embed.addFields({ name: 'Before', value: '*Message content is not available*' });
  } else {
    const oldContent = oldMessage.content?.length ? 
      (oldMessage.content.length > 1024 ? oldMessage.content.substring(0, 1021) + '...' : oldMessage.content) 
      : '*No content*';
      
    embed.addFields({ name: 'Before', value: oldContent });
  }
  
  if (newMessage.author) {
    embed.addFields({ name: 'Author', value: `${newMessage.author.tag} (${newMessage.author.id})` });
    embed.setThumbnail(newMessage.author.displayAvatarURL());
  }
  
  const newContent = newMessage.content?.length ? 
    (newMessage.content.length > 1024 ? newMessage.content.substring(0, 1021) + '...' : newMessage.content) 
    : '*No content*';
    
  embed.addFields({ name: 'After', value: newContent });
  
  await logChannel.send({ embeds: [embed] });
}

/**
 * Logs a channel create event
 */
export async function logChannelCreate(channel: GuildChannel): Promise<void> {
  if (!await isEventLogged(channel.guild.id, LogEvent.CHANNEL_CREATE)) {
    return;
  }
  
  const logChannel = await getLogChannel(channel.guild);
  if (!logChannel) return;
  
  // Fetch audit logs to get who created the channel
  const auditLogs = await channel.guild.fetchAuditLogs({
    type: AuditLogEvent.ChannelCreate,
    limit: 1,
  });
  
  const channelCreateLog = auditLogs.entries.first();
  const creator = channelCreateLog?.executor;
  
  const embed = new EmbedBuilder()
    .setTitle('Channel Created')
    .setColor(Colors.Green)
    .setDescription(`Channel ${channel.name} was created`)
    .addFields(
      { name: 'Name', value: channel.name },
      { name: 'ID', value: channel.id },
      { name: 'Type', value: channel.type.toString() }
    )
    .setTimestamp();
  
  if (creator) {
    embed.addFields({ name: 'Created By', value: `${creator.tag} (${creator.id})` });
  }
  
  await logChannel.send({ embeds: [embed] });
}

/**
 * Logs a channel delete event
 */
export async function logChannelDelete(channel: GuildChannel): Promise<void> {
  if (!await isEventLogged(channel.guild.id, LogEvent.CHANNEL_DELETE)) {
    return;
  }
  
  const logChannel = await getLogChannel(channel.guild);
  if (!logChannel) return;
  
  // If the deleted channel is the log channel, we can't log it
  if (channel.id === logChannel.id) {
    return;
  }
  
  // Fetch audit logs to get who deleted the channel
  const auditLogs = await channel.guild.fetchAuditLogs({
    type: AuditLogEvent.ChannelDelete,
    limit: 1,
  });
  
  const channelDeleteLog = auditLogs.entries.first();
  const destroyer = channelDeleteLog?.executor;
  
  const embed = new EmbedBuilder()
    .setTitle('Channel Deleted')
    .setColor(Colors.Red)
    .setDescription(`Channel ${channel.name} was deleted`)
    .addFields(
      { name: 'Name', value: channel.name },
      { name: 'ID', value: channel.id },
      { name: 'Type', value: channel.type.toString() }
    )
    .setTimestamp();
  
  if (destroyer) {
    embed.addFields({ name: 'Deleted By', value: `${destroyer.tag} (${destroyer.id})` });
  }
  
  await logChannel.send({ embeds: [embed] });
}

/**
 * Logs a role create event
 */
export async function logRoleCreate(role: Role): Promise<void> {
  if (!await isEventLogged(role.guild.id, LogEvent.ROLE_CREATE)) {
    return;
  }
  
  const logChannel = await getLogChannel(role.guild);
  if (!logChannel) return;
  
  // Fetch audit logs to get who created the role
  const auditLogs = await role.guild.fetchAuditLogs({
    type: AuditLogEvent.RoleCreate,
    limit: 1,
  });
  
  const roleCreateLog = auditLogs.entries.first();
  const creator = roleCreateLog?.executor;
  
  const embed = new EmbedBuilder()
    .setTitle('Role Created')
    .setColor(role.color || Colors.Green)
    .setDescription(`Role ${role.name} was created`)
    .addFields(
      { name: 'Name', value: role.name },
      { name: 'ID', value: role.id }
    )
    .setTimestamp();
  
  if (creator) {
    embed.addFields({ name: 'Created By', value: `${creator.tag} (${creator.id})` });
  }
  
  await logChannel.send({ embeds: [embed] });
}

/**
 * Logs a role delete event
 */
export async function logRoleDelete(role: Role): Promise<void> {
  if (!await isEventLogged(role.guild.id, LogEvent.ROLE_DELETE)) {
    return;
  }
  
  const logChannel = await getLogChannel(role.guild);
  if (!logChannel) return;
  
  // Fetch audit logs to get who deleted the role
  const auditLogs = await role.guild.fetchAuditLogs({
    type: AuditLogEvent.RoleDelete,
    limit: 1,
  });
  
  const roleDeleteLog = auditLogs.entries.first();
  const destroyer = roleDeleteLog?.executor;
  
  const embed = new EmbedBuilder()
    .setTitle('Role Deleted')
    .setColor(role.color || Colors.Red)
    .setDescription(`Role ${role.name} was deleted`)
    .addFields(
      { name: 'Name', value: role.name },
      { name: 'ID', value: role.id }
    )
    .setTimestamp();
  
  if (destroyer) {
    embed.addFields({ name: 'Deleted By', value: `${destroyer.tag} (${destroyer.id})` });
  }
  
  await logChannel.send({ embeds: [embed] });
}

/**
 * Logs a moderation action (ban, kick, mute, etc.)
 */
export async function logModAction(
  guild: Guild,
  moderator: User,
  target: User,
  action: string,
  reason: string | null,
  duration?: string | null
): Promise<void> {
  if (!await isEventLogged(guild.id, LogEvent.MOD_ACTION)) {
    return;
  }
  
  const logChannel = await getLogChannel(guild);
  if (!logChannel) return;
  
  const embed = new EmbedBuilder()
    .setTitle(`Moderation Action: ${action}`)
    .setColor(Colors.DarkRed)
    .setDescription(`${moderator.tag} performed a moderation action`)
    .addFields(
      { name: 'Moderator', value: `${moderator.tag} (${moderator.id})` },
      { name: 'Target', value: `${target.tag} (${target.id})` },
      { name: 'Action', value: action }
    )
    .setThumbnail(target.displayAvatarURL())
    .setTimestamp();
  
  if (reason) {
    embed.addFields({ name: 'Reason', value: reason });
  }
  
  if (duration) {
    embed.addFields({ name: 'Duration', value: duration });
  }
  
  await logChannel.send({ embeds: [embed] });
}

/**
 * Setup all event handlers for logging
 */
export function setupLoggingEvents(client: Client): void {
  // Member events
  client.on('guildMemberAdd', async (member) => {
    await logMemberJoin(member);
  });
  
  client.on('guildMemberRemove', async (member) => {
    await logMemberLeave(member);
  });
  
  // Message events
  client.on('messageDelete', async (message) => {
    await logMessageDelete(message);
  });
  
  client.on('messageUpdate', async (oldMessage, newMessage) => {
    await logMessageEdit(oldMessage, newMessage);
  });
  
  // Channel events
  client.on('channelCreate', async (channel) => {
    if (channel.guild) {
      await logChannelCreate(channel as GuildChannel);
    }
  });
  
  client.on('channelDelete', async (channel) => {
    if (channel.guild) {
      await logChannelDelete(channel as GuildChannel);
    }
  });
  
  // Role events
  client.on('roleCreate', async (role) => {
    await logRoleCreate(role);
  });
  
  client.on('roleDelete', async (role) => {
    await logRoleDelete(role);
  });
}