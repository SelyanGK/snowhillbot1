import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Server, 
  User, 
  Terminal, 
  ShieldAlert, 
  Laugh, 
  Wrench, 
  BellOff, 
  Drill
} from "lucide-react";

import StatsCard from "@/components/dashboard/StatsCard";
import CategoryCard from "@/components/dashboard/CategoryCard";
import ActivityTable from "@/components/dashboard/ActivityTable";
import { BotStats } from "@/lib/types";

const Dashboard = () => {
  // Fetch bot stats
  const { data: stats, isLoading } = useQuery<BotStats>({
    queryKey: ['/api/bot/stats'],
  });

  const defaultStats = {
    serverCount: 120,
    userCount: 25430,
    commandsUsed: 45893,
    moderationActionsCount: 3642
  };

  const botStats = stats || defaultStats;
  
  return (
    <div className="p-4 md:p-6" id="dashboard">
      {/* Welcome Panel */}
      <div className="bg-[#2F3136] p-6 rounded-lg mb-6 border border-[#5865F2]">
        <div className="flex items-start">
          <div className="flex-1">
            <h1 className="text-2xl font-heading font-bold text-white">Welcome to Snowhill Bot</h1>
            <p className="mt-2">A powerful Discord bot with moderation, utility, fun commands, and anti-ping protection.</p>
            
            <div className="mt-4">
              <span className="inline-flex items-center px-3 py-1 bg-green-500 bg-opacity-20 text-green-400 rounded-full text-sm mr-2">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                Online
              </span>
              <span className="inline-flex items-center px-3 py-1 bg-[#5865F2] bg-opacity-20 text-[#5865F2] rounded-full text-sm">
                <span className="mr-1">50</span> Commands
              </span>
            </div>

            <div className="mt-4">
              <Link href="/commands">
                <a className="bg-[#5865F2] hover:bg-opacity-80 text-white py-2 px-4 rounded-md transition">
                  Get Started
                </a>
              </Link>
              <Link href="/commands">
                <a className="ml-2 bg-[#2F3136] hover:bg-opacity-80 border border-gray-600 text-white py-2 px-4 rounded-md transition">
                  View Commands
                </a>
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="w-24 h-24 bg-[#5865F2] rounded-full flex items-center justify-center text-white text-4xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.17 2.06L16.31 3.65L12.5 2L8.69 3.65L4.83 2.06L2 5.28V20.28L4.83 19.31L8.69 20.9L12.5 19.25L16.31 20.9L20.17 19.31L22 20.28V5.28L20.17 2.06Z"/>
                <path d="M12 2V19.25"/>
                <path d="M2 5.28L22 5.28"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard 
          title="Servers" 
          value={botStats.serverCount.toLocaleString()} 
          icon={<Server className="h-5 w-5" />} 
          color="bg-[#5865F2]" 
        />
        
        <StatsCard 
          title="Users" 
          value={botStats.userCount.toLocaleString()} 
          icon={<User className="h-5 w-5" />} 
          color="bg-[#57F287]" 
        />
        
        <StatsCard 
          title="Commands Used" 
          value={botStats.commandsUsed.toLocaleString()} 
          icon={<Terminal className="h-5 w-5" />} 
          color="bg-[#FEE75C]" 
        />
        
        <StatsCard 
          title="Mod Actions" 
          value={botStats.moderationActionsCount.toLocaleString()} 
          icon={<ShieldAlert className="h-5 w-5" />} 
          color="bg-[#ED4245]" 
        />
      </div>

      {/* Command Categories */}
      <div className="bg-[#2F3136] rounded-lg border border-gray-700 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-white font-bold">Command Categories</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <CategoryCard 
              title="Fun Commands"
              count={15}
              description="Games, jokes, memes, and more to entertain your server."
              icon={<Laugh className="h-5 w-5" />}
              color="[#5865F2]"
              link="/commands?category=fun"
            />
            
            <CategoryCard 
              title="Moderation"
              count={12}
              description="Keep your server safe with powerful moderation tools."
              icon={<ShieldAlert className="h-5 w-5" />}
              color="[#ED4245]"
              link="/commands?category=moderation"
            />
            
            <CategoryCard 
              title="Utility"
              count={15}
              description="Useful tools to manage and enhance your Discord experience."
              icon={<Drill className="h-5 w-5" />}
              color="[#57F287]"
              link="/commands?category=utility"
            />
            
            <CategoryCard 
              title="Anti-Ping"
              count={8}
              description="Advanced protection against unwanted mentions and pings."
              icon={<BellOff className="h-5 w-5" />}
              color="[#FEE75C]"
              link="/commands?category=antiping"
            />
          </div>
        </div>
      </div>
      
      {/* Recent Activity */}
      <div className="bg-[#2F3136] rounded-lg border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-white font-bold">Recent Activity</h3>
          <button className="text-[#7289DA] hover:underline text-sm">View All</button>
        </div>
        <div className="p-0">
          <ActivityTable />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
