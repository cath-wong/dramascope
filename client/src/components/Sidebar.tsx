import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useUI } from "@/contexts/UIContext";
import { 
  LayoutDashboard, 
  Search, 
  BarChart3, 
  Database,
  Filter,
  BookOpen,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

// Display surname → full name mapping (order controls sidebar order)
const PLAYWRIGHT_DISPLAY: { surname: string; full: string }[] = [
  { surname: "Shakespeare", full: "William Shakespeare" },
  { surname: "Marlowe",     full: "Christopher Marlowe" },
  { surname: "Kyd",         full: "Thomas Kyd" },
  { surname: "Jonson",      full: "Ben Jonson" },
  { surname: "Middleton",   full: "Thomas Middleton" },
  { surname: "Webster",     full: "John Webster" },
  { surname: "Massinger",   full: "Philip Massinger" },
  { surname: "Ford",        full: "John Ford" },
];

export function Sidebar() {
  const [location] = useLocation();
  const {
    corpusScope, setCorpusScope,
    selectedPlayTitle, setSelectedPlayTitle,
    timeMode, setTimeMode,
    topN, setTopN,
    selectedGenre, setSelectedGenre,
    selectedSpeaker, setSelectedSpeaker,
    excludeStageDirections, setExcludeStageDirections,
    availablePlays, availableGenres, availableSpeakers,
    selectedPlaywrights, setSelectedPlaywrights,
    availablePlaywrights,
    temporalRange, setTemporalRange,
    dateRangeMode, setDateRangeMode,
    corpusYearRange,
  } = useUI();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/browser", label: "Corpus Browser", icon: Search },
    { href: "/analysis", label: "Linguistic Analysis", icon: BarChart3 },
    { href: "/docs", label: "Docs / Methods", icon: BookOpen },
  ];

  // Playwright display helpers
  const canonicalFullNames = PLAYWRIGHT_DISPLAY.map(p => p.full);
  const extraPlaywrights = availablePlaywrights.filter(pw => !canonicalFullNames.includes(pw));
  const displayPlaywrights = [
    ...PLAYWRIGHT_DISPLAY.filter(p => availablePlaywrights.includes(p.full) || availablePlaywrights.length === 0),
    ...extraPlaywrights.map(pw => ({ surname: pw.split(" ").pop() || pw, full: pw })),
  ];

  const allPlaywrightFullNames = displayPlaywrights.map(p => p.full);
  const allSelected = allPlaywrightFullNames.length > 0 &&
    allPlaywrightFullNames.every(pw => selectedPlaywrights.includes(pw));

  const handleAllToggle = () => {
    if (allSelected) {
      setSelectedPlaywrights([allPlaywrightFullNames[0]]);
    } else {
      setSelectedPlaywrights(allPlaywrightFullNames);
    }
  };

  const handlePlaywrightToggle = (full: string) => {
    if (selectedPlaywrights.includes(full)) {
      if (selectedPlaywrights.length === 1) return; // guard: never zero
      setSelectedPlaywrights(selectedPlaywrights.filter(pw => pw !== full));
    } else {
      setSelectedPlaywrights([...selectedPlaywrights, full]);
    }
  };

  // ── Date Range local draft state ─────────────────────────────────────────
  // Free-typing string drafts; validated/clamped only on commit (blur or Enter).

  const [draftStart, setDraftStart] = useState<string>(String(temporalRange.startYear));
  const [draftEnd, setDraftEnd] = useState<string>(String(temporalRange.endYear));

  // When the user switches to "custom" mode, reinitialise drafts from the stored
  // temporalRange (which defaults to the full corpus range on first load).
  useEffect(() => {
    if (dateRangeMode === "custom") {
      setDraftStart(String(temporalRange.startYear));
      setDraftEnd(String(temporalRange.endYear));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRangeMode]);

  const commitStart = () => {
    const v = parseInt(draftStart, 10);
    if (isNaN(v)) {
      setDraftStart(String(temporalRange.startYear));
      return;
    }
    // Clamp within corpus bounds, then ensure start ≤ end
    const clamped = Math.max(corpusYearRange.min, Math.min(v, corpusYearRange.max));
    const finalStart = Math.min(clamped, temporalRange.endYear);
    setDraftStart(String(finalStart));
    setTemporalRange({ startYear: finalStart, endYear: temporalRange.endYear });
  };

  const commitEnd = () => {
    const v = parseInt(draftEnd, 10);
    if (isNaN(v)) {
      setDraftEnd(String(temporalRange.endYear));
      return;
    }
    // Clamp within corpus bounds, then ensure end ≥ start
    const clamped = Math.max(corpusYearRange.min, Math.min(v, corpusYearRange.max));
    const finalEnd = Math.max(clamped, temporalRange.startYear);
    setDraftEnd(String(finalEnd));
    setTemporalRange({ startYear: temporalRange.startYear, endYear: finalEnd });
  };

  const handleStartKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.currentTarget.blur(); }
  };

  const handleEndKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.currentTarget.blur(); }
  };

  // Whether the corpus has loaded (sentinel check)
  const corpusLoaded = corpusYearRange.min !== 0 || corpusYearRange.max !== 9999;

  return (
    <aside className="w-80 border-r bg-sidebar flex flex-col h-screen overflow-y-auto shrink-0">
      <div className="px-4 py-5 border-b flex items-start gap-3 shrink-0">
        <Database className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-xl font-bold tracking-tight leading-none">
            DramaScope <span className="text-xs font-normal text-muted-foreground">v1.1</span>
          </div>
          <div className="text-xs text-muted-foreground font-normal leading-snug max-w-[220px] mt-1">Explore lexical, semantic, and discursive patterns in Early Modern English drama.</div>
        </div>
      </div>

      <nav className="p-2 space-y-1 shrink-0">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
              location === item.href 
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm" 
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}>
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </div>
          </Link>
        ))}
      </nav>

      <Separator />

      <div className="p-4 space-y-6 flex-1">

        {/* PLAYWRIGHTS */}
        <div className="space-y-3">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
            <Users className="w-3 h-3" /> Playwrights
          </Label>

          {/* All playwrights toggle */}
          <div className="flex items-center gap-2 py-0.5">
            <Checkbox
              id="pw-all"
              checked={allSelected}
              onCheckedChange={handleAllToggle}
              className="h-3.5 w-3.5"
            />
            <label htmlFor="pw-all" className="text-xs cursor-pointer select-none font-medium text-foreground">
              All playwrights
            </label>
          </div>

          <div className="space-y-1.5 pl-0.5">
            {displayPlaywrights.map(({ surname, full }) => {
              const checked = selectedPlaywrights.includes(full);
              const isLast = selectedPlaywrights.length === 1 && checked;
              return (
                <div key={full} className="flex items-center gap-2 py-0.5">
                  <Checkbox
                    id={`pw-${full}`}
                    checked={checked}
                    onCheckedChange={() => handlePlaywrightToggle(full)}
                    disabled={isLast}
                    className="h-3.5 w-3.5"
                  />
                  <label
                    htmlFor={`pw-${full}`}
                    className={cn("text-xs cursor-pointer select-none", isLast ? "text-muted-foreground" : "text-foreground")}
                  >
                    {surname}
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <Separator className="opacity-50" />

        {/* GLOBAL SCOPE */}
        <div className="space-y-4">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Global Scope</Label>

          {/* DATE RANGE */}
          <div className="space-y-2">
            <Label className="text-xs">Date Range</Label>

            {/* Mode toggle — matches Time Granularity styling */}
            <div className="flex bg-muted p-0.5 rounded-md">
              <button
                onClick={() => setDateRangeMode("full")}
                className={cn(
                  "flex-1 text-[10px] py-1 rounded-sm transition-all",
                  dateRangeMode === "full"
                    ? "bg-background shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Full corpus
              </button>
              <button
                onClick={() => setDateRangeMode("custom")}
                className={cn(
                  "flex-1 text-[10px] py-1 rounded-sm transition-all",
                  dateRangeMode === "custom"
                    ? "bg-background shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Selected range
              </button>
            </div>

            {/* Full corpus: static range display */}
            {dateRangeMode === "full" && (
              <p className="text-xs font-semibold text-center tabular-nums text-foreground/75 py-0.5">
                {corpusLoaded
                  ? `${corpusYearRange.min}–${corpusYearRange.max}`
                  : "Loading…"}
              </p>
            )}

            {/* Selected range: editable From / To inputs */}
            {dateRangeMode === "custom" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 space-y-0.5">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">From</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={draftStart}
                      onChange={e => setDraftStart(e.target.value)}
                      onBlur={commitStart}
                      onKeyDown={handleStartKeyDown}
                      className="h-7 text-xs px-2"
                    />
                  </div>
                  <span className="text-muted-foreground text-xs mt-4">–</span>
                  <div className="flex-1 space-y-0.5">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">To</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={draftEnd}
                      onChange={e => setDraftEnd(e.target.value)}
                      onBlur={commitEnd}
                      onKeyDown={handleEndKeyDown}
                      className="h-7 text-xs px-2"
                    />
                  </div>
                </div>
                {corpusLoaded && (
                  <p className="text-[9px] text-muted-foreground">
                    Corpus: {corpusYearRange.min}–{corpusYearRange.max}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* CORPUS SCOPE */}
          <div className="space-y-1.5">
            <Label htmlFor="scope" className="text-xs">Corpus Scope</Label>
            <Select value={corpusScope} onValueChange={(v: any) => setCorpusScope(v)}>
              <SelectTrigger id="scope" className="h-8 text-xs"><SelectValue placeholder="Select scope" /></SelectTrigger>
              <SelectContent><SelectItem value="full">Full Corpus</SelectItem><SelectItem value="play">Single Play</SelectItem></SelectContent>
            </Select>
          </div>
          {corpusScope === "play" && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
              <Label htmlFor="play" className="text-xs">Select Play</Label>
              <Select value={selectedPlayTitle || ""} onValueChange={setSelectedPlayTitle}>
                <SelectTrigger id="play" className="h-8 text-xs"><SelectValue placeholder="Choose a play" /></SelectTrigger>
                <SelectContent>{availablePlays.map(play => (<SelectItem key={play} value={play}>{play}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Time Granularity</Label>
            <div className="flex bg-muted p-0.5 rounded-md">
              <button onClick={() => setTimeMode("year")} className={cn("flex-1 text-[10px] py-1 rounded-sm transition-all", timeMode === "year" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground")}>Year</button>
              <button onClick={() => setTimeMode("decade")} className={cn("flex-1 text-[10px] py-1 rounded-sm transition-all", timeMode === "decade" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground")}>Decade</button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="top-n" className="text-xs">Top-N Results</Label>
            <Select value={String(topN)} onValueChange={(v) => setTopN(Number(v) as any)}>
              <SelectTrigger id="top-n" className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
            </Select>
          </div>
        </div>

        <Separator className="opacity-50" />

        {/* FILTERS */}
        <div className="space-y-4">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2"><Filter className="w-3 h-3" /> Filters</Label>
          <div className="space-y-1.5">
            <Label htmlFor="genre" className="text-xs">Genre</Label>
            <Select value={selectedGenre || "all"} onValueChange={(v) => setSelectedGenre(v === "all" ? null : v)}>
              <SelectTrigger id="genre" className="h-8 text-xs"><SelectValue placeholder="All Genres" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Genres</SelectItem>{availableGenres.map(genre => (<SelectItem key={genre} value={genre}>{genre}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="speaker" className="text-xs">Speaker</Label>
            <Select value={selectedSpeaker || "all"} onValueChange={(v) => setSelectedSpeaker(v === "all" ? null : v)} disabled={corpusScope !== "play" || !selectedPlayTitle}>
              <SelectTrigger id="speaker" className="h-8 text-xs"><SelectValue placeholder={corpusScope === "play" ? "All Speakers" : "Select play first"} /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Speakers</SelectItem>{availableSpeakers.map(speaker => (<SelectItem key={speaker} value={speaker}>{speaker}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="stage-directions" className="text-xs cursor-pointer">Exclude Stage Directions</Label>
            <Switch id="stage-directions" checked={excludeStageDirections} onCheckedChange={setExcludeStageDirections} className="scale-75 origin-right" />
          </div>
        </div>
      </div>
    </aside>
  );
}
