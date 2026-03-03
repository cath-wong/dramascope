import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataProvider } from "@/contexts/DataContext";
import { UIProvider } from "@/contexts/UIContext";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Browser from "@/pages/Browser";
import Analysis from "@/pages/Analysis";
import Docs from "@/pages/Docs";

function Router() {
  return (
    <Switch>
      <Route path="/"><Redirect to="/dashboard" /></Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/browser" component={Browser} />
      <Route path="/analysis" component={Analysis} />
      <Route path="/docs" component={Docs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DataProvider>
        <UIProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </UIProvider>
      </DataProvider>
    </QueryClientProvider>
  );
}

export default App;
