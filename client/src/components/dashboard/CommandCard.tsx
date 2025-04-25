import { Command } from "@/lib/types";

interface CommandCardProps {
  command: Command;
}

const CommandCard: React.FC<CommandCardProps> = ({ command }) => {
  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'fun':
        return 'bg-[#5865F2] bg-opacity-20 text-[#5865F2]';
      case 'moderation':
        return 'bg-[#ED4245] bg-opacity-20 text-[#ED4245]';
      case 'utility':
        return 'bg-[#57F287] bg-opacity-20 text-[#57F287]';
      case 'antiping':
        return 'bg-[#FEE75C] bg-opacity-20 text-[#FEE75C]';
      default:
        return 'bg-gray-500 bg-opacity-20 text-gray-500';
    }
  };

  const getIconClass = (category: string) => {
    switch (category.toLowerCase()) {
      case 'fun':
        return 'laugh';
      case 'moderation':
        return 'shield-alert';
      case 'utility':
        return 'tool';
      case 'antiping':
        return 'bell-off';
      default:
        return 'command';
    }
  };

  const categoryColor = getCategoryColor(command.category);
  const iconClass = getIconClass(command.category);
  
  return (
    <div className={`bg-[#2F3136] rounded-lg border border-gray-700 overflow-hidden hover:border-${command.category === 'MODERATION' ? '[#ED4245]' : command.category === 'UTILITY' ? '[#57F287]' : command.category === 'ANTIPING' ? '[#FEE75C]' : '[#5865F2]'} transition`}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full ${categoryColor} flex items-center justify-center text-sm`}>
              <i className={`fas fa-${iconClass}`}></i>
            </div>
            <h4 className="text-white font-medium ml-2">!{command.name}</h4>
          </div>
          <span className={`text-xs px-2 py-1 ${categoryColor} rounded-full`}>
            {command.category.charAt(0) + command.category.slice(1).toLowerCase()}
          </span>
        </div>
        <p className="mt-3 text-sm">{command.description}</p>
        <div className="mt-3 bg-[#36393F] p-2 rounded text-sm font-mono">
          {command.usage}
        </div>
        <div className="mt-3 flex justify-between text-xs text-gray-400">
          <span>Cooldown: {command.cooldown}s</span>
          <span>Permission: {command.requiredPermissions && command.requiredPermissions.length ? command.requiredPermissions.join(', ') : 'Everyone'}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandCard;
