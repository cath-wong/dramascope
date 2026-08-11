import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import Papa from 'papaparse';

// Type definitions for the state
type FileLoadStatus = 'idle' | 'loading' | 'missing' | 'error' | 'loaded';

interface ErrorDetail {
  file: string;
  message: string;
  url: string;
  preview?: string;
}

export interface DataContextState {
  lines: any[];     // merged: corpus_lines_real + early_modern_drama_lines
  speeches: any[];  // merged: corpus_speeches_real + early_modern_drama_speeches
  status: {
    lines: FileLoadStatus;             // overall lines (loaded when both line files loaded)
    speeches: FileLoadStatus;          // overall speeches (loaded when both speech files loaded)
    shakespeareLines: FileLoadStatus;
    shakespeareSpeeches: FileLoadStatus;
    earlyModernLines: FileLoadStatus;
    earlyModernSpeeches: FileLoadStatus;
  };
  rowCounts: {
    shakespeareLines: number;
    shakespeareSpeeches: number;
    earlyModernLines: number;
    earlyModernSpeeches: number;
  };
  errors: ErrorDetail[];
}

const initialState: DataContextState = {
  lines: [],
  speeches: [],
  status: {
    lines: 'idle',
    speeches: 'idle',
    shakespeareLines: 'idle',
    shakespeareSpeeches: 'idle',
    earlyModernLines: 'idle',
    earlyModernSpeeches: 'idle',
  },
  rowCounts: {
    shakespeareLines: 0,
    shakespeareSpeeches: 0,
    earlyModernLines: 0,
    earlyModernSpeeches: 0,
  },
  errors: []
};

const DataContext = createContext<DataContextState | undefined>(undefined);

// Internal raw data holder — avoids many separate useState calls
interface RawData {
  shakespeareLines: any[];
  shakespeareSpeeches: any[];
  earlyModernLines: any[];
  earlyModernSpeeches: any[];
}

