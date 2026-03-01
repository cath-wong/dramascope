import React from "react";
import { Sidebar } from "@/components/Sidebar";
import { LoadingStatus } from "@/components/LoadingStatus";
import { ScopeSummary } from "@/components/ScopeSummary";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, ChevronRight } from "lucide-react";

interface MainLayoutProps {
  children: React.ReactNode;
  title: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, title }) => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center justify-between px-6 bg-card shrink-0">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-muted-foreground text-sm">App</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            <h1 className="font-semibold text-sm truncate">{title}</h1>
            <div className="ml-4 scale-75 origin-left">
              <LoadingStatus />
            </div>
          </div>
        </header>
        
        <div className="px-6 py-4 shrink-0 bg-muted/5">
          <ScopeSummary />
        </div>

        <main className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar">
          {children}
        </main>
      </div>

      <aside className="w-64 border-l bg-muted/20 p-6 shrink-0 hidden xl:flex flex-col gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Dataset</span>
          </div>
          <Card className="border-dashed bg-transparent shadow-none">
            <CardContent className="p-6 text-[10px] text-center text-muted-foreground leading-relaxed">
              Drag and drop CSV files here or click to browse.
              <p className="mt-3 opacity-50 italic">Storage integration coming in Step 4</p>
            </CardContent>
          </Card>
        </div>
      </aside>
    </div>
  );
};
