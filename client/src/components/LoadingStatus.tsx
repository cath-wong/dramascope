import React from 'react';
import { useData } from '@/contexts/DataContext';
import { CheckCircle2, AlertCircle, FileWarning, Loader2, RefreshCw, Database } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function LoadingStatus() {
  const { status, lines, speeches, errors } = useData();

  const isLinesLoading = status.lines === 'loading' || status.lines === 'idle';
  const isSpeechesLoading = status.speeches === 'loading' || status.speeches === 'idle';
  const isLoading = isLinesLoading || isSpeechesLoading;

  const isLinesMissing = status.lines === 'missing';
  const isSpeechesMissing = status.speeches === 'missing';
  const isMissing = isLinesMissing || isSpeechesMissing;

  const hasErrors = status.lines === 'error' || status.speeches === 'error';
  
  const isLoaded = status.lines === 'loaded' && status.speeches === 'loaded';
  const hasData = lines.length > 0 && speeches.length > 0;

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-soft border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-primary/10 via-primary/30 to-primary/10" />
      <CardHeader className="pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-primary/5 text-primary">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-xl font-display">Data Corpus Status</CardTitle>
            <CardDescription className="mt-1">Initializing dataset from public assets</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* LOADING STATE */}
        {isLoading && !isMissing && !hasErrors && (
          <div className="flex items-center p-4 rounded-xl bg-secondary/50 border border-secondary text-secondary-foreground animate-pulse">
            <Loader2 className="w-5 h-5 mr-3 animate-spin text-primary" />
            <span className="font-medium">Loading dataset files...</span>
          </div>
        )}

        {/* MISSING FILES (404) STATE */}
        {isMissing && (
          <div className="flex flex-col p-5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200">
            <div className="flex items-center font-medium mb-2">
              <FileWarning className="w-5 h-5 mr-2 text-amber-500" />
              Dataset Files Missing
            </div>
            <p className="text-sm opacity-90 ml-7">
              Upload <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded text-xs">corpus_lines_real.csv</code> and <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded text-xs">corpus_speeches_real.csv</code> to the <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded text-xs">/public</code> directory, then refresh the page.
            </p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 ml-7 inline-flex items-center text-sm font-medium px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg transition-colors w-fit"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Page
            </button>
          </div>
        )}

        {/* ERROR STATE */}
        {hasErrors && (
          <div className="space-y-3">
            {errors.map((error, idx) => (
              <div key={idx} className="flex flex-col p-5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive dark:text-red-300">
                <div className="flex items-center font-medium mb-2">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Error Loading {error.file}
                </div>
                <div className="ml-7 space-y-2 text-sm opacity-90">
                  <p><strong>Message:</strong> {error.message}</p>
                  <p className="truncate"><strong>Attempted URL:</strong> <span className="font-mono text-xs">{error.url}</span></p>
                  {error.preview && (
                    <div className="mt-2 p-3 bg-background/50 rounded-md border border-destructive/10">
                      <p className="text-xs font-semibold mb-1 uppercase tracking-wider opacity-70">Response Preview (First 200 chars)</p>
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all opacity-80">{error.preview}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LOADED STATE */}
        {isLoaded && hasData && (
          <div className="flex flex-col p-5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-800 dark:text-green-300">
            <div className="flex items-center font-medium mb-3 text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Corpus loaded successfully
            </div>
            <div className="ml-7 flex flex-wrap gap-4">
              <div className="flex flex-col bg-background/50 px-4 py-2 rounded-lg border border-green-500/10">
                <span className="text-xs font-medium uppercase tracking-wider opacity-70 mb-1">Lines</span>
                <span className="text-xl font-display font-semibold tabular-nums">{lines.length.toLocaleString()}</span>
              </div>
              <div className="flex flex-col bg-background/50 px-4 py-2 rounded-lg border border-green-500/10">
                <span className="text-xs font-medium uppercase tracking-wider opacity-70 mb-1">Speeches</span>
                <span className="text-xl font-display font-semibold tabular-nums">{speeches.length.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Edge case: loaded but 0 rows */}
        {isLoaded && !hasData && (
          <div className="flex items-center p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200">
            <AlertCircle className="w-5 h-5 mr-3 text-amber-500" />
            <span className="text-sm font-medium">Files loaded, but no valid rows were found. Please check the CSV contents.</span>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
