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

interface DataContextState {
  lines: any[];
  speeches: any[];
  status: {
    lines: FileLoadStatus;
    speeches: FileLoadStatus;
  };
  errors: ErrorDetail[];
}

const initialState: DataContextState = {
  lines: [],
  speeches: [],
  status: {
    lines: 'idle',
    speeches: 'idle'
  },
  errors: []
};

const DataContext = createContext<DataContextState | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DataContextState>(initialState);
  const fetchStarted = useRef(false);

  useEffect(() => {
    if (fetchStarted.current) return;
    fetchStarted.current = true;

    const loadCSV = async (filename: string, stateKey: 'lines' | 'speeches') => {
      setState(prev => ({
        ...prev,
        status: { ...prev.status, [stateKey]: 'loading' }
      }));

      const buster = import.meta.env.DEV ? `?v=${Date.now()}` : '';
      const url = `/${filename}${buster}`;
      
      try {
        console.log(`[CSV Load] ----------------------------------------`);
        console.log(`[CSV Load] Requested URL: ${url}`);
        
        const response = await fetch(url);
        console.log(`[CSV Load] HTTP status: ${response.status}`);
        
        if (response.status === 404) {
          setState(prev => ({
            ...prev,
            status: { ...prev.status, [stateKey]: 'missing' }
          }));
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
          setState(prev => ({
            ...prev,
            status: { ...prev.status, [stateKey]: 'error' },
            errors: [...prev.errors, { file: filename, message: errorMsg, url, preview }]
          }));
          return;
        }

        // Parse CSV text directly (NO download: true, NO workers)
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          worker: false,
          complete: (results) => {
            console.log(`[CSV Load] Parsed row count (${filename}): ${results.data.length}`);
            console.log(`[CSV Load] Parsed column names (${filename}):`, results.meta.fields);
            
            setState(prev => ({
              ...prev,
              [stateKey]: results.data,
              status: { ...prev.status, [stateKey]: 'loaded' }
            }));
          },
          error: (error: any) => {
            setState(prev => ({
              ...prev,
              status: { ...prev.status, [stateKey]: 'error' },
              errors: [...prev.errors, { file: filename, message: error.message, url, preview }]
            }));
          }
        });

      } catch (err: any) {
        setState(prev => ({
          ...prev,
          status: { ...prev.status, [stateKey]: 'error' },
          errors: [...prev.errors, { file: filename, message: err.message || 'Unknown error', url }]
        }));
      }
    };

    loadCSV('corpus_lines_real.csv', 'lines');
    loadCSV('corpus_speeches_real.csv', 'speeches');

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