type FileKey = 'shakespeareLines' | 'shakespeareSpeeches' | 'earlyModernLines' | 'earlyModernSpeeches';

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DataContextState>(initialState);
  const fetchStarted = useRef(false);
  const rawData = useRef<RawData>({
    shakespeareLines: [],
    shakespeareSpeeches: [],
    earlyModernLines: [],
    earlyModernSpeeches: [],
  });

  useEffect(() => {
    if (fetchStarted.current) return;
    fetchStarted.current = true;

    const deriveOverall = (a: FileLoadStatus, b: FileLoadStatus): FileLoadStatus => {
      if (a === 'error' || b === 'error') return 'error';
      if (a === 'missing' || b === 'missing') return 'missing';
      if (a === 'loaded' && b === 'loaded') return 'loaded';
      if (a === 'loading' || b === 'loading') return 'loading';
      return 'idle';
    };

    const loadCSV = async (filename: string, fileKey: FileKey) => {
      // Mark as loading
      setState(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [fileKey]: 'loading',
          lines: deriveOverall(
            fileKey === 'shakespeareLines' ? 'loading' : prev.status.shakespeareLines,
            fileKey === 'earlyModernLines' ? 'loading' : prev.status.earlyModernLines
          ),
          speeches: deriveOverall(
            fileKey === 'shakespeareSpeeches' ? 'loading' : prev.status.shakespeareSpeeches,
            fileKey === 'earlyModernSpeeches' ? 'loading' : prev.status.earlyModernSpeeches
          ),
        }
      }));

      const buster = import.meta.env.DEV ? `?v=${Date.now()}` : '';
      const url = `/${filename}${buster}`;

      try {
        console.log(`[CSV Load] ----------------------------------------`);
        console.log(`[CSV Load] Requested URL: ${url}`);

        const response = await fetch(url);
        console.log(`[CSV Load] HTTP status: ${response.status}`);

        if (response.status === 404) {
          setState(prev => {
            const newStatus = { ...prev.status, [fileKey]: 'missing' as FileLoadStatus };
            return {
              ...prev,
              status: {
                ...newStatus,
                lines: deriveOverall(newStatus.shakespeareLines, newStatus.earlyModernLines),
                speeches: deriveOverall(newStatus.shakespeareSpeeches, newStatus.earlyModernSpeeches),
              }
            };
          });
          return;
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        console.log(`[CSV Load] Response content length: ${text.length}`);

        const preview = text.substring(0, 200);
        console.log(`[CSV Load] First 200 chars preview:\n${preview}`);

        // HTML-fallback guard
        const lowerTrimmed = text.trim().toLowerCase();
        if (lowerTrimmed.startsWith('<html') || lowerTrimmed.startsWith('<!doctype')) {
          const errorMsg = "Fetched HTML instead of CSV (check /public path)";
          setState(prev => {
            const newStatus = { ...prev.status, [fileKey]: 'error' as FileLoadStatus };
            return {
              ...prev,
              status: {
                ...newStatus,
                lines: deriveOverall(newStatus.shakespeareLines, newStatus.earlyModernLines),
                speeches: deriveOverall(newStatus.shakespeareSpeeches, newStatus.earlyModernSpeeches),
              },
              errors: [...prev.errors, { file: filename, message: errorMsg, url, preview }]
            };
          });
          return;
        }

        // Parse CSV text directly
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          worker: false,
          complete: (results) => {
            const rows = results.data as any[];
            console.log(`[CSV Load] Parsed row count (${filename}): ${rows.length}`);
            console.log(`[CSV Load] Parsed column names (${filename}):`, results.meta.fields);

            // Store in ref for merging
            rawData.current[fileKey] = rows;

            setState(prev => {
              const newStatus = { ...prev.status, [fileKey]: 'loaded' as FileLoadStatus };
              const overallLines = deriveOverall(newStatus.shakespeareLines, newStatus.earlyModernLines);
              const overallSpeeches = deriveOverall(newStatus.shakespeareSpeeches, newStatus.earlyModernSpeeches);

              // Recompute merged arrays
              const mergedLines = [
                ...rawData.current.shakespeareLines,
                ...rawData.current.earlyModernLines,
              ];
              const mergedSpeeches = [
                ...rawData.current.shakespeareSpeeches,
                ...rawData.current.earlyModernSpeeches,
              ];

              return {
                ...prev,
                lines: mergedLines,
                speeches: mergedSpeeches,
                status: {
                  ...newStatus,
                  lines: overallLines,
                  speeches: overallSpeeches,
                },
                rowCounts: {
                  ...prev.rowCounts,
                  [fileKey]: rows.length,
                },
              };
            });
          },
          error: (error: any) => {
            setState(prev => {
              const newStatus = { ...prev.status, [fileKey]: 'error' as FileLoadStatus };
              return {
                ...prev,
                status: {
                  ...newStatus,
                  lines: deriveOverall(newStatus.shakespeareLines, newStatus.earlyModernLines),
                  speeches: deriveOverall(newStatus.shakespeareSpeeches, newStatus.earlyModernSpeeches),
                },
                errors: [...prev.errors, { file: filename, message: error.message, url }]
              };
            });
          }
        });

      } catch (err: any) {
        setState(prev => {
          const newStatus = { ...prev.status, [fileKey]: 'error' as FileLoadStatus };
          return {
            ...prev,
            status: {
              ...newStatus,
              lines: deriveOverall(newStatus.shakespeareLines, newStatus.earlyModernLines),
              speeches: deriveOverall(newStatus.shakespeareSpeeches, newStatus.earlyModernSpeeches),
            },
            errors: [...prev.errors, { file: filename, message: err.message || 'Unknown error', url }]
          };
        });
      }
    };

    // Load all four CSV files in parallel
    loadCSV('corpus_lines_real.csv', 'shakespeareLines');
    loadCSV('corpus_speeches_real.csv', 'shakespeareSpeeches');
    loadCSV('early_modern_drama_lines.csv', 'earlyModernLines');
    loadCSV('early_modern_drama_speeches.csv', 'earlyModernSpeeches');

  }, []);

  return (
    <DataContext.Provider value={state}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
