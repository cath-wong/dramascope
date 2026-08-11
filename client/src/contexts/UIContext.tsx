import React, { createContext, useContext, useState, useMemo, useEffect } from "react";
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
  selectedPlaywrights: string[];
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
  setSelectedPlaywrights: (playwrights: string[]) => void;
  availablePlays: string[];
  availableGenres: string[];
  availableSpeakers: string[];
  availablePlaywrights: string[];
  /** Playwright-filtered lines — use this instead of raw lines from useData() */
  selectedLines: any[];
  /** Playwright-filtered speeches — use this instead of raw speeches from useData() */
  selectedSpeeches: any[];
  /** Stable string key representing the active playwright selection — use in cache key contexts */
  playwrightKey: string;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { lines, speeches } = useData();

  const [state, setState] = useState<UIState>({
    corpusScope: "full",
    selectedPlayTitle: null,
    timeMode: "year",
    topN: 20,
    selectedGenre: null,
    selectedSpeaker: null,
    excludeStageDirections: false,
    unitType: "all",
    // Default: Shakespeare only (backward compatible with pre-Step-45 behaviour)
    selectedPlaywrights: ["William Shakespeare"],
  });

  // All distinct playwright values from the full merged corpus
  const availablePlaywrights = useMemo(() => {
    if (!lines.length) return [];
    const pws = new Set(lines.map((l: any) => l.playwright).filter(Boolean));
    return Array.from(pws).sort() as string[];
  }, [lines]);

  // Playwright-filtered datasets — the primary shared data source for all analyses
  const selectedLines = useMemo(() => {
    if (!lines.length) return [];
    const set = new Set(state.selectedPlaywrights);
    return lines.filter((l: any) => set.has(l.playwright));
  }, [lines, state.selectedPlaywrights]);

  const selectedSpeeches = useMemo(() => {
    if (!speeches.length) return [];
    const set = new Set(state.selectedPlaywrights);
    return speeches.filter((s: any) => set.has(s.playwright));
  }, [speeches, state.selectedPlaywrights]);

  // Stable cache key for the active playwright selection
  const playwrightKey = useMemo(
    () => [...state.selectedPlaywrights].sort().join("|"),
    [state.selectedPlaywrights]
  );

  // Available plays are scoped to the selected playwright corpus
  const availablePlays = useMemo(() => {
    if (!selectedLines.length) return [];
    const titles = new Set(selectedLines.map((l: any) => l.title || l.play_title).filter(Boolean));
    return Array.from(titles).sort() as string[];
  }, [selectedLines]);

  // Available genres are scoped to the selected playwright corpus
  const availableGenres = useMemo(() => {
    if (!selectedLines.length) return [];
    const genres = new Set(selectedLines.map((l: any) => l.genre).filter(Boolean));
    return Array.from(genres).sort() as string[];
  }, [selectedLines]);

  // Available speakers are scoped to the selected play within the selected playwright corpus
  const availableSpeakers = useMemo(() => {
    if (!selectedLines.length || state.corpusScope !== "play" || !state.selectedPlayTitle) return [];
    const speakers = new Set(
      selectedLines
        .filter((l: any) => (l.title || l.play_title) === state.selectedPlayTitle)
        .map((l: any) => l.speaker)
        .filter(Boolean)
    );
    return Array.from(speakers).sort() as string[];
  }, [selectedLines, state.corpusScope, state.selectedPlayTitle]);

  // When playwright selection changes and the currently selected play is no longer valid, clear it
  useEffect(() => {
    if (!state.selectedPlayTitle) return;
    if (availablePlays.length === 0) return; // still loading
    if (!availablePlays.includes(state.selectedPlayTitle)) {
      setState(s => ({ ...s, selectedPlayTitle: null, selectedSpeaker: null }));
    }
  }, [availablePlays, state.selectedPlayTitle]);

  const value: UIContextType = {
    ...state,
    setCorpusScope: (corpusScope) =>
      setState((s) => ({
        ...s,
        corpusScope,
        selectedPlayTitle: corpusScope === "full" ? null : s.selectedPlayTitle,
      })),
    setSelectedPlayTitle: (selectedPlayTitle) =>
      setState((s) => ({ ...s, selectedPlayTitle, selectedSpeaker: null })),
    setTimeMode: (timeMode) => setState((s) => ({ ...s, timeMode })),
    setTopN: (topN) => setState((s) => ({ ...s, topN })),
    setSelectedGenre: (selectedGenre) => setState((s) => ({ ...s, selectedGenre })),
    setSelectedSpeaker: (selectedSpeaker) => setState((s) => ({ ...s, selectedSpeaker })),
    setExcludeStageDirections: (excludeStageDirections) =>
      setState((s) => ({ ...s, excludeStageDirections })),
    setUnitType: (unitType) => setState((s) => ({ ...s, unitType })),
    setSelectedPlaywrights: (selectedPlaywrights) => {
      // Guard: never allow an empty playwright selection
      if (selectedPlaywrights.length === 0) return;
      setState((s) => ({ ...s, selectedPlaywrights }));
    },
    availablePlays,
    availableGenres,
    availableSpeakers,
    availablePlaywrights,
    selectedLines,
    selectedSpeeches,
    playwrightKey,
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
