import React from 'react';
import { LoadingStatus } from '@/components/LoadingStatus';
import { FileText, Github } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-secondary/50 via-background to-background relative overflow-hidden">
      
      {/* Decorative background elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute top-1/4 -left-64 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="container max-w-5xl mx-auto px-4 py-24 relative z-10">
        
        {/* Header Section */}
        <header className="text-center mb-16 space-y-6">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white shadow-soft border border-border/50 mb-4">
            <FileText className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight text-foreground">
            Corpus <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">Explorer</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-sans leading-relaxed">
            A clean, minimal interface for parsing and analyzing your text corpus data entirely on the client-side.
          </p>
        </header>

        {/* Main Content Area */}
        <main className="animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out fill-mode-both delay-150">
          <LoadingStatus />
          
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Check the browser console to view detailed parsing logs.
            </p>
          </div>
        </main>
        
      </div>
    </div>
  );
}
