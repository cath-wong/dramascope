import React, { createContext, useContext, useState, useMemo, useEffect } from "react";
import { useData } from "./DataContext";

type CorpusScope = "full" | "play";
type TimeMode = "year" | "decade";
type TopN = 10 | 20 | 50 | 100;

interface TemporalRange {
  startYear: number;
  endYear: number;
}

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
  temporalRange: TemporalRange;
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
  setTemporalRange: (range: TemporalRange) => void;
  availablePlays: string[];
  availableGenres: string[];
  availableSpeakers: string[];
  availablePlaywrights: string[];
  /** Full corpus year bounds (derived from all loaded lines) */
  corpusYearRange: { min: number; max: number };
  /** Playwright-and-temporally-filtered lines — primary shared source for Lexical */
  selectedLines: any[];
  /** Playwright-and-temporally-filtered speeches — primary shared source for Semantic/Discursive */
  selectedSpeeches: any[];
  /** Stable string key representing active playwright selection */
  playwrightKey: string;
  /** Stable string key representing active temporal range */
  temporalRangeKey: string;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

// Sentinel for "full range" before corpus loads
const SENTINEL_RANGE: TemporalRange = { startYear: 0, endYear: 9999 };

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
    // Default: sentinel full range — will be replaced by useEffect once corpus loads
    temporalRange: SENTINEL_RANGE,
  });

  // ── Derived corpus metadata ──────────────────────────────────────────────

  /** All distinct playwright values from the full merged corpus */
  const availablePlaywrights = useMemo(() => {
    if (!lines.length) return [];
    const pws = new Set(lines.map((l: any) => l.playwright).filter(Boolean));
    return Array.from(pws).sort() as string[];
  }, [lines]);

  /** Min/max year_est across the entire merged corpus */
  const corpusYearRange = useMemo(() => {
    if (!lines.length) return { min: 0, max: 9999 };
    let min = Infinity, max = -Infinity;
    for (const l of lines) {
      const y = parseInt(l.year_est, 10);
      if (!isNaN(y)) { if (y < min) min = y; if (y > max) max = y; }
    }
    return {
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 9999 : max,
    };
  }, [lines]);

  // Initialise temporalRange to the actual corpus bounds once lines load.
  // Only fires when the computed bounds change (i.e., once on first load).
  useEffect(() => {
    if (!lines.length) return;
    setState(s => {
      // Only reset if still at sentinel values (first load)
      if (s.temporalRange.startYear === SENTINEL_RANGE.startYear &&
          s.temporalRange.endYear === SENTINEL_RANGE.endYear) {
        return { ...s, temporalRange: { startYear: corpusYearRange.min, endYear: corpusYearRange.max } };
      }
      return s;
    });
  }, [corpusYearRange.min, corpusYearRange.max, lines.length]);

  // ── Stable cache/key representations ────────────────────────────────────

  const playwrightKey = useMemo(
    () => [...state.selectedPlaywrights].sort().join("|"),
    [state.selectedPlaywrights]
  );

  const temporalRangeKey = useMemo(
    () => `${state.temporalRange.startYear}-${state.temporalRange.endYear}`,
    [state.temporalRange]
  );

  // ── Playwright + temporal filtered datasets ──────────────────────────────

  const selectedLines = useMemo(() => {
    if (!lines.length) return [];
    const pwSet = new Set(state.selectedPlaywrights);
    const { startYear, endYear } = state.temporalRange;
    return lines.filter((l: any) => {
      if (!pwSet.has(l.playwright)) return false;
      const y = parseInt(l.year_est, 10);
      // Rows with invalid year_est are included (no temporal exclusion possible)
      if (!isNaN(y) && (y < startYear || y > endYear)) return false;
      return true;
    });
  }, [lines, state.selectedPlaywrights, state.temporalRange]);

  const selectedSpeeches = useMemo(() => {
    if (!speeches.length) return [];
    const pwSet = new Set(state.selectedPlaywrights);
    const { startYear, endYear } = state.temporalRange;
    return speeches.filter((s: any) => {
      if (!pwSet.has(s.playwright)) return false;
      const y = parseInt(s.year_est, 10);
      if (!isNaN(y) && (y < startYear || y > endYear)) return false;
      return true;
    });
  }, [speeches, state.selectedPlaywrights, state.temporalRange]);

  // ── Dependent filter options (scoped to active corpus) ───────────────────

  const availablePlays = useMemo(() => {
    if (!selectedLines.length) return [];
    const titles = new Set(selectedLines.map((l: any) => l.title || l.play_title).filter(Boolean));
    return Array.from(titles).sort() as string[];
  }, [selectedLines]);

  const availableGenres = useMemo(() => {
    if (!selectedLines.length) return [];
    const genres = new Set(selectedLines.map((l: any) => l.genre).filter(Boolean));
    return Array.from(genres).sort() as string[];
  }, [selectedLines]);

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

  // Clear stale selectedPlayTitle when playwright or temporal selection changes
  useEffect(() => {
    if (!state.selectedPlayTitle) return;
    if (availablePlays.length === 0) return; // still loading
    if (!availablePlays.includes(state.selectedPlayTitle)) {
      setState(s => ({ ...s, selectedPlayTitle: null, selectedSpeaker: null }));
    }
  }, [availablePlays, state.selectedPlayTitle]);

  // ── Context value ────────────────────────────────────────────────────────

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
    setTemporalRange: (temporalRange) => setState((s) => ({ ...s, temporalRange })),
    availablePlays,
    availableGenres,
    availableSpeakers,
    availablePlaywrights,
    corpusYearRange,
    selectedLines,
    selectedSpeeches,
    playwrightKey,
    temporalRangeKey,
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
