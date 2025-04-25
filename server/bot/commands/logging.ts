import { Message, PermissionFlagsBits, TextChannel, Client, EmbedBuilder, Colors } from 'discord.js';
import { CommandCategory } from '@shared/schema';
import { Command } from '../utils';
import { 
  enableLogging, 
  disableLogging, 
  getLogSettings, 
  updateLogEvents, 
  LogEvent 
} from '../logging';

// Helper function to display the current logging status
async function displayLoggingStatus(message: Message, guildId: string) {
  const settings = await getLogSettings(guildId);
  
  let logChannelText = "Not set";
  if (settings.logChannelId) {
    const channel = message.guild?.channels.cache.get(settings.logChannelId);
    logChannelText = channel ? `<#${channel.id}>` : "Channel not found";
  }
  
  // Create map of event names to emoji indicators
  const eventStatus: Record<string, string> = {};
  Object.values(LogEvent).forEach(event => {
    eventStatus[event] = settings.events.includes(event) ? "✅" : "❌";
  });
  
  const embed = new EmbedBuilder()
    .setTitle("Logging System Status")
    .setColor(settings.enabled ? Colors.Green : Colors.Red)
    .setDescription(`Logging is currently **${settings.enabled ? "ENABLED" : "DISABLED"}**`)
    .addFields(
      { name: "Log Channel", value: logChannelText, inline: false },
      { name: "Logged Events", value: "\u200B", inline: false },
      { name: "👤 Member Events", value: `${eventStatus[LogEvent.MEMBER_JOIN]} Member Join\n${eventStatus[LogEvent.MEMBER_LEAVE]} Member Leave\n${eventStatus[LogEvent.NICKNAME_CHANGE]} Nickname Change`, inline: true },
      { name: "💬 Message Events", value: `${eventStatus[LogEvent.MESSAGE_DELETE]} Message Delete\n${eventStatus[LogEvent.MESSAGE_EDIT]} Message Edit`, inline: true },
      { name: "🛠️ Server Events", value: `${eventStatus[LogEvent.CHANNEL_CREATE]} Channel Create\n${eventStatus[LogEvent.CHANNEL_DELETE]} Channel Delete\n${eventStatus[LogEvent.CHANNEL_UPDATE]} Channel Update\n${eventStatus[LogEvent.ROLE_CREATE]} Role Create\n${eventStatus[LogEvent.ROLE_DELETE]} Role Delete\n${eventStatus[LogEvent.ROLE_UPDATE]} Role Update`, inline: true },
      { name: "🛡️ Moderation Events", value: `${eventStatus[LogEvent.MOD_ACTION]} Moderation Actions`, inline: true }
    )
    .setFooter({ text: "Use +logs enable <channel> to turn on logging" })
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
}

// Helper function to get event name map
function getEventNameMap(): Record<string, LogEvent> {
  return {
    'member-join': LogEvent.MEMBER_JOIN,
    'member-leave': LogEvent.MEMBER_LEAVE,
    'message-delete': LogEvent.MESSAGE_DELETE,
    'message-edit': LogEvent.MESSAGE_EDIT,
    'channel-create': LogEvent.CHANNEL_CREATE,
    'channel-delete': LogEvent.CHANNEL_DELETE,
    'channel-update': LogEvent.CHANNEL_UPDATE,
    'role-create': LogEvent.ROLE_CREATE,
    'role-delete': LogEvent.ROLE_DELETE,
    'role-update': LogEvent.ROLE_UPDATE,
    'nickname-change': LogEvent.NICKNAME_CHANGE,
    'mod-action': LogEvent.MOD_ACTION,
    'all': 'ALL' as LogEvent
  };
}

// Helper to display available events
function displayEventList(message: Message) {
  const eventMap = getEventNameMap();
  
  // Determine if this was called via slash command
  const isSlashCommand = (message as any).commandName !== undefined;
  
  // Set the prefix based on invocation method
  const prefix = isSlashCommand ? '/' : '+';
  
  const embed = new EmbedBuilder()
    .setTitle("Available Log Event Types")
    .setColor(Colors.Blue)
    .setDescription(`Use these event names with the \`${prefix}logs events add/remove\` commands`)
    .addFields(
      { name: "👤 Member Events", value: "`member-join`, `member-leave`, `nickname-change`", inline: false },
      { name: "💬 Message Events", value: "`message-delete`, `message-edit`", inline: false },
      { name: "🛠️ Server Events", value: "`channel-create`, `channel-delete`, `channel-update`,\n`role-create`, `role-delete`, `role-update`", inline: false },
      { name: "🛡️ Moderation Events", value: "`mod-action`", inline: false },
      { name: "Special", value: "`all` - Adds or removes all events", inline: false }
    )
    .setFooter({ text: `Example: ${prefix}logs events add message-delete` });
    
  message.channel.send({ embeds: [embed] });
}

