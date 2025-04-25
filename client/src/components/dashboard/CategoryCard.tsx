import { Link } from "wouter";

interface CategoryCardProps {
  title: string;
  count: number;
  description: string;
  icon: React.ReactNode;
  color: string;
  link: string;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ 
  title, 
  count, 
  description, 
  icon, 
  color, 
  link 
}) => {
  const bgColor = `bg-${color}`;
  const textColor = `text-${color}`;
  const hoverColor = `hover:bg-opacity-30`;
  
  return (
    <div className="bg-[#36393F] p-4 rounded-lg">
      <div className="flex items-center">
        <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center text-white`}>
          {icon}
        </div>
        <div className="ml-3">
          <div className="font-bold text-white">{title}</div>
          <div className="text-sm text-gray-400">{count} commands</div>
        </div>
      </div>
      <div className="mt-3 text-sm">
        {description}
      </div>
      <Link href={link}>
        <a className={`mt-3 block w-full text-center py-1.5 rounded-md ${bgColor} bg-opacity-20 ${textColor} ${hoverColor} transition`}>
          View Commands
        </a>
      </Link>
    </div>
  );
};

export default CategoryCard;
