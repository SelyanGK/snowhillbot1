import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface ActivityLog {
  id: number;
  command: string;
  username: string;
  serverName: string;
  timestamp: string;
}

const ActivityTable: React.FC = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  // Simulated data for the activity table
  const mockActivities: ActivityLog[] = [
    {
      id: 1,
      command: "!ban",
      username: "Moderator#1234",
      serverName: "Snowhill Community",
      timestamp: "2 minutes ago"
    },
    {
      id: 2,
      command: "!userinfo",
      username: "User#5678",
      serverName: "Snowhill Community",
      timestamp: "15 minutes ago"
    },
    {
      id: 3,
      command: "!joke",
      username: "SomeUser#9012",
      serverName: "Gaming Society",
      timestamp: "28 minutes ago"
    },
    {
      id: 4,
      command: "!antipingconfig",
      username: "Admin#3456",
      serverName: "Tech Hub",
      timestamp: "45 minutes ago"
    },
    {
      id: 5,
      command: "!clear",
      username: "Owner#7890",
      serverName: "Snowhill Community",
      timestamp: "1 hour ago"
    }
  ];

  // Fetch activity logs
  const { isLoading } = useQuery({
    queryKey: ['/api/activity-logs'],
    onSuccess: (data) => {
      if (data && Array.isArray(data)) {
        setActivities(data);
      } else {
        // If no data from API, use mock data for demonstration
        setActivities(mockActivities);
      }
    },
    onError: () => {
      // Use mock data on error
      setActivities(mockActivities);
    }
  });

  const getCommandColor = (command: string) => {
    if (command.startsWith('!ban') || command.startsWith('!kick') || command.startsWith('!clear')) {
      return "text-[#ED4245]";
    } else if (command.startsWith('!userinfo') || command.startsWith('!server')) {
      return "text-[#57F287]";
    } else if (command.startsWith('!antiping')) {
      return "text-[#FEE75C]";
    } else {
      return "text-[#5865F2]";
    }
  };

  const getUserInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  const getUserColor = (username: string) => {
    if (username.startsWith('Moderator')) {
      return "bg-blue-500";
    } else if (username.startsWith('Admin')) {
      return "bg-yellow-500";
    } else if (username.startsWith('Owner')) {
      return "bg-red-500";
    } else if (username.startsWith('User')) {
      return "bg-green-500";
    } else {
      return "bg-purple-500";
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center">Loading activity logs...</div>;
  }

  return (
    <table className="min-w-full">
      <thead className="bg-[#36393F] border-b border-gray-700">
        <tr>
          <th className="py-3 px-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Command</th>
          <th className="py-3 px-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
          <th className="py-3 px-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Server</th>
          <th className="py-3 px-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Time</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-700">
        {activities.map((activity) => (
          <tr key={activity.id} className="hover:bg-[#36393F] transition">
            <td className="px-4 py-3 whitespace-nowrap">
              <div className="flex items-center">
                <span className={getCommandColor(activity.command)}>{activity.command}</span>
              </div>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
              <div className="flex items-center">
                <div className={`h-6 w-6 rounded-full ${getUserColor(activity.username)} flex items-center justify-center text-xs text-white`}>
                  {getUserInitial(activity.username)}
                </div>
                <span className="ml-2">{activity.username}</span>
              </div>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">{activity.serverName}</td>
            <td className="px-4 py-3 whitespace-nowrap text-gray-400">{activity.timestamp}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default ActivityTable;
