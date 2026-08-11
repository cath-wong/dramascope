import { useState, useMemo } from "react";
import { MainLayout } from "@/components/MainLayout";
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
import { formatTimeValue } from "@/utils/formatTimeValue";

export default function Browser() {
  const { corpusScope, selectedPlayTitle, timeMode, selectedGenre, selectedLines: lines, selectedSpeeches: speeches } = useUI();

  const [datasetType, setDatasetType] = useState<"lines" | "speeches">("lines");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchNorm, setSearchNorm] = useState(true);
  
  const [localPlay, setLocalPlay] = useState<string>("all");
  const [localSpeaker, setLocalSpeaker] = useState<string>("all");
  const [localAct, setLocalAct] = useState<string>("all");
  const [localScene, setLocalScene] = useState<string>("all");
  const [localTime, setLocalTime] = useState<string>("all");

  const activeDataset = datasetType === "lines" ? lines : speeches;

  const filteredData = useMemo(() => {
    return activeDataset.filter((item: any) => {
      if (corpusScope === "play" && (item.title || item.play_id) !== selectedPlayTitle) return false;
      if (selectedGenre && item.genre !== selectedGenre) return false;

      if (localPlay !== "all" && (item.title || item.play_id) !== localPlay) return false;
      if (localSpeaker !== "all" && item.speaker !== localSpeaker) return false;
      if (localAct !== "all" && String(item.act) !== localAct) return false;
      if (localScene !== "all" && String(item.scene) !== localScene) return false;
      
      if (localTime !== "all") {
        const val = timeMode === "year" ? (item.year_est || item.year_mid || "") : (item.decade || item.decade_num || "");
        if (formatTimeValue(val) !== localTime) return false;
      }

      if (searchTerm) {
        const textToSearch = searchNorm && item.text_norm ? item.text_norm : (item.text_raw || item.text_norm || "");
        if (!textToSearch.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      }
      return true;
    });
  }, [activeDataset, corpusScope, selectedPlayTitle, selectedGenre, localPlay, localSpeaker, localAct, localScene, localTime, searchTerm, searchNorm, timeMode]);

  const kwicResults = useMemo(() => {
    if (!searchTerm) return filteredData.slice(0, 50);
    return filteredData.map((item: any) => {
      const text = (searchNorm && item.text_norm) ? item.text_norm : (item.text_raw || item.text_norm || "");
      const index = text.toLowerCase().indexOf(searchTerm.toLowerCase());
      if (index === -1) return null;
      return { ...item, kwic: { left: text.substring(Math.max(0, index - 40), index), match: text.substring(index, index + searchTerm.length), right: text.substring(index + searchTerm.length, index + searchTerm.length + 40) } };
    }).filter(Boolean).slice(0, 100);
  }, [filteredData, searchTerm, searchNorm]);

  const filterOptions = useMemo(() => {
    const plays = new Set<string>(), speakers = new Set<string>(), acts = new Set<string>(), scenes = new Set<string>(), times = new Set<string>();
    activeDataset.forEach((item: any) => {
      if (corpusScope === "play" && (item.title || item.play_id) !== selectedPlayTitle) return;
      plays.add(item.title || item.play_id);
      if (item.speaker) speakers.add(item.speaker);
      if (item.act) acts.add(String(item.act));
      if (item.scene) scenes.add(String(item.scene));
      const val = timeMode === "year" ? (item.year_est || item.year_mid || "") : (item.decade || item.decade_num || "");
      const f = formatTimeValue(val);
      if (f !== "Unknown") times.add(f);
    });
    return { plays: Array.from(plays).sort(), speakers: Array.from(speakers).sort(), acts: Array.from(acts).sort((a, b) => Number(a) - Number(b)), scenes: Array.from(scenes).sort((a, b) => Number(a) - Number(b)), times: Array.from(times).sort() };
  }, [activeDataset, corpusScope, selectedPlayTitle, timeMode]);

  return (
    <MainLayout title="Corpus Browser">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card p-4 rounded-lg border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex bg-muted p-1 rounded-md">
              <Button variant={datasetType === "lines" ? "default" : "ghost"} size="sm" onClick={() => setDatasetType("lines")} className="h-8 text-xs px-4">Lines</Button>
              <Button variant={datasetType === "speeches" ? "default" : "ghost"} size="sm" onClick={() => setDatasetType("speeches")} className="h-8 text-xs px-4">Speeches</Button>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-9 w-64 text-xs pl-8" />
              </div>
              <div className="flex items-center gap-2 ml-2">
                <Checkbox id="search-norm" checked={searchNorm} onCheckedChange={(checked) => setSearchNorm(!!checked)} />
                <Label htmlFor="search-norm" className="text-xs cursor-pointer">Search Norm</Label>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportToCsv(`corpus_${datasetType}.csv`, filteredData)} className="h-9 text-xs gap-2"><Download className="w-3.5 h-3.5" /> Download</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-muted/20 p-4 rounded-lg border border-dashed">
          <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground/80">Play</Label><Select value={corpusScope === "play" ? (selectedPlayTitle || "all") : localPlay} onValueChange={setLocalPlay} disabled={corpusScope === "play"}><SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Plays</SelectItem>{filterOptions.plays.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground/80">Speaker</Label><Select value={localSpeaker} onValueChange={setLocalSpeaker}><SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Speakers</SelectItem>{filterOptions.speakers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground/80">Act</Label><Select value={localAct} onValueChange={setLocalAct}><SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Acts</SelectItem>{filterOptions.acts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground/80">Scene</Label><Select value={localScene} onValueChange={setLocalScene}><SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Scenes</SelectItem>{filterOptions.scenes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground/80">{timeMode === "year" ? "Year" : "Decade"}</Label><Select value={localTime} onValueChange={setLocalTime}><SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Time</SelectItem>{filterOptions.times.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
        </div>

        <div className="text-xs text-muted-foreground px-1">Showing <strong>{kwicResults.length}</strong> of <strong>{filteredData.length}</strong> matches</div>

        <div className="space-y-2 pb-12">
          {kwicResults.map((item: any, idx) => (
            <Card key={idx} className="hover:bg-accent/5 transition-colors shadow-none border-border/60">
              <CardContent className="p-4 space-y-2.5">
                <div className="text-sm font-mono leading-relaxed">
                  {item.kwic ? <div className="flex items-center flex-wrap"><span className="text-muted-foreground opacity-60">...{item.kwic.left}</span><mark className="bg-primary/20 text-primary font-bold px-1 rounded mx-0.5">{item.kwic.match}</mark><span className="text-muted-foreground opacity-60">{item.kwic.right}...</span></div> : <span>{(searchNorm && item.text_norm) ? item.text_norm : (item.text_raw || item.text_norm || "")}</span>}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 items-center text-[10px] text-muted-foreground/80 border-t pt-2 border-muted/50">
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{item.title || item.play_id}</Badge>
                  <span>A: {item.act} S: {item.scene}</span>
                  <span className="font-semibold text-foreground/70 uppercase">{item.speaker}</span>
                  {item.line_id && <span className="opacity-60 italic">ID: {item.line_id}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
