import { 
  Client, 
  Interaction, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ApplicationCommandOptionType,
  ChannelType
} from 'discord.js';
import { storage } from '../storage';
import { log } from '../vite';
import { incrementCommandsUsed, incrementModerationActions } from './index';
import { CommandCategory } from '@shared/schema';
import { performance } from 'perf_hooks';
import { handleGiveawayButtonClick } from './commands/giveaway';

export function setupSlashCommands(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      try {
        await handleSlashCommand(interaction);
      } catch (error) {
        console.error('Error handling slash command:', error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error executing this command.',
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: 'There was an error executing this command.',
            ephemeral: true
          });
        }
      }
      return;
    }
    
    if (interaction.isButton()) {
      const customId = interaction.customId;
      if (customId.startsWith('giveaway_enter_')) {
        const giveawayId = parseInt(customId.replace('giveaway_enter_', ''), 10);
        if (!isNaN(giveawayId)) {
          try {
            await handleGiveawayButtonClick(interaction, giveawayId);
          } catch (error) {
            console.error('Error handling giveaway button:', error);
            try {
              if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                  content: 'There was an error processing your request.',
                  ephemeral: true
                });
              } else {
                await interaction.reply({
                  content: 'There was an error processing your request.',
                  ephemeral: true
                });
              }
            } catch (replyError) {
              console.error('Error replying to interaction:', replyError);
            }
          }
        }
      }
      return;
    }
  });
}

async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const { client, commandName } = interaction;
  const command = client.commands.get(commandName);
  
  if (!command) {
    await interaction.reply({
      content: `Command /${commandName} not found.`,
      ephemeral: true
    });
    return;
  }
  
  // ... (existing permission and cooldown checks remain the same) ...

  await executeSlashCommand(interaction, command);
}

async function executeSlashCommand(interaction: ChatInputCommandInteraction, command: any) {
  if (command.name === 'slowmode') {
    await interaction.deferReply();
  }
  
  // ... (existing mockMessage and args setup remains the same) ...

  switch (command.category) {
    case CommandCategory.MODERATION:
      switch (command.name) {
        case 'slowmode':
          try {
            const seconds = interaction.options.getInteger('seconds', true);
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            // Validate input
            if (seconds < 0 || seconds > 21600) {
              await interaction.editReply('Slowmode must be between 0 and 21600 seconds (6 hours)');
              return;
            }

            if (!channel || !channel.isTextBased()) {
              await interaction.editReply('Invalid text channel specified');
              return;
            }

            // Execute the command
            await channel.setRateLimitPerUser(seconds);
            
            const successEmbed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setDescription(`✅ Set slowmode to ${seconds} seconds in ${channel.toString()}`);

            await interaction.editReply({ embeds: [successEmbed] });
          } catch (error) {
            console.error('Error setting slowmode:', error);
            await interaction.editReply('Failed to set slowmode. Please try again.');
          }
          break;

        // ... (other moderation commands remain the same) ...
      }
      break;

    // ... (other command categories remain the same) ...
  }
}

// ... (rest of the file remains the same) ...