import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  Client, 
  EmbedBuilder, 
  GuildMember, 
  Message, 
  PermissionFlagsBits, 
  Role, 
  TextChannel
} from 'discord.js';
import { Command } from '../utils';
import { CommandCategory } from '@shared/schema';
import { storage } from '../../storage';
import { incrementCommandsUsed } from '../index';
import ms from 'ms';

// Function to parse duration from input (e.g., "1d", "2h", "30m")
function parseDuration(durationStr: string): number | null {
  try {
    const duration = ms(durationStr);
    if (isNaN(duration) || duration <= 0) {
      return null;
    }
    return duration;
  } catch (error) {
    return null;
  }
}

// Function to format time until end
function formatTimeLeft(endTime: Date): string {
  const now = new Date();
  const totalSeconds = Math.floor((endTime.getTime() - now.getTime()) / 1000);
  
  if (totalSeconds <= 0) return 'Ended';
  
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

// Helper function to randomly select winners
async function selectWinners(giveawayId: number, winnerCount: number): Promise<string[]> {
  // Get all entries for this giveaway
  const entries = await storage.getGiveawayEntries(giveawayId);
  
  // If no entries, return empty array
  if (entries.length === 0) {
    return [];
  }
  
  // Make a copy of entries
  const entriesCopy = [...entries];
  const selectedWinners: string[] = [];
  
  // Select random winners
  for (let i = 0; i < Math.min(winnerCount, entriesCopy.length); i++) {
    const randomIndex = Math.floor(Math.random() * entriesCopy.length);
    const winner = entriesCopy[randomIndex];
    selectedWinners.push(winner.userId);
    
    // Remove the selected entry to avoid duplicate winners
    entriesCopy.splice(randomIndex, 1);
    
    // Save the winner to database
    await storage.createGiveawayWinner({
      giveawayId,
      userId: winner.userId,
      username: winner.username
    });
  }
  
  return selectedWinners;
}

// Function to update the giveaway message
async function updateGiveawayMessage(client: Client, giveawayId: number): Promise<void> {
  try {
    // Get the giveaway from storage
    const giveaway = await storage.getGiveaway(giveawayId);
    if (!giveaway) return;
    
    // Get the guild and channel
    const guild = client.guilds.cache.get(giveaway.serverId);
    if (!guild) return;
    
    const channel = guild.channels.cache.get(giveaway.channelId) as TextChannel;
    if (!channel) return;
    
    // Try to fetch the message
    try {
      const message = await channel.messages.fetch(giveaway.messageId);
      if (!message) return;
      
      // Get entry count
      const entries = await storage.getGiveawayEntries(giveaway.id);
      
      // Get winners if the giveaway has ended
      let winnerText = '\u200B';
      if (giveaway.hasEnded) {
        const winners = await storage.getGiveawayWinners(giveaway.id);
        if (winners.length > 0) {
          winnerText = winners.map(w => `<@${w.userId}>`).join(', ');
        } else {
          winnerText = 'No winners (no valid entries)';
        }
      }
      
      // Create the updated embed
      const embed = new EmbedBuilder()
        .setTitle(`🎉 Giveaway: ${giveaway.prize}`)
        .setDescription(`React with the button below to enter!`)
        .setColor(giveaway.hasEnded ? 0xED4245 : 0x5865F2)
        .addFields(
          { name: '🏆 Prize', value: giveaway.prize, inline: true },
          { name: '🎁 Winners', value: `${giveaway.winnerCount}`, inline: true },
          { name: '👥 Entries', value: `${entries.length}`, inline: true },
          { name: '⏰ Time', value: giveaway.hasEnded ? 'Ended' : formatTimeLeft(giveaway.endTime), inline: true },
          { name: '🎫 Host', value: `<@${giveaway.hostId}>`, inline: true }
        );
        
      if (giveaway.hasEnded) {
        embed.addFields({ name: '🏅 Winners', value: winnerText });
      }
      
      // Create action row with button
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_enter_${giveaway.id}`)
          .setLabel(giveaway.hasEnded ? 'Giveaway Ended' : 'Enter Giveaway')
          .setStyle(giveaway.hasEnded ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setEmoji('🎉')
          .setDisabled(giveaway.hasEnded)
      );
      
      // Update the message
      await message.edit({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error(`Error updating giveaway message: ${error}`);
    }
  } catch (error) {
    console.error(`Error in updateGiveawayMessage: ${error}`);
  }
}

// Function to end a giveaway
async function endGiveaway(client: Client, giveawayId: number): Promise<void> {
  try {
    // Get the giveaway from storage
    const giveaway = await storage.getGiveaway(giveawayId);
    if (!giveaway || giveaway.hasEnded) return;
    
    // Mark giveaway as ended
    await storage.updateGiveaway(giveawayId, true);
    
    // Select winners
    const winnerIds = await selectWinners(giveawayId, giveaway.winnerCount);
    
    // Get the guild and channel
    const guild = client.guilds.cache.get(giveaway.serverId);
    if (!guild) return;
    
    const channel = guild.channels.cache.get(giveaway.channelId) as TextChannel;
    if (!channel) return;
    
    // Update the giveaway message
    await updateGiveawayMessage(client, giveawayId);
    
    // Send winner announcement
    if (winnerIds.length > 0) {
      const winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');
      await channel.send({
        content: `Congratulations ${winnerMentions}! You won the **${giveaway.prize}** giveaway!`,
        allowedMentions: { users: winnerIds }
      });
    } else {
      await channel.send(`No valid entries for the **${giveaway.prize}** giveaway, so no winners could be picked!`);
    }
  } catch (error) {
    console.error(`Error ending giveaway: ${error}`);
  }
}

// Function to reroll a giveaway
async function rerollGiveaway(client: Client, giveawayId: number, count = 1): Promise<string[]> {
  try {
    // Get the giveaway from storage
    const giveaway = await storage.getGiveaway(giveawayId);
    if (!giveaway || !giveaway.hasEnded) return [];
    
    // Get all entries
    const entries = await storage.getGiveawayEntries(giveawayId);
    if (entries.length === 0) return [];
    
    // Get current winners
    const currentWinners = await storage.getGiveawayWinners(giveawayId);
    const currentWinnerIds = currentWinners.map(w => w.userId);
    
    // Filter entries to exclude current winners
    const eligibleEntries = entries.filter(entry => !currentWinnerIds.includes(entry.userId));
    if (eligibleEntries.length === 0) return [];
    
    // Make a copy of entries
    const entriesCopy = [...eligibleEntries];
    const newWinners: string[] = [];
    
    // Select random winners
    for (let i = 0; i < Math.min(count, entriesCopy.length); i++) {
      const randomIndex = Math.floor(Math.random() * entriesCopy.length);
      const winner = entriesCopy[randomIndex];
      newWinners.push(winner.userId);
      
      // Remove the selected entry to avoid duplicate winners
      entriesCopy.splice(randomIndex, 1);
      
      // Save the winner to database
      await storage.createGiveawayWinner({
        giveawayId,
        userId: winner.userId,
        username: winner.username
      });
    }
    
    // Update the giveaway message
    await updateGiveawayMessage(client, giveawayId);
    
    return newWinners;
  } catch (error) {
    console.error(`Error rerolling giveaway: ${error}`);
    return [];
  }
}

// Check if a member meets the role requirements
function meetsRoleRequirements(member: GuildMember, requiredRoles: Role[]): boolean {
  if (requiredRoles.length === 0) return true;
  
  for (const role of requiredRoles) {
    if (member.roles.cache.has(role.id)) {
      return true;
    }
  }
  
  return false;
}

// Export giveaway commands
export const giveawayCommands: Command[] = [
  {
    name: 'gstart',
    description: 'Start a new giveaway',
    usage: '+gstart <duration> <winners> <prize> [required role]',
    aliases: ['giveawaystart'],
    category: CommandCategory.GIVEAWAY,
    cooldown: 5,
    requiredPermissions: [PermissionFlagsBits.ManageGuild],
    execute: async (message, args, client) => {
      // Check if enough arguments
      if (args.length < 3) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Invalid Usage')
              .setDescription('Please provide the duration, number of winners, and prize.')
              .addFields({ name: 'Usage', value: '+gstart <duration> <winners> <prize> [required role]' })
              .addFields({ name: 'Example', value: '+gstart 1d 1 Discord Nitro @Member' })
          ]
        });
      }
      
      // Parse duration
      const durationStr = args[0];
      const duration = parseDuration(durationStr);
      if (!duration) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Invalid Duration')
              .setDescription('Please provide a valid duration (e.g., 1m, 1h, 1d)')
          ]
        });
      }
      
      // Parse winner count
      const winnerCount = parseInt(args[1]);
      if (isNaN(winnerCount) || winnerCount < 1) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Invalid Winner Count')
              .setDescription('Please provide a valid number of winners (minimum 1)')
          ]
        });
      }
      
      // Get required role if specified
      const requiredRole = message.mentions.roles.first();
      const requiredRoleId = requiredRole ? requiredRole.id : null;
      
      // Calculate end time
      const endTime = new Date(Date.now() + duration);
      
      // Get the prize (everything after the winner count and excluding the role mention)
      let prizeIndex = 2;
      let prize = args.slice(prizeIndex).join(' ');
      
      // Remove the role mention from the prize if present
      if (requiredRole && prize.includes(requiredRole.toString())) {
        prize = prize.replace(requiredRole.toString(), '').trim();
      }
      
      if (!prize || prize.length < 1) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Invalid Prize')
              .setDescription('Please provide a valid prize')
          ]
        });
      }
      
      // Create giveaway embed
      const embed = new EmbedBuilder()
        .setTitle(`🎉 Giveaway: ${prize}`)
        .setDescription(`React with the button below to enter!`)
        .setColor(0x5865F2)
        .addFields(
          { name: '🏆 Prize', value: prize, inline: true },
          { name: '🎁 Winners', value: `${winnerCount}`, inline: true },
          { name: '👥 Entries', value: '0', inline: true },
          { name: '⏰ Time', value: formatTimeLeft(endTime), inline: true },
          { name: '🎫 Host', value: `<@${message.author.id}>`, inline: true }
        );
      
      if (requiredRole) {
        embed.addFields({ name: '🔒 Required Role', value: requiredRole.toString(), inline: true });
      }
      
      // Create button for entering
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_enter_dummy`) // We'll update this after we have the giveaway ID
          .setLabel('Enter Giveaway')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎉')
      );
      
      try {
        // Send the giveaway message
        const giveawayMsg = await message.channel.send({ embeds: [embed], components: [row] });
        
        // Save the giveaway to database
        const giveaway = await storage.createGiveaway({
          serverId: message.guild!.id,
          channelId: message.channel.id,
          messageId: giveawayMsg.id,
          prize,
          winnerCount,
          hostId: message.author.id,
          endTime,
          requiredRoleId // New field for role requirement
        });
        
        // Update the button with the correct ID
        const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`giveaway_enter_${giveaway.id}`)
            .setLabel('Enter Giveaway')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎉')
        );
        
        await giveawayMsg.edit({ embeds: [embed], components: [updatedRow] });
        
        // Log command usage
        incrementCommandsUsed();
        
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `gstart ${prize}`
          });
        }
        
        // Set up a timeout to end the giveaway
        setTimeout(() => {
          endGiveaway(client, giveaway.id);
        }, duration);
        
        // Confirm to user
        message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('✅ Giveaway Started')
              .setDescription(`Your giveaway for **${prize}** has been started and will end in **${formatTimeLeft(endTime)}**`)
          ]
        });
      } catch (error) {
        console.error('Error starting giveaway:', error);
        message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Error')
              .setDescription('An error occurred while starting the giveaway')
          ]
        });
      }
    }
  },
  
  {
    name: 'gend',
    description: 'End a giveaway early',
    usage: '+gend <message ID>',
    aliases: ['giveawayend'],
    category: CommandCategory.GIVEAWAY,
    cooldown: 5,
    requiredPermissions: [PermissionFlagsBits.ManageGuild],
    execute: async (message, args, client) => {
      // Check if message ID is provided
      if (args.length < 1) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Invalid Usage')
              .setDescription('Please provide the message ID of the giveaway')
              .addFields({ name: 'Usage', value: '+gend <message ID>' })
          ]
        });
      }
      
      const messageId = args[0];
      
      try {
        // Find the giveaway by message ID
        const giveaway = await storage.getGiveawayByMessageId(messageId);
        if (!giveaway) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('❌ Giveaway Not Found')
                .setDescription('Could not find a giveaway with that message ID')
            ]
          });
        }
        
        // Check if already ended
        if (giveaway.hasEnded) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('❌ Giveaway Already Ended')
                .setDescription('This giveaway has already ended')
            ]
          });
        }
        
        // End the giveaway
        await endGiveaway(client, giveaway.id);
        
        // Log command usage
        incrementCommandsUsed();
        
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `gend ${messageId}`
          });
        }
        
        // Confirm to user
        message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('✅ Giveaway Ended')
              .setDescription(`The giveaway has been ended early and winners have been selected`)
          ]
        });
      } catch (error) {
        console.error('Error ending giveaway:', error);
        message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Error')
              .setDescription('An error occurred while ending the giveaway')
          ]
        });
      }
    }
  },
  
  {
    name: 'greroll',
    description: 'Reroll winners for a giveaway',
    usage: '+greroll <message ID> [winner count]',
    aliases: ['giveawayreroll'],
    category: CommandCategory.GIVEAWAY,
    cooldown: 5,
    requiredPermissions: [PermissionFlagsBits.ManageGuild],
    execute: async (message, args, client) => {
      // Check if message ID is provided
      if (args.length < 1) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Invalid Usage')
              .setDescription('Please provide the message ID of the giveaway')
              .addFields({ name: 'Usage', value: '+greroll <message ID> [winner count]' })
          ]
        });
      }
      
      const messageId = args[0];
      
      // Parse winner count if provided
      let winnerCount = 1;
      if (args.length > 1) {
        const parsedCount = parseInt(args[1]);
        if (!isNaN(parsedCount) && parsedCount > 0) {
          winnerCount = parsedCount;
        }
      }
      
      try {
        // Find the giveaway by message ID
        const giveaway = await storage.getGiveawayByMessageId(messageId);
        if (!giveaway) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('❌ Giveaway Not Found')
                .setDescription('Could not find a giveaway with that message ID')
            ]
          });
        }
        
        // Check if the giveaway has ended
        if (!giveaway.hasEnded) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('❌ Giveaway Not Ended')
                .setDescription('This giveaway has not ended yet')
            ]
          });
        }
        
        // Reroll the winners
        const newWinners = await rerollGiveaway(client, giveaway.id, winnerCount);
        
        // Log command usage
        incrementCommandsUsed();
        
        if (message.guild) {
          await storage.createActivityLog({
            serverId: message.guild.id,
            userId: message.author.id,
            username: message.author.tag,
            command: `greroll ${messageId} ${winnerCount}`
          });
        }
        
        // Announce new winners
        if (newWinners.length > 0) {
          const winnerMentions = newWinners.map(id => `<@${id}>`).join(', ');
          await message.channel.send({
            content: `Congratulations ${winnerMentions}! You are the new winner(s) of the **${giveaway.prize}** giveaway!`,
            allowedMentions: { users: newWinners }
          });
          
          // Confirm to user
          message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ Winners Rerolled')
                .setDescription(`Successfully rerolled ${newWinners.length} new winner(s) for the giveaway`)
            ]
          });
        } else {
          message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('❌ No Eligible Entries')
                .setDescription('Could not reroll winners because there are no eligible entries')
            ]
          });
        }
      } catch (error) {
        console.error('Error rerolling giveaway:', error);
        message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Error')
              .setDescription('An error occurred while rerolling the giveaway')
          ]
        });
      }
    }
  },
  
  {
    name: 'glist',
    description: 'List active giveaways',
    usage: '+glist',
    aliases: ['giveawaylist'],
    category: CommandCategory.GIVEAWAY,
    cooldown: 5,
    requiredPermissions: [],
    execute: async (message, args, client) => {
      if (!message.guild) return;
      
      try {
        // Get active giveaways for this server
        const giveaways = await storage.getActiveGiveaways(message.guild.id);
        
        if (giveaways.length === 0) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📃 Active Giveaways')
                .setDescription('There are no active giveaways in this server')
            ]
          });
        }
        
        // Create embed with giveaway list
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📃 Active Giveaways')
          .setDescription(`There are ${giveaways.length} active giveaways in this server`);
        
        // Add fields for each giveaway
        for (const giveaway of giveaways) {
          const channel = message.guild.channels.cache.get(giveaway.channelId);
          const channelName = channel ? `<#${channel.id}>` : 'Unknown channel';
          
          embed.addFields({
            name: `🎉 ${giveaway.prize}`,
            value: `Message ID: \`${giveaway.messageId}\`
            Channel: ${channelName}
            Winners: ${giveaway.winnerCount}
            Ends: ${formatTimeLeft(giveaway.endTime)}`
          });
        }
        
        // Log command usage
        incrementCommandsUsed();
        
        await storage.createActivityLog({
          serverId: message.guild.id,
          userId: message.author.id,
          username: message.author.tag,
          command: 'glist'
        });
        
        // Send the embed
        message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error listing giveaways:', error);
        message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Error')
              .setDescription('An error occurred while listing giveaways')
          ]
        });
      }
    }
  },
];

