import { Link, useLocation } from "wouter";
import { useUI } from "@/contexts/UIContext";
import { 
  LayoutDashboard, 
  Search, 
  BarChart3, 
  Database,
  Filter,
  BookOpen,
  Users
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
  } = useUI();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/browser", label: "Corpus Browser", icon: Search },
    { href: "/analysis", label: "Linguistic Analysis", icon: BarChart3 },
    { href: "/docs", label: "Docs / Methods", icon: BookOpen },
  ];

  // Compute the set of playwrights to display — show all 8 canonical ones first,
  // then any extras found in the corpus that aren't in the canonical list.
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
      // Can't deselect all — keep the first one
      setSelectedPlaywrights([allPlaywrightFullNames[0]]);
    } else {
      setSelectedPlaywrights(allPlaywrightFullNames);
    }
  };

  const handlePlaywrightToggle = (full: string) => {
    if (selectedPlaywrights.includes(full)) {
      // Guard: never go to zero
      if (selectedPlaywrights.length === 1) return;
      setSelectedPlaywrights(selectedPlaywrights.filter(pw => pw !== full));
    } else {
      setSelectedPlaywrights([...selectedPlaywrights, full]);
    }
  };

  return (
    <aside className="w-80 border-r bg-sidebar flex flex-col h-screen overflow-y-auto shrink-0">
      <div className="px-4 py-5 border-b flex items-start gap-3 shrink-0">
        <Database className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-xl font-bold tracking-tight leading-none">DramaScope</div>
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
            <label
              htmlFor="pw-all"
              className="text-xs cursor-pointer select-none font-medium text-foreground"
            >
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
                    className={cn(
                      "text-xs cursor-pointer select-none",
                      isLast ? "text-muted-foreground" : "text-foreground"
                    )}
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
