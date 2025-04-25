import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search } from "lucide-react";

import CommandCard from "@/components/dashboard/CommandCard";
import { Command, CommandCategory } from "@/lib/types";
import { getAllCommands } from "@/lib/commands";

const Commands = () => {
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [filteredCommands, setFilteredCommands] = useState<Command[]>([]);
  
  // Get category from URL if present
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1]);
    const category = params.get('category');
    if (category) {
      setSelectedCategory(category);
    }
  }, [location]);

  // Fetch commands
  const { data: commands, isLoading } = useQuery<Command[]>({
    queryKey: ['/api/commands'],
    queryFn: getAllCommands,
  });

  // Filter commands based on search and category
  useEffect(() => {
    if (!commands) return;
    
    let filtered = [...commands];
    
    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(cmd => 
        cmd.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(cmd => 
        cmd.name.toLowerCase().includes(query) || 
        cmd.description.toLowerCase().includes(query) ||
        (cmd.aliases && cmd.aliases.some(alias => alias.toLowerCase().includes(query)))
      );
    }
    
    setFilteredCommands(filtered);
  }, [commands, selectedCategory, searchQuery]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
  };

  return (
    <div className="p-4 md:p-6" id="commands">
      {/* Commands Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <h2 className="text-2xl font-heading font-bold text-white mb-4 md:mb-0">Commands</h2>
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search commands..." 
              className="bg-[#36393F] border border-gray-700 rounded-md py-2 pl-9 pr-4 w-full focus:outline-none focus:ring-2 focus:ring-[#5865F2]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="text-gray-400" size={18} />
            </div>
          </div>
          <select 
            className="bg-[#36393F] border border-gray-700 rounded-md py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#5865F2]"
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="fun">Fun</option>
            <option value="moderation">Moderation</option>
            <option value="utility">Utility</option>
            <option value="antiping">Anti-Ping</option>
          </select>
        </div>
      </div>

      {/* Command Category Tabs */}
      <div className="border-b border-gray-700 mb-6">
        <nav className="flex space-x-4 overflow-x-auto pb-1">
          <a 
            href="#" 
            className={`px-3 py-2 ${selectedCategory === "all" ? "text-white font-medium border-b-2 border-[#5865F2]" : "text-gray-400 hover:text-white"}`}
            onClick={(e) => { e.preventDefault(); handleCategoryChange("all"); }}
          >
            All
          </a>
          <a 
            href="#" 
            className={`px-3 py-2 ${selectedCategory === "fun" ? "text-white font-medium border-b-2 border-[#5865F2]" : "text-gray-400 hover:text-white"}`}
            onClick={(e) => { e.preventDefault(); handleCategoryChange("fun"); }}
          >
            Fun
          </a>
          <a 
            href="#" 
            className={`px-3 py-2 ${selectedCategory === "moderation" ? "text-white font-medium border-b-2 border-[#5865F2]" : "text-gray-400 hover:text-white"}`}
            onClick={(e) => { e.preventDefault(); handleCategoryChange("moderation"); }}
          >
            Moderation
          </a>
          <a 
            href="#" 
            className={`px-3 py-2 ${selectedCategory === "utility" ? "text-white font-medium border-b-2 border-[#5865F2]" : "text-gray-400 hover:text-white"}`}
            onClick={(e) => { e.preventDefault(); handleCategoryChange("utility"); }}
          >
            Utility
          </a>
          <a 
            href="#" 
            className={`px-3 py-2 ${selectedCategory === "antiping" ? "text-white font-medium border-b-2 border-[#5865F2]" : "text-gray-400 hover:text-white"}`}
            onClick={(e) => { e.preventDefault(); handleCategoryChange("antiping"); }}
          >
            Anti-Ping
          </a>
        </nav>
      </div>

      {/* Command Grid */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#5865F2] border-r-transparent align-[-0.125em]"></div>
          <p className="mt-4 text-gray-400">Loading commands...</p>
        </div>
      ) : filteredCommands.length === 0 ? (
        <div className="text-center py-12">
          <h3 className="text-xl font-medium text-gray-400">No commands found</h3>
          <p className="mt-2 text-gray-500">Try adjusting your search or category filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCommands.map((command) => (
            <CommandCard key={command.name} command={command} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Commands;
