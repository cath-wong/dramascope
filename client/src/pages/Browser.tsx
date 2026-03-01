import { useState, useMemo } from "react";
import { MainLayout } from "@/components/MainLayout";
import { useData } from "@/contexts/DataContext";
import { useUI } from "@/contexts/UIContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Download, ChevronRight } from "lucide-react";
import { exportToCsv } from "@/utils/exportCsv";

export default function Browser() {
  const { lines, speeches } = useData();
  const { corpusScope, selectedPlayTitle, timeMode, selectedGenre } = useUI();

  // Local state
  const [datasetType, setDatasetType] = useState<"lines" | "speeches">("lines");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchNorm, setSearchNorm] = useState(true);
  
  // Local filters
  const [localPlay, setLocalPlay] = useState<string>("all");
  const [localSpeaker, setLocalSpeaker] = useState<string>("all");
  const [localAct, setLocalAct] = useState<string>("all");
  const [localScene, setLocalScene] = useState<string>("all");
  const [localTime, setLocalTime] = useState<string>("all");

  const activeDataset = datasetType === "lines" ? lines : speeches;

  // Filtered dataset
  const filteredData = useMemo(() => {
    return activeDataset.filter((item: any) => {
      // Global Scope
      if (corpusScope === "play" && (item.title || item.play_id) !== selectedPlayTitle) return false;
      if (selectedGenre && item.genre !== selectedGenre) return false;

      // Local Filters
      if (localPlay !== "all" && (item.title || item.play_id) !== localPlay) return false;
      if (localSpeaker !== "all" && item.speaker !== localSpeaker) return false;
      if (localAct !== "all" && String(item.act) !== localAct) return false;
      if (localScene !== "all" && String(item.scene) !== localScene) return false;
      
      if (localTime !== "all") {
        const timeVal = timeMode === "year" 
          ? String(item.year_est || item.year_mid || "")
          : String(item.decade || item.decade_num || "");
        if (timeVal !== localTime) return false;
      }

      // Search
      if (searchTerm) {
        const textToSearch = searchNorm && item.text_norm 
          ? item.text_norm 
          : (item.text_raw || item.text_norm || "");
        if (!textToSearch.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      }

      return true;
    });
  }, [activeDataset, corpusScope, selectedPlayTitle, selectedGenre, localPlay, localSpeaker, localAct, localScene, localTime, searchTerm, searchNorm, timeMode]);

  // KWIC Results
  const kwicResults = useMemo(() => {
    if (!searchTerm) return filteredData.slice(0, 50);

    return filteredData.map((item: any) => {
      const text = (searchNorm && item.text_norm) ? item.text_norm : (item.text_raw || item.text_norm || "");
      const lowerText = text.toLowerCase();
      const lowerQuery = searchTerm.toLowerCase();
      const index = lowerText.indexOf(lowerQuery);

      if (index === -1) return null;

      const left = text.substring(Math.max(0, index - 40), index);
      const match = text.substring(index, index + searchTerm.length);
      const right = text.substring(index + searchTerm.length, index + searchTerm.length + 40);

      return { ...item, kwic: { left, match, right } };
    }).filter(Boolean).slice(0, 100);
  }, [filteredData, searchTerm, searchNorm]);

  // Unique values for dropdowns
  const filterOptions = useMemo(() => {
    const plays = new Set<string>();
    const speakers = new Set<string>();
    const acts = new Set<string>();
    const scenes = new Set<string>();
    const times = new Set<string>();

    activeDataset.forEach((item: any) => {
      if (corpusScope === "play" && (item.title || item.play_id) !== selectedPlayTitle) return;
      
      plays.add(item.title || item.play_id);
      if (item.speaker) speakers.add(item.speaker);
      if (item.act) acts.add(String(item.act));
      if (item.scene) scenes.add(String(item.scene));
      
      const timeVal = timeMode === "year" 
        ? String(item.year_est || item.year_mid || "")
        : String(item.decade || item.decade_num || "");
      if (timeVal) times.add(timeVal);
    });

    return {
      plays: Array.from(plays).sort(),
      speakers: Array.from(speakers).sort(),
      acts: Array.from(acts).sort((a, b) => Number(a) - Number(b)),
      scenes: Array.from(scenes).sort((a, b) => Number(a) - Number(b)),
      times: Array.from(times).sort()
    };
  }, [activeDataset, corpusScope, selectedPlayTitle, timeMode]);

  const handleDownload = () => {
    const filename = `corpus_${datasetType}_filtered.csv`;
    exportToCsv(filename, filteredData);
  };

  return (
    <MainLayout title="Corpus Browser">
      <div className="space-y-6">
        {/* Dataset Switcher & Search Bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card p-4 rounded-lg border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex bg-muted p-1 rounded-md">
              <Button
                variant={datasetType === "lines" ? "default" : "ghost"}
                size="sm"
                onClick={() => setDatasetType("lines")}
                className="h-8 text-xs px-4"
              >
                Lines
              </Button>
              <Button
                variant={datasetType === "speeches" ? "default" : "ghost"}
                size="sm"
                onClick={() => setDatasetType("speeches")}
                className="h-8 text-xs px-4"
              >
                Speeches
              </Button>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search in corpus..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 w-64 text-xs pl-8"
                />
              </div>
              <div className="flex items-center gap-2 ml-2">
                <Checkbox
                  id="search-norm"
                  checked={searchNorm}
                  onCheckedChange={(checked) => setSearchNorm(!!checked)}
                />
                <Label htmlFor="search-norm" className="text-xs cursor-pointer select-none">Search Norm</Label>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload} className="h-9 text-xs gap-2 shrink-0">
            <Download className="w-3.5 h-3.5" />
            Download Filtered CSV
          </Button>
        </div>

        {/* Local Filters Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-muted/20 p-4 rounded-lg border border-dashed">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-tight">Play</Label>
            <Select 
              value={corpusScope === "play" ? (selectedPlayTitle || "all") : localPlay} 
              onValueChange={setLocalPlay}
              disabled={corpusScope === "play"}
            >
              <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plays</SelectItem>
                {filterOptions.plays.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-tight">Speaker</Label>
            <Select value={localSpeaker} onValueChange={setLocalSpeaker}>
              <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Speakers</SelectItem>
                {filterOptions.speakers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-tight">Act</Label>
            <Select value={localAct} onValueChange={setLocalAct}>
              <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Acts</SelectItem>
                {filterOptions.acts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-tight">Scene</Label>
            <Select value={localScene} onValueChange={setLocalScene}>
              <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scenes</SelectItem>
                {filterOptions.scenes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-tight">{timeMode === "year" ? "Year" : "Decade"}</Label>
            <Select value={localTime} onValueChange={setLocalTime}>
              <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                {filterOptions.times.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results Counter */}
        <div className="text-xs text-muted-foreground px-1 flex items-center justify-between">
          <span>
            Showing <span className="font-bold text-foreground">{kwicResults.length}</span> of <span className="font-bold text-foreground">{filteredData.length}</span> matches 
            <span className="opacity-60 ml-1">(Total in set: {activeDataset.length.toLocaleString()})</span>
          </span>
          {searchTerm && <Badge variant="secondary" className="text-[10px] px-1.5 h-4">KWIC View Enabled</Badge>}
        </div>

        {/* KWIC Display Area */}
        <div className="space-y-2 pb-12">
          {kwicResults.length > 0 ? (
            kwicResults.map((item: any, idx) => (
              <Card key={idx} className="hover:bg-accent/5 transition-colors shadow-none border-border/60">
                <CardContent className="p-4 space-y-2.5">
                  {/* Concordance Row */}
                  <div className="text-sm font-mono leading-relaxed flex flex-wrap items-center">
                    {item.kwic ? (
                      <div className="flex items-center flex-wrap">
                        <span className="text-muted-foreground opacity-60 text-right min-w-[40px]">...{item.kwic.left}</span>
                        <mark className="bg-primary/20 text-primary font-bold px-1 rounded mx-0.5 border border-primary/10 leading-none py-0.5">
                          {item.kwic.match}
                        </mark>
                        <span className="text-muted-foreground opacity-60">{item.kwic.right}...</span>
                      </div>
                    ) : (
                      <span className="text-foreground/90 leading-normal">
                        {(searchNorm && item.text_norm) ? item.text_norm : (item.text_raw || item.text_norm || "")}
                      </span>
                    )}
                  </div>
                  
                  {/* Metadata line */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 items-center text-[10px] text-muted-foreground/80 border-t pt-2 border-muted/50">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/20 bg-primary/5 text-primary-foreground/70">
                        {item.title || item.play_id}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="opacity-70">A: {item.act}</span>
                      <ChevronRight className="w-2.5 h-2.5 opacity-30" />
                      <span className="opacity-70">S: {item.scene}</span>
                    </div>
                    <div className="flex items-center gap-1.5 border-l pl-5 border-border/40">
                      <span className="font-semibold text-foreground/70 uppercase tracking-tight">{item.speaker}</span>
                    </div>
                    {item.line_id && (
                      <div className="flex items-center gap-2 border-l pl-5 border-border/40">
                        <span className="opacity-60 italic">ID: {item.line_id}</span>
                        {item.unit && <Badge variant="secondary" className="text-[8px] h-3.5 px-1 opacity-60">{item.unit}</Badge>}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="py-24 text-center border rounded-xl bg-muted/5 border-dashed border-border/80">
              <Search className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">
                {searchTerm ? "No results matched your query" : "Enter a search term to begin exploring"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">
                Try adjusting your filters or scope in the sidebar.
              </p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
