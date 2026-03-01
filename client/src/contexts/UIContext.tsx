import React, { createContext, useContext, useState, useMemo } from "react";
import { useData } from "./DataContext";

type CorpusScope = "full" | "play";
type TimeMode = "year" | "decade";
type TopN = 10 | 20 | 50 | 100;

interface UIState {
  corpusScope: CorpusScope;
  selectedPlayTitle: string | null;
  timeMode: TimeMode;
  topN: TopN;
  selectedGenre: string | null;
  selectedSpeaker: string | null;
  excludeStageDirections: boolean;
  unitType: "all" | "verse" | "prose";
}

interface UIContextType extends UIState {
  setCorpusScope: (scope: CorpusScope) => void;
  setSelectedPlayTitle: (title: string | null) => void;
  setTimeMode: (mode: TimeMode) => void;
  setTopN: (n: TopN) => void;
  setSelectedGenre: (genre: string | null) => void;
  setSelectedSpeaker: (speaker: string | null) => void;
  setExcludeStageDirections: (exclude: boolean) => void;
  setUnitType: (type: "all" | "verse" | "prose") => void;
  availablePlays: string[];
  availableGenres: string[];
  availableSpeakers: string[];
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { lines } = useData();
  const [state, setState] = useState<UIState>({
    corpusScope: "full",
    selectedPlayTitle: null,
    timeMode: "year",
    topN: 20,
    selectedGenre: null,
    selectedSpeaker: null,
    excludeStageDirections: false,
    unitType: "all",
  });

  const availablePlays = useMemo(() => {
    if (!lines.length) return [];
    // Deriving from 'title' or 'play_title' as per dataset logs
    const titles = new Set(lines.map((l: any) => l.title || l.play_title).filter(Boolean));
    return Array.from(titles).sort() as string[];
  }, [lines]);

  const availableGenres = useMemo(() => {
    if (!lines.length) return [];
    const genres = new Set(lines.map((l: any) => l.genre).filter(Boolean));
    return Array.from(genres).sort() as string[];
  }, [lines]);

  const availableSpeakers = useMemo(() => {
    if (!lines.length || state.corpusScope !== "play" || !state.selectedPlayTitle) return [];
    const speakers = new Set(
      lines
        .filter((l: any) => (l.title || l.play_title) === state.selectedPlayTitle)
        .map((l: any) => l.speaker)
        .filter(Boolean)
    );
    return Array.from(speakers).sort() as string[];
  }, [lines, state.corpusScope, state.selectedPlayTitle]);

  const value: UIContextType = {
    ...state,
    setCorpusScope: (corpusScope) => setState((s) => ({ ...s, corpusScope, selectedPlayTitle: corpusScope === "full" ? null : s.selectedPlayTitle })),
    setSelectedPlayTitle: (selectedPlayTitle) => setState((s) => ({ ...s, selectedPlayTitle, selectedSpeaker: null })),
    setTimeMode: (timeMode) => setState((s) => ({ ...s, timeMode })),
    setTopN: (topN) => setState((s) => ({ ...s, topN })),
    setSelectedGenre: (selectedGenre) => setState((s) => ({ ...s, selectedGenre })),
    setSelectedSpeaker: (selectedSpeaker) => setState((s) => ({ ...s, selectedSpeaker })),
    setExcludeStageDirections: (excludeStageDirections) => setState((s) => ({ ...s, excludeStageDirections })),
    setUnitType: (unitType) => setState((s) => ({ ...s, unitType })),
    availablePlays,
    availableGenres,
    availableSpeakers,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return context;
};