// Button handler for giveaway entry
export async function handleGiveawayButtonClick(interaction: any, giveawayId: number) {
  try {
    // Defer reply to prevent interaction timeout
    await interaction.deferReply({ ephemeral: true });
    
    // Get the giveaway
    const giveaway = await storage.getGiveaway(giveawayId);
    if (!giveaway) {
      return interaction.editReply('This giveaway no longer exists.');
    }
    
    // Check if giveaway has ended
    if (giveaway.hasEnded) {
      return interaction.editReply('This giveaway has already ended.');
    }
    
    // Check if the user already entered
    const existingEntry = await storage.getGiveawayEntry(giveawayId, interaction.user.id);
    if (existingEntry) {
      // User can withdraw their entry
      await storage.deleteGiveawayEntry(giveawayId, interaction.user.id);
      await updateGiveawayMessage(interaction.client, giveawayId);
      return interaction.editReply('You have withdrawn your entry from this giveaway.');
    }
    
    // Check role requirement if applicable
    if (giveaway.requiredRoleId) {
      const member = interaction.member;
      if (!member.roles.cache.has(giveaway.requiredRoleId)) {
        const role = interaction.guild.roles.cache.get(giveaway.requiredRoleId);
        const roleName = role ? role.name : 'required role';
        return interaction.editReply(`You need the ${roleName} role to enter this giveaway.`);
      }
    }
    
    // Create entry
    await storage.createGiveawayEntry({
      giveawayId,
      userId: interaction.user.id,
      username: interaction.user.tag
    });
    
    // Update giveaway message
    await updateGiveawayMessage(interaction.client, giveawayId);
    
    return interaction.editReply('You have entered the giveaway! Good luck!');
  } catch (error) {
    console.error('Error processing giveaway entry:', error);
    return interaction.editReply('An error occurred while processing your entry.');
  }
}

// Function to initialize and check for ended giveaways on bot startup
export async function initializeGiveaways(client: Client) {
  try {
    // Get all active giveaways from all servers
    const servers = await storage.getServers();
    for (const server of servers) {
      const giveaways = await storage.getActiveGiveaways(server.id);
      
      for (const giveaway of giveaways) {
        // Check if the giveaway should have ended
        const now = new Date();
        if (giveaway.endTime <= now) {
          // End the giveaway
          await endGiveaway(client, giveaway.id);
        } else {
          // Set up a timeout to end the giveaway at the right time
          const timeLeft = giveaway.endTime.getTime() - now.getTime();
          setTimeout(() => {
            endGiveaway(client, giveaway.id);
          }, timeLeft);
          
          // Update the giveaway message
          await updateGiveawayMessage(client, giveaway.id);
        }
      }
    }
    
    console.log('[Giveaways] Initialized all active giveaways');
  } catch (error) {
    console.error('[Giveaways] Error initializing giveaways:', error);
  }
}