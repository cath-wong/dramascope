import React from 'react';
import { useData } from '@/contexts/DataContext';
import { CheckCircle2, AlertCircle, FileWarning, Loader2 } from 'lucide-react';

export function LoadingStatus() {
  const { status, lines, speeches, rowCounts, errors } = useData();

  const isLoading =
    status.shakespeareLines === 'loading' || status.shakespeareLines === 'idle' ||
    status.shakespeareSpeeches === 'loading' || status.shakespeareSpeeches === 'idle' ||
    status.earlyModernLines === 'loading' || status.earlyModernLines === 'idle' ||
    status.earlyModernSpeeches === 'loading' || status.earlyModernSpeeches === 'idle';

  const isMissing =
    status.shakespeareLines === 'missing' || status.shakespeareSpeeches === 'missing' ||
    status.earlyModernLines === 'missing' || status.earlyModernSpeeches === 'missing';

  const hasErrors =
    status.shakespeareLines === 'error' || status.shakespeareSpeeches === 'error' ||
    status.earlyModernLines === 'error' || status.earlyModernSpeeches === 'error';

  const isLoaded =
    status.shakespeareLines === 'loaded' && status.shakespeareSpeeches === 'loaded' &&
    status.earlyModernLines === 'loaded' && status.earlyModernSpeeches === 'loaded';

  const hasData = lines.length > 0 && speeches.length > 0;

  if (isLoading && !isMissing && !hasErrors) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 border text-xs text-muted-foreground animate-pulse">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Loading Corpus...</span>
      </div>
    );
  }

  if (isMissing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-600 font-medium">
        <FileWarning className="w-3 h-3" />
        <span>CSV Missing in /public</span>
      </div>
    );
  }

  if (hasErrors) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-[10px] text-destructive font-medium">
        <AlertCircle className="w-3 h-3" />
        <span>Load Error</span>
      </div>
    );
  }

  if (isLoaded && hasData) {
    return (
      <div className="flex items-center gap-3 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-[10px] text-green-600 font-medium">
        <CheckCircle2 className="w-3 h-3" />
        <span className="border-r pr-2 border-green-500/20">Corpus Loaded</span>
        <span className="opacity-70">L: {lines.length.toLocaleString()} | S: {speeches.length.toLocaleString()}</span>
      </div>
    );
  }

  return null;
}
