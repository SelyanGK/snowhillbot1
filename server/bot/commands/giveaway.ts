import { 
  Client, 
  Message, 
  TextChannel, 
  ButtonBuilder, 
  ActionRowBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  GuildMember,
  Role,
  ButtonInteraction
} from 'discord.js';
import { storage } from '../../storage';
import { Command } from '../utils';
import { CommandCategory } from '@shared/schema';
import ms from 'ms';

/**
 * Parse duration string (e.g. "1d", "2h") into milliseconds
 */
function parseDuration(durationStr: string): number | null {
  try {
    // Use ms library to parse time strings like "1d", "2h", etc.
    return ms(durationStr as any);
  } catch (error) {
    return null;
  }
}

/**
 * Format the time left in a human-readable format
 */
function formatTimeLeft(endTime: Date): string {
  const timeLeft = endTime.getTime() - Date.now();
  
  if (timeLeft <= 0) {
    return "Ended";
  }
  
  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

/**
 * Select random winners from a giveaway
 */
async function selectWinners(giveawayId: number, winnerCount: number): Promise<string[]> {
  // Get all entries for this giveaway
  const entries = await storage.getGiveawayEntries(giveawayId);
  
  if (entries.length === 0) {
    return [];
  }
  
  // Shuffle the entries and pick winners
  const shuffled = [...entries].sort(() => 0.5 - Math.random());
  const winners = shuffled.slice(0, Math.min(winnerCount, entries.length));
  
  // Store winners in database
  for (const winner of winners) {
    await storage.createGiveawayWinner({
      giveawayId,
      userId: winner.userId,
      username: winner.username
    });
  }
  
  return winners.map(winner => winner.userId);
}

/**
 * Update a giveaway message with current data
 */
async function updateGiveawayMessage(client: Client, giveawayId: number): Promise<void> {
  try {
    // Get giveaway data
    const giveaway = await storage.getGiveaway(giveawayId);
    if (!giveaway) return;
    
    // Get required info
    const guild = client.guilds.cache.get(giveaway.serverId);
    if (!guild) return;
    
    // Find channel and message
    const channel = await guild.channels.fetch(giveaway.channelId) as TextChannel;
    if (!channel) return;
    
    try {
      const message = await channel.messages.fetch(giveaway.messageId);
      if (!message) return;
      
      // Get current entries
      const entries = await storage.getGiveawayEntries(giveawayId);
      const entryCount = entries.length;
      
      // Create updated embed
      const embed = new EmbedBuilder()
        .setTitle(`🎉 Giveaway: ${giveaway.prize}`)
        .setColor(0x5865F2)
        .setDescription(`React with the button below to enter!\n\n**Ends:** ${formatTimeLeft(giveaway.endTime)}\n**Winners:** ${giveaway.winnerCount}\n**Entries:** ${entryCount}`)
        .setFooter({ text: `Giveaway ID: ${giveaway.id} • Ends at` })
        .setTimestamp(giveaway.endTime);
      
      // Add role requirement if present
      if (giveaway.requiredRoleId) {
        const role = await guild.roles.fetch(giveaway.requiredRoleId);
        if (role) {
          embed.addFields({ name: 'Role Requirement', value: `You need the ${role.name} role to enter!` });
        }
      }
      
      // Create button row
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_enter_${giveaway.id}`)
          .setLabel(giveaway.hasEnded ? 'Giveaway Ended' : '🎁 Enter Giveaway')
          .setStyle(giveaway.hasEnded ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(giveaway.hasEnded)
      );
      
      // Update message
      await message.edit({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error(`Error updating giveaway message: ${error}`);
    }
  } catch (error) {
    console.error(`Error in updateGiveawayMessage: ${error}`);
  }
}

/**
 * End a giveaway and pick winners
 */
async function endGiveaway(client: Client, giveawayId: number): Promise<void> {
  try {
    // Get giveaway data
    const giveaway = await storage.getGiveaway(giveawayId);
    if (!giveaway) return;
    
    // Mark giveaway as ended
    await storage.updateGiveaway(giveawayId, true);
    
    // Get channel
    const guild = client.guilds.cache.get(giveaway.serverId);
    if (!guild) return;
    
    const channel = await guild.channels.fetch(giveaway.channelId) as TextChannel;
    if (!channel) return;
    
    // Select winners
    const winnerIds = await selectWinners(giveawayId, giveaway.winnerCount);
    
    // Update message
    await updateGiveawayMessage(client, giveawayId);
    
    // Announce winners
    if (winnerIds.length === 0) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎉 Giveaway Ended')
            .setColor(0xFF0000)
            .setDescription(`No valid entries for **${giveaway.prize}**`)
        ]
      });
    } else {
      const winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');
      await channel.send({
        content: `Congratulations ${winnerMentions}!`,
        embeds: [
          new EmbedBuilder()
            .setTitle('🎉 Giveaway Ended')
            .setColor(0x00FF00)
            .setDescription(`Congratulations to the winner(s) of **${giveaway.prize}**!\n\n${winnerMentions}`)
        ]
      });
    }
  } catch (error) {
    console.error(`Error ending giveaway: ${error}`);
  }
}

/**
 * Reroll winners for a giveaway
 */
async function rerollGiveaway(client: Client, giveawayId: number, count = 1): Promise<string[]> {
  try {
    // Get giveaway data
    const giveaway = await storage.getGiveaway(giveawayId);
    if (!giveaway || !giveaway.hasEnded) return [];
    
    // Get channel
    const guild = client.guilds.cache.get(giveaway.serverId);
    if (!guild) return [];
    
    const channel = await guild.channels.fetch(giveaway.channelId) as TextChannel;
    if (!channel) return [];
    
    // Get winners
    const winnerIds = await selectWinners(giveawayId, count);
    
    // Announce new winners
    if (winnerIds.length > 0) {
      const winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');
      await channel.send({
        content: `Congratulations ${winnerMentions}!`,
        embeds: [
          new EmbedBuilder()
            .setTitle('🎉 Giveaway Rerolled')
            .setColor(0x00FF00)
            .setDescription(`New winner(s) for **${giveaway.prize}**:\n\n${winnerMentions}`)
        ]
      });
    } else {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎉 Giveaway Reroll')
            .setColor(0xFF0000)
            .setDescription(`Could not find any valid new winners for **${giveaway.prize}**`)
        ]
      });
    }
    
    return winnerIds;
  } catch (error) {
    console.error(`Error rerolling giveaway: ${error}`);
    return [];
  }
}

/**
 * Check if a member meets the role requirements for a giveaway
 */
function meetsRoleRequirements(member: GuildMember, requiredRoles: Role[]): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  return requiredRoles.some(role => member.roles.cache.has(role.id));
}

// Giveaway Commands
export const giveawayCommands: Command[] = [
  {
    name: 'gcreate',
    aliases: ['gcreategiveaway'],
    description: 'Create a new giveaway',
    usage: '+gcreate <channel> <duration> <prize> [winners] [required-role]',
    category: CommandCategory.GIVEAWAY,
    cooldown: 10,
    requiredPermissions: ['ManageGuild'],
    execute: async (message, args, client) => {
      // Check if enough arguments provided
      if (args.length < 3) {
        return message.reply('Usage: `+gcreate <channel> <duration> <prize> [winners] [required-role]`');
      }
      
      // Get channel
      const channelArg = args[0].replace(/[<#>]/g, '');
      const channel = message.guild?.channels.cache.get(channelArg) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        return message.reply('Please provide a valid text channel!');
      }
      
      // Get duration
      const durationArg = args[1];
      const durationMs = parseDuration(durationArg);
      if (!durationMs) {
        return message.reply('Please provide a valid duration (e.g. 1d, 12h, 30m)');
      }
      
      // Calculate end time
      const endTime = new Date(Date.now() + durationMs);
      
      // Get prize
      // Find winner count if specified, otherwise use default
      let winnerCount = 1;
      let roleId: string | null = null;
      let prizeEndIndex = args.length;
      
      if (args.length > 3) {
        // Check for winner count (numeric value)
        const possibleWinnerCount = parseInt(args[args.length - 1]);
        if (args[args.length - 1].startsWith('<@&')) {
          // Last argument is a role
          roleId = args[args.length - 1].replace(/[<@&>]/g, '');
          prizeEndIndex = args.length - 1;
        } else if (!isNaN(possibleWinnerCount)) {
          // Last argument is a number
          winnerCount = Math.max(1, Math.min(10, possibleWinnerCount));
          prizeEndIndex = args.length - 1;
          
          // Check if second-to-last argument is a role
          if (args.length > 4 && args[args.length - 2].startsWith('<@&')) {
            roleId = args[args.length - 2].replace(/[<@&>]/g, '');
            prizeEndIndex = args.length - 2;
          }
        }
      }
      
      const prize = args.slice(2, prizeEndIndex).join(' ');
      if (!prize) {
        return message.reply('Please provide a prize!');
      }
      
      try {
        // Send initial message
        const embed = new EmbedBuilder()
          .setTitle(`🎉 Giveaway: ${prize}`)
          .setColor(0x5865F2)
          .setDescription(`React with the button below to enter!\n\n**Ends:** ${formatTimeLeft(endTime)}\n**Winners:** ${winnerCount}\n**Entries:** 0`)
          .setFooter({ text: `Giveaway • Ends at` })
          .setTimestamp(endTime);
        
        // Add role requirement if present
        if (roleId) {
          const role = await message.guild?.roles.fetch(roleId);
          if (role) {
            embed.addFields({ name: 'Role Requirement', value: `You need the ${role.name} role to enter!` });
          }
        }
        
        // Create button row
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`giveaway_enter_0`) // Will be updated once we have the ID
            .setLabel('🎁 Enter Giveaway')
            .setStyle(ButtonStyle.Primary)
        );
        
        const giveawayMsg = await channel.send({ embeds: [embed], components: [row] });
        
        // Store in database
        const giveaway = await storage.createGiveaway({
          serverId: message.guild!.id,
          channelId: channel.id,
          messageId: giveawayMsg.id,
          prize,
          winnerCount,
          requiredRoleId: roleId,
          hostId: message.author.id,
          endTime
        });
        
        // Update the button with the correct ID
        const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`giveaway_enter_${giveaway.id}`)
            .setLabel('🎁 Enter Giveaway')
            .setStyle(ButtonStyle.Primary)
        );
        
        await giveawayMsg.edit({ components: [updatedRow] });
        
        // Set timeout to end giveaway
        setTimeout(() => {
          endGiveaway(client, giveaway.id);
        }, durationMs);
        
        return message.reply(`Giveaway created in ${channel}! It will end ${endTime.toLocaleString()}`);
      } catch (error) {
        console.error('Error creating giveaway:', error);
        return message.reply('There was an error creating the giveaway!');
      }
    }
  },
  {
    name: 'gend',
    description: 'End a giveaway early',
    usage: '+gend <giveaway-id>',
    category: CommandCategory.GIVEAWAY,
    cooldown: 5,
    requiredPermissions: ['ManageGuild'],
    execute: async (message, args, client) => {
      if (!args.length) {
        return message.reply('Please provide a giveaway ID!');
      }
      
      const giveawayId = parseInt(args[0]);
      if (isNaN(giveawayId)) {
        return message.reply('Please provide a valid giveaway ID!');
      }
      
      const giveaway = await storage.getGiveaway(giveawayId);
      if (!giveaway) {
        return message.reply('Giveaway not found!');
      }
      
      if (giveaway.hasEnded) {
        return message.reply('This giveaway has already ended!');
      }
      
      await endGiveaway(client, giveawayId);
      return message.reply('Giveaway ended!');
    }
  },
  {
    name: 'greroll',
    description: 'Reroll winners for a giveaway',
    usage: '+greroll <giveaway-id> [count]',
    category: CommandCategory.GIVEAWAY,
    cooldown: 5,
    requiredPermissions: ['ManageGuild'],
    execute: async (message, args, client) => {
      if (!args.length) {
        return message.reply('Please provide a giveaway ID!');
      }
      
      const giveawayId = parseInt(args[0]);
      if (isNaN(giveawayId)) {
        return message.reply('Please provide a valid giveaway ID!');
      }
      
      const giveaway = await storage.getGiveaway(giveawayId);
      if (!giveaway) {
        return message.reply('Giveaway not found!');
      }
      
      if (!giveaway.hasEnded) {
        return message.reply('This giveaway has not ended yet!');
      }
      
      let count = 1;
      if (args.length > 1) {
        const possibleCount = parseInt(args[1]);
        if (!isNaN(possibleCount)) {
          count = Math.max(1, Math.min(10, possibleCount));
        }
      }
      
      const winners = await rerollGiveaway(client, giveawayId, count);
      if (winners.length === 0) {
        return message.reply('Could not find any new valid winners!');
      }
      
      return message.reply(`Rerolled ${winners.length} winner(s)!`);
    }
  }
];

/**
 * Handle button click for giveaway entry
 */
export async function handleGiveawayButtonClick(interaction: ButtonInteraction, giveawayId: number) {
  try {
    // Get giveaway data
    const giveaway = await storage.getGiveaway(giveawayId);
    if (!giveaway) {
      return await interaction.reply({ content: 'This giveaway no longer exists!', ephemeral: true });
    }
    
    if (giveaway.hasEnded) {
      return await interaction.reply({ content: 'This giveaway has already ended!', ephemeral: true });
    }
    
    // Check if user already entered
    const existingEntry = await storage.getGiveawayEntry(giveawayId, interaction.user.id);
    if (existingEntry) {
      await storage.deleteGiveawayEntry(giveawayId, interaction.user.id);
      await interaction.reply({ content: 'Your entry has been removed!', ephemeral: true });
      
      // Update message
      await updateGiveawayMessage(interaction.client, giveawayId);
      return;
    }
    
    // Check role requirement if any
    if (giveaway.requiredRoleId) {
      const member = interaction.member as GuildMember;
      if (!member.roles.cache.has(giveaway.requiredRoleId)) {
        const role = await interaction.guild?.roles.fetch(giveaway.requiredRoleId);
        return await interaction.reply({ 
          content: `You need the ${role ? role.name : 'required'} role to enter this giveaway!`, 
          ephemeral: true 
        });
      }
    }
    
    // Add entry
    await storage.createGiveawayEntry({
      giveawayId,
      userId: interaction.user.id,
      username: interaction.user.tag
    });
    
    await interaction.reply({ content: 'You have entered the giveaway! Good luck! 🍀', ephemeral: true });
    
    // Update message
    await updateGiveawayMessage(interaction.client, giveawayId);
  } catch (error) {
    console.error(`Error handling giveaway button: ${error}`);
    await interaction.reply({ content: 'There was an error processing your entry!', ephemeral: true });
  }
}

/**
 * Initialize active giveaways
 */
export async function initializeGiveaways(client: Client) {
  try {
    // Get all active giveaways
    const activeGiveaways = (await storage.getServers())
      .map(server => storage.getActiveGiveaways(server.id))
      .flat();
    
    console.log('[Giveaways] Initialized all active giveaways');
    
    // Process each giveaway
    for (const giveawayPromise of activeGiveaways) {
      const giveaways = await giveawayPromise;
      for (const giveaway of giveaways) {
        try {
          // Update message
          await updateGiveawayMessage(client, giveaway.id);
          
          // Calculate time until end
          const timeUntilEnd = giveaway.endTime.getTime() - Date.now();
          
          // If it's already past end time, end it now
          if (timeUntilEnd <= 0) {
            await endGiveaway(client, giveaway.id);
          } else {
            // Otherwise set timeout to end it at the right time
            setTimeout(() => {
              endGiveaway(client, giveaway.id);
            }, timeUntilEnd);
          }
        } catch (error) {
          console.error(`Error processing giveaway ${giveaway.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error initializing giveaways:', error);
  }
}