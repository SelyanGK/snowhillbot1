import { Settings, Menu, Check } from "lucide-react";

interface HeaderProps {
  title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <header className="bg-[#2F3136] sticky top-0 z-10 border-b border-gray-700">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center">
          <button className="md:hidden text-white mr-4">
            <Menu />
          </button>
          <h2 className="text-white font-heading font-bold text-lg">{title}</h2>
        </div>
        <div className="flex items-center">
          <a href="#" className="p-2 hover:bg-[#36393F] rounded-md transition">
            <Settings className="text-[#7289DA]" />
          </a>
          <div className="ml-4 flex items-center">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
              <Check className="w-4 h-4" />
            </div>
            <span className="ml-2 text-white">Online</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