export const loggingCommands: Command[] = [
  {
    name: 'logs',
    description: 'Configure server event logging',
    usage: '+logs [status|enable <channel>|disable|events]',
    category: CommandCategory.UTILITY,
    cooldown: 5,
    requiredPermissions: [PermissionFlagsBits.ManageGuild],
    execute: async (message, args, client) => {
      if (!message.guild) {
        await message.reply("This command can only be used in a server.");
        return;
      }
      
      const guildId = message.guild.id;
      
      // If no arguments, show status
      if (!args.length) {
        await displayLoggingStatus(message, guildId);
        return;
      }
      
      const subcommand = args[0].toLowerCase();
      
      switch (subcommand) {
        case 'status':
          await displayLoggingStatus(message, guildId);
          break;
          
        case 'enable':
          // Check if a channel was specified
          if (args.length < 2) {
            // Determine if this was called via slash command
            const isSlashCommand = (message as any).commandName !== undefined;
            const prefix = isSlashCommand ? '/' : '+';
            await message.reply(`You need to specify a channel. Usage: \`${prefix}logs enable #channel\``);
            return;
          }
          
          // Try to parse channel mention
          let channelId = args[1].replace(/[<#>]/g, '');
          let channel = message.guild.channels.cache.get(channelId);
          
          // If the channel wasn't found by ID, try by name
          if (!channel) {
            channel = message.guild.channels.cache.find(c => 
              c.name.toLowerCase() === args[1].toLowerCase() && c.isTextBased()
            );
          }
          
          if (!channel || !channel.isTextBased()) {
            await message.reply("I couldn't find that text channel. Please specify a valid text channel.");
            return;
          }
          
          // Check bot permissions in the channel
          if (!channel.permissionsFor(client.user!)?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks
          ])) {
            await message.reply(`I don't have permission to send messages in ${channel}. Please give me the required permissions and try again.`);
            return;
          }
          
          // Enable logging for this channel
          await enableLogging(guildId, channel.id);
          await message.reply(`Logging enabled! Server events will now be logged in ${channel}.`);
          
          await displayLoggingStatus(message, guildId);
          break;
          
        case 'disable':
          await disableLogging(guildId);
          await message.reply("Logging disabled. Server events will no longer be logged.");
          break;
          
        case 'events':
          if (args.length < 2) {
            await displayEventList(message);
            return;
          }
          
          const eventAction = args[1].toLowerCase();
          
          if (eventAction !== 'add' && eventAction !== 'remove') {
            await message.reply("Invalid action. Use `add` or `remove`.");
            await displayEventList(message);
            return;
          }
          
          if (args.length < 3) {
            // Determine if this was called via slash command
            const slashCmd = (message as any).commandName !== undefined;
            const cmdPrefix = slashCmd ? '/' : '+';
            await message.reply(`Please specify which events to ${eventAction}. Example: \`${cmdPrefix}logs events ${eventAction} message-delete\``);
            await displayEventList(message);
            return;
          }
          
          // Get current settings
          const settings = await getLogSettings(guildId);
          const eventMap = getEventNameMap();
          const eventArg = args[2].toLowerCase();
          
          // Handle 'all' special case
          if (eventArg === 'all') {
            if (eventAction === 'add') {
              // Add all events
              settings.events = Object.values(LogEvent);
              await updateLogEvents(guildId, settings.events);
              await message.reply("All logging events have been enabled.");
            } else {
              // Remove all events
              settings.events = [];
              await updateLogEvents(guildId, settings.events);
              await message.reply("All logging events have been disabled.");
            }
            
            await displayLoggingStatus(message, guildId);
            return;
          }
          
          // Handle specific event
          const eventType = eventMap[eventArg];
          
          if (!eventType) {
            await message.reply(`Unknown event type: \`${eventArg}\`. Use \`+logs events\` to see available events.`);
            return;
          }
          
          if (eventAction === 'add') {
            // Add event if not already present
            if (!settings.events.includes(eventType)) {
              settings.events.push(eventType);
              await updateLogEvents(guildId, settings.events);
              await message.reply(`The \`${eventArg}\` event will now be logged.`);
            } else {
              await message.reply(`The \`${eventArg}\` event is already being logged.`);
            }
          } else {
            // Remove event if present
            if (settings.events.includes(eventType)) {
              settings.events = settings.events.filter(e => e !== eventType);
              await updateLogEvents(guildId, settings.events);
              await message.reply(`The \`${eventArg}\` event will no longer be logged.`);
            } else {
              await message.reply(`The \`${eventArg}\` event is not currently being logged.`);
            }
          }
          
          await displayLoggingStatus(message, guildId);
          break;
          
        default:
          await message.reply("Unknown subcommand. Available options: `status`, `enable <channel>`, `disable`, `events [add|remove] [event]`");
          break;
      }
    }
  }
];