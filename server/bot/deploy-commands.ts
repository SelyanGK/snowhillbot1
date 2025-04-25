import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { getAllCommands } from './commands';
import { CommandCategory } from '@shared/schema';

/**
 * Converts text commands to slash commands and registers them with Discord
 */
export async function deploySlashCommands(clientId: string, token: string) {
  try {
    const commands = await getAllCommands();
    
    // Create slash command builders for each command
    const slashCommands = commands.map(cmd => {
      const builder = new SlashCommandBuilder()
        .setName(cmd.name.toLowerCase())
        .setDescription(cmd.description);
      
      // For commands that need arguments, add appropriate options
      // We'll have to manually define some common options based on the command usage
      
      if (cmd.usage.includes('<user>') || cmd.usage.includes('[user]') || 
          cmd.usage.includes('<@user>') || cmd.usage.includes('[@user]')) {
        builder.addUserOption(option => 
          option.setName('user')
            .setDescription('The user to target')
            .setRequired(cmd.usage.includes('<user>') || cmd.usage.includes('<@user>')));
      }
      
      if (cmd.usage.includes('<role>') || cmd.usage.includes('[role]')) {
        builder.addRoleOption(option => 
          option.setName('role')
            .setDescription('The role to target')
            .setRequired(cmd.usage.includes('<role>')));
      }
      
      if (cmd.usage.includes('<channel>') || cmd.usage.includes('[channel]')) {
        builder.addChannelOption(option => 
          option.setName('channel')
            .setDescription('The channel to target')
            .setRequired(cmd.usage.includes('<channel>')));
      }
      
      if (cmd.usage.includes('<reason>') || cmd.usage.includes('[reason]')) {
        builder.addStringOption(option => 
          option.setName('reason')
            .setDescription('The reason for this action')
            .setRequired(cmd.usage.includes('<reason>')));
      }
      
      if (cmd.usage.includes('<message>') || cmd.usage.includes('[message]')) {
        builder.addStringOption(option => 
          option.setName('message')
            .setDescription('The message content')
            .setRequired(cmd.usage.includes('<message>')));
      }
      
      if (cmd.usage.includes('<duration>') || cmd.usage.includes('[duration]')) {
        builder.addStringOption(option => 
          option.setName('duration')
            .setDescription('The duration (e.g. 10m, 1h, 1d)')
            .setRequired(cmd.usage.includes('<duration>')));
      }
      
      if (cmd.usage.includes('<amount>') || cmd.usage.includes('[amount]')) {
        builder.addIntegerOption(option => 
          option.setName('amount')
            .setDescription('The amount')
            .setRequired(cmd.usage.includes('<amount>')));
      }
      
      // Add category-specific parameters
      switch(cmd.category) {
        case CommandCategory.MODERATION:
          if (cmd.name === 'ban' || cmd.name === 'kick' || cmd.name === 'timeout') {
            // Add user option if not already added
            let hasUserOption = false;
            let hasDurationOption = false;
            let hasReasonOption = false;
            
            // Check for existing options
            builder.options.forEach(opt => {
              if ((opt as any).name === 'user') hasUserOption = true;
              if ((opt as any).name === 'duration') hasDurationOption = true;
              if ((opt as any).name === 'reason') hasReasonOption = true;
            });
            
            // Add user option if not already added
            if (!hasUserOption) {
              builder.addUserOption(option => 
                option.setName('user')
                  .setDescription('The user to perform this action on')
                  .setRequired(true));
            }
            
            // Add duration option for these commands
            if (!hasDurationOption) {
              builder.addStringOption(option => 
                option.setName('duration')
                  .setDescription('The duration (e.g. 1h, 1d, 7d)'));
            }
            
            // Add reason option if not already added
            if (!hasReasonOption) {
              builder.addStringOption(option => 
                option.setName('reason')
                  .setDescription('The reason for this action'));
            }
          }
          break;
          
        case CommandCategory.UTILITY:
          if (cmd.name === 'poll') {
            builder.addStringOption(option => 
              option.setName('options')
                .setDescription('Options separated by | symbol')
                .setRequired(true));
          }
          break;
          
        case CommandCategory.FUN:
          if (cmd.name === '8ball') {
            builder.addStringOption(option => 
              option.setName('question')
                .setDescription('The question to ask the magic 8-ball')
                .setRequired(true));
          }
          break;
        
        case CommandCategory.GIVEAWAY:
          if (cmd.name === 'gcreate' || cmd.name === 'gcreategiveaway') {
            // Check for existing options
            let hasChannelOption = false;
            let hasDurationOption = false;
            let hasPrizeOption = false;
            let hasWinnersOption = false;
            let hasRequiredRoleOption = false;
            
            // Check for existing options
            builder.options.forEach(opt => {
              if ((opt as any).name === 'channel' || (opt as any).name === 'gchannel') hasChannelOption = true;
              if ((opt as any).name === 'duration' || (opt as any).name === 'gduration') hasDurationOption = true;
              if ((opt as any).name === 'prize') hasPrizeOption = true;
              if ((opt as any).name === 'winners') hasWinnersOption = true;
              if ((opt as any).name === 'required-role') hasRequiredRoleOption = true;
            });
            
            // Add channel option if not already added
            if (!hasChannelOption) {
              builder.addChannelOption(option =>
                option.setName('channel')  // Using 'channel' instead of 'gchannel' for consistency
                  .setDescription('The channel to post the giveaway in')
                  .setRequired(true));
            }
                
            // Add duration option if not already added
            if (!hasDurationOption) {
              builder.addStringOption(option =>
                option.setName('duration')  // Using 'duration' instead of 'gduration' for consistency
                  .setDescription('The duration of the giveaway (e.g. 1h, 1d, 1w)')
                  .setRequired(true));
            }
                
            // Add prize option if not already added
            if (!hasPrizeOption) {
              builder.addStringOption(option =>
                option.setName('prize')
                  .setDescription('The prize for the giveaway')
                  .setRequired(true));
            }
                
            // Add winners option if not already added
            if (!hasWinnersOption) {
              builder.addIntegerOption(option =>
                option.setName('winners')
                  .setDescription('The number of winners')
                  .setRequired(false)
                  .setMinValue(1)
                  .setMaxValue(10));
            }
                
            // Add required-role option if not already added
            if (!hasRequiredRoleOption) {
              builder.addRoleOption(option =>
                option.setName('required-role')
                  .setDescription('Role required to enter the giveaway')
                  .setRequired(false));
            }
          }
          
          if (cmd.name === 'gend') {
            // Check for existing options
            let hasGiveawayIdOption = false;
            
            // Check options
            builder.options.forEach(opt => {
              if ((opt as any).name === 'giveaway-id') hasGiveawayIdOption = true;
            });
            
            // Add giveaway-id option if not already added
            if (!hasGiveawayIdOption) {
              builder.addIntegerOption(option =>
                option.setName('giveaway-id')
                  .setDescription('The ID of the giveaway to end')
                  .setRequired(true));
            }
          }
          
          if (cmd.name === 'greroll') {
            // Check for existing options
            let hasGiveawayIdOption = false;
            let hasCountOption = false;
            
            // Check options
            builder.options.forEach(opt => {
              if ((opt as any).name === 'giveaway-id') hasGiveawayIdOption = true;
              if ((opt as any).name === 'count') hasCountOption = true;
            });
            
            // Add giveaway-id option if not already added
            if (!hasGiveawayIdOption) {
              builder.addIntegerOption(option =>
                option.setName('giveaway-id')
                  .setDescription('The ID of the giveaway to reroll')
                  .setRequired(true));
            }
                
            // Add count option if not already added
            if (!hasCountOption) {
              builder.addIntegerOption(option =>
                option.setName('count')
                  .setDescription('Number of winners to reroll')
                  .setRequired(false)
                  .setMinValue(1)
                  .setMaxValue(10));
            }
          }
          break;
          
        case CommandCategory.ANTIPING:
          if (cmd.name === 'antiping') {
            builder.addSubcommand(subcommand =>
              subcommand
                .setName('enable')
                .setDescription('Enable anti-ping protection'));
            
            builder.addSubcommand(subcommand =>
              subcommand
                .setName('disable')
                .setDescription('Disable anti-ping protection'));
            
            builder.addSubcommand(subcommand =>
              subcommand
                .setName('set-bypass-role')
                .setDescription('Set role that can bypass anti-ping protection')
                .addRoleOption(option =>
                  option.setName('role')
                    .setDescription('The role that can bypass')
                    .setRequired(true)));
            
            builder.addSubcommand(subcommand =>
              subcommand
                .setName('set-protected-role')
                .setDescription('Set role that is protected from pings')
                .addRoleOption(option =>
                  option.setName('role')
                    .setDescription('The role to protect')
                    .setRequired(true)));
                    
            builder.addSubcommand(subcommand =>
              subcommand
                .setName('add-excluded-role')
                .setDescription('Add a role to the exclusion list')
                .addRoleOption(option =>
                  option.setName('role')
                    .setDescription('The role to exclude')
                    .setRequired(true)));
                    
            builder.addSubcommand(subcommand =>
              subcommand
                .setName('remove-excluded-role')
                .setDescription('Remove a role from the exclusion list')
                .addRoleOption(option =>
                  option.setName('role')
                    .setDescription('The role to remove')
                    .setRequired(true)));
                    
            builder.addSubcommand(subcommand =>
              subcommand
                .setName('settings')
                .setDescription('View the current anti-ping settings'));
          }
          break;
      }
      
      return builder;
    });
    
    // Prepare REST API client
    const rest = new REST({ version: '10' }).setToken(token);
    
    // Deploy commands
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: slashCommands.map(cmd => cmd.toJSON()) },
    );
    
    console.log('Successfully registered application commands.');
    
    return true;
  } catch (error) {
    console.error('Failed to deploy slash commands:', error);
    return false;
  }
}