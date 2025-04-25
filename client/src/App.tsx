import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Commands from "@/pages/Commands";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";

function Router() {
  const [location] = useLocation();
  
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#36393F] text-[#DCDDDE]">
      <Sidebar activeRoute={location} />
      
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <Header title={location === "/" ? "Dashboard" : "Commands"} />
        
        <Switch>
          <Route path="/" component={Dashboard}/>
          <Route path="/commands" component={Commands}/>
          {/* Fallback to 404 */}
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
