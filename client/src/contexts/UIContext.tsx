import React, { createContext, useContext, useState, useMemo, useEffect } from "react";
import { useData } from "./DataContext";

type CorpusScope = "full" | "play";
type TimeMode = "year" | "decade";
type TopN = 10 | 20 | 50 | 100;
type DateRangeMode = "full" | "custom";

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
  /** Stored custom range — only active when dateRangeMode === "custom" */
  temporalRange: TemporalRange;
  /** Whether the user is filtering by a custom range or using the full corpus */
  dateRangeMode: DateRangeMode;
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
  setDateRangeMode: (mode: DateRangeMode) => void;
  availablePlays: string[];
  availableGenres: string[];
  availableSpeakers: string[];
  availablePlaywrights: string[];
  /** Full corpus year bounds (derived from all loaded lines) */
  corpusYearRange: { min: number; max: number };
  /**
   * The temporal range actually applied to filtering.
   * = corpusYearRange when dateRangeMode === "full"
   * = temporalRange   when dateRangeMode === "custom"
   */
  effectiveTemporalRange: TemporalRange;
  /** Playwright-and-temporally-filtered lines — primary shared source for Lexical */
  selectedLines: any[];
  /** Playwright-and-temporally-filtered speeches — primary shared source for Semantic/Discursive */
  selectedSpeeches: any[];
  /** Stable string key representing active playwright selection */
  playwrightKey: string;
  /** Stable string key representing the EFFECTIVE temporal range */
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
    // Stored custom range — sentinel until corpus loads
    temporalRange: SENTINEL_RANGE,
    // Default mode: full corpus (no deliberate temporal restriction)
    dateRangeMode: "full",
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

  // Initialise temporalRange (the stored custom range) to the actual corpus bounds
  // once lines load. Only fires when bounds change (i.e., once on first load).
  // This ensures "Selected range" starts at the full corpus range by default.
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

  // ── Effective temporal range ─────────────────────────────────────────────

  /**
   * The range actually used for filtering. In "full" mode this is the global
   * corpus bounds (never shrinks to the selected playwright's range). In
   * "custom" mode this is the user's stored temporalRange.
   */
  const effectiveTemporalRange = useMemo((): TemporalRange => {
    if (state.dateRangeMode === "full") {
      return { startYear: corpusYearRange.min, endYear: corpusYearRange.max };
    }
    return state.temporalRange;
  }, [state.dateRangeMode, state.temporalRange, corpusYearRange]);

  // ── Stable cache/key representations ────────────────────────────────────

  const playwrightKey = useMemo(
    () => [...state.selectedPlaywrights].sort().join("|"),
    [state.selectedPlaywrights]
  );

  /** Cache key uses the EFFECTIVE numerical range so full/custom with same dates share cache */
  const temporalRangeKey = useMemo(
    () => `${effectiveTemporalRange.startYear}-${effectiveTemporalRange.endYear}`,
    [effectiveTemporalRange]
  );

  // ── Playwright + temporal filtered datasets ──────────────────────────────

  const selectedLines = useMemo(() => {
    if (!lines.length) return [];
    const pwSet = new Set(state.selectedPlaywrights);
    const { startYear, endYear } = effectiveTemporalRange;
    return lines.filter((l: any) => {
      if (!pwSet.has(l.playwright)) return false;
      const y = parseInt(l.year_est, 10);
      // Rows with invalid year_est are included (no temporal exclusion possible)
      if (!isNaN(y) && (y < startYear || y > endYear)) return false;
      return true;
    });
  }, [lines, state.selectedPlaywrights, effectiveTemporalRange]);

  const selectedSpeeches = useMemo(() => {
    if (!speeches.length) return [];
    const pwSet = new Set(state.selectedPlaywrights);
    const { startYear, endYear } = effectiveTemporalRange;
    return speeches.filter((s: any) => {
      if (!pwSet.has(s.playwright)) return false;
      const y = parseInt(s.year_est, 10);
      if (!isNaN(y) && (y < startYear || y > endYear)) return false;
      return true;
    });
  }, [speeches, state.selectedPlaywrights, effectiveTemporalRange]);

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
    setDateRangeMode: (dateRangeMode) => setState((s) => ({ ...s, dateRangeMode })),
    availablePlays,
    availableGenres,
    availableSpeakers,
    availablePlaywrights,
    corpusYearRange,
    effectiveTemporalRange,
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
