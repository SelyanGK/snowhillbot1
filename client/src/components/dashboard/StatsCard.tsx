import { ReactNode } from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  color: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, color }) => {
  return (
    <div className="bg-[#2F3136] p-4 rounded-lg border border-gray-700">
      <div className="flex items-center">
        <div className={`w-10 h-10 rounded-full ${color} bg-opacity-20 flex items-center justify-center ${color.replace('bg-', 'text-')}`}>
          {icon}
        </div>
        <div className="ml-3">
          <div className="text-sm text-gray-400">{title}</div>
          <div className="text-xl font-bold text-white">{value}</div>
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
