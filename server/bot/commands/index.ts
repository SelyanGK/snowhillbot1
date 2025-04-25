import { Collection } from 'discord.js';
import { funCommands } from './fun';
import { moderationCommands } from './moderation';
import { utilityCommands } from './utility';
import { antipingCommands } from './antiping';
import { Command } from '../utils';
import { CommandCategory } from '@shared/schema';

// Help command
const helpCommand: Command = {
  name: 'help',
  description: 'Shows information about available commands',
  usage: '!help [command]',
  category: CommandCategory.UTILITY,
  cooldown: 5,
  requiredPermissions: [],
  execute: async (message, args, client) => {
    const { commands } = client;
    const prefix = '!'; // Default prefix, ideally get from server settings

    // If no args, show all command categories
    if (!args.length) {
      const funCmds = commands.filter(cmd => cmd.category === CommandCategory.FUN);
      const modCmds = commands.filter(cmd => cmd.category === CommandCategory.MODERATION);
      const utilityCmds = commands.filter(cmd => cmd.category === CommandCategory.UTILITY);
      const antipingCmds = commands.filter(cmd => cmd.category === CommandCategory.ANTIPING);

      const embed = {
        color: 0x5865F2,
        title: '📚 Snowhill Bot Help',
        description: `Use \`${prefix}help [command]\` for detailed info about a command.\n\n**Available Command Categories:**`,
        fields: [
          {
            name: '🎮 Fun Commands',
            value: funCmds.map(cmd => `\`${cmd.name}\``).join(', ') || 'No commands available',
            inline: false
          },
          {
            name: '🛡️ Moderation Commands',
            value: modCmds.map(cmd => `\`${cmd.name}\``).join(', ') || 'No commands available',
            inline: false
          },
          {
            name: '🔧 Utility Commands', 
            value: utilityCmds.map(cmd => `\`${cmd.name}\``).join(', ') || 'No commands available',
            inline: false
          },
          {
            name: '🔕 Anti-Ping Commands',
            value: antipingCmds.map(cmd => `\`${cmd.name}\``).join(', ') || 'No commands available',
            inline: false
          }
        ],
        footer: {
          text: `Snowhill Bot • Total Commands: ${commands.size}`
        }
      };

      return message.reply({ embeds: [embed] });
    }

    // Show info about a specific command
    const commandName = args[0].toLowerCase();
    const command = commands.get(commandName) || 
                    commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) {
      return message.reply(`Command \`${commandName}\` not found. Use \`${prefix}help\` to see all commands.`);
    }

    const embed = {
      color: 0x5865F2,
      title: `Command: ${command.name}`,
      fields: [
        { name: 'Description', value: command.description || 'No description available', inline: false },
        { name: 'Usage', value: command.usage || `${prefix}${command.name}`, inline: false },
        { name: 'Category', value: command.category, inline: true },
        { name: 'Cooldown', value: `${command.cooldown || 0} seconds`, inline: true },
      ]
    };

    if (command.aliases && command.aliases.length) {
      embed.fields.push({ name: 'Aliases', value: command.aliases.join(', '), inline: true });
    }

    if (command.requiredPermissions && command.requiredPermissions.length) {
      embed.fields.push({ 
        name: 'Required Permissions', 
        value: command.requiredPermissions.join(', ') || 'None', 
        inline: true 
      });
    }

    return message.reply({ embeds: [embed] });
  }
};

// Load all commands function
export async function loadCommands(): Promise<Collection<string, Command>> {
  const commands = new Collection<string, Command>();
  
  // Add all commands from different categories
  const allCommands = [
    ...funCommands,
    ...moderationCommands,
    ...utilityCommands,
    ...antipingCommands,
    helpCommand // Add the help command
  ];

  // Add each command to the collection
  for (const command of allCommands) {
    commands.set(command.name, command);
  }

  return commands;
}

// Export all commands for frontend use
export function getAllCommands(): Command[] {
  return [
    ...funCommands,
    ...moderationCommands,
    ...utilityCommands,
    ...antipingCommands,
    helpCommand
  ];
}
