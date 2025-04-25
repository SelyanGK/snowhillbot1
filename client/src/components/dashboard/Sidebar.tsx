import { Link } from "wouter";
import { 
  Home, 
  Terminal, 
  Laugh, 
  ShieldAlert, 
  Wrench, 
  BellOff, 
  HelpCircle
} from "lucide-react";

interface SidebarProps {
  activeRoute: string;
}

const Sidebar: React.FC<SidebarProps> = ({ activeRoute }) => {
  return (
    <div className="bg-[#202225] w-full md:w-64 flex-shrink-0 md:h-screen overflow-y-auto">
      <div className="p-4 flex items-center">
        <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.17 2.06L16.31 3.65L12.5 2L8.69 3.65L4.83 2.06L2 5.28V20.28L4.83 19.31L8.69 20.9L12.5 19.25L16.31 20.9L20.17 19.31L22 20.28V5.28L20.17 2.06Z"/>
            <path d="M12 2V19.25"/>
            <path d="M2 5.28L22 5.28"/>
          </svg>
        </div>
        <h1 className="ml-2 font-heading font-bold text-white text-xl">Snowhill Bot</h1>
      </div>
      
      <div className="border-t border-gray-700 my-2"></div>
      
      <nav>
        <ul className="px-2">
          <li className="font-medium text-sm uppercase text-gray-400 py-2 px-2">Bot Overview</li>
          
          <li className="mt-1">
            <Link 
              href="/" 
              className={`flex items-center p-2 rounded hover:bg-[#36393F] transition ${activeRoute === "/" ? "bg-[#36393F]" : ""}`}
            >
              <Home className="w-5 h-5" />
              <span className="ml-2">Dashboard</span>
            </Link>
          </li>
          
          <li className="mt-1">
            <Link 
              href="/commands" 
              className={`flex items-center p-2 rounded hover:bg-[#36393F] transition ${activeRoute === "/commands" ? "bg-[#36393F]" : ""}`}
            >
              <Terminal className="w-5 h-5" />
              <span className="ml-2">Commands</span>
            </Link>
          </li>
          
          <li className="font-medium text-sm uppercase text-gray-400 py-2 px-2 mt-4">Command Categories</li>
          
          <li className="mt-1">
            <Link 
              href="/commands?category=fun" 
              className={`flex items-center p-2 rounded hover:bg-[#36393F] transition ${activeRoute === "/commands?category=fun" ? "bg-[#36393F]" : ""}`}
            >
              <Laugh className="w-5 h-5" />
              <span className="ml-2">Fun</span>
              <span className="ml-auto bg-[#36393F] px-2 py-1 rounded text-xs">15</span>
            </Link>
          </li>
          
          <li className="mt-1">
            <Link 
              href="/commands?category=moderation" 
              className={`flex items-center p-2 rounded hover:bg-[#36393F] transition ${activeRoute === "/commands?category=moderation" ? "bg-[#36393F]" : ""}`}
            >
              <ShieldAlert className="w-5 h-5" />
              <span className="ml-2">Moderation</span>
              <span className="ml-auto bg-[#36393F] px-2 py-1 rounded text-xs">12</span>
            </Link>
          </li>
          
          <li className="mt-1">
            <Link 
              href="/commands?category=utility" 
              className={`flex items-center p-2 rounded hover:bg-[#36393F] transition ${activeRoute === "/commands?category=utility" ? "bg-[#36393F]" : ""}`}
            >
              <Wrench className="w-5 h-5" />
              <span className="ml-2">Utility</span>
              <span className="ml-auto bg-[#36393F] px-2 py-1 rounded text-xs">15</span>
            </Link>
          </li>
          
          <li className="mt-1">
            <Link 
              href="/commands?category=antiping" 
              className={`flex items-center p-2 rounded hover:bg-[#36393F] transition ${activeRoute === "/commands?category=antiping" ? "bg-[#36393F]" : ""}`}
            >
              <BellOff className="w-5 h-5" />
              <span className="ml-2">Anti-Ping</span>
              <span className="ml-auto bg-[#36393F] px-2 py-1 rounded text-xs">8</span>
            </Link>
          </li>
          
          <li className="font-medium text-sm uppercase text-gray-400 py-2 px-2 mt-4">Support</li>
          
          <li className="mt-1">
            <Link 
              href="/help" 
              className={`flex items-center p-2 rounded hover:bg-[#36393F] transition ${activeRoute === "/help" ? "bg-[#36393F]" : ""}`}
            >
              <HelpCircle className="w-5 h-5" />
              <span className="ml-2">Help</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
