import React, { useState, useMemo, useRef, useEffect } from "react";
import { MainLayout } from "@/components/MainLayout";
import { useData } from "@/contexts/DataContext";
import { useUI } from "@/contexts/UIContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Download, Settings2, BarChart3, Table as TableIcon, Search, HelpCircle, TrendingUp, TrendingDown, History, ChevronLeft, ChevronRight, Play, Pause, Network, ChevronDown, ChevronUp, Pin, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { processTokens, formatTimeValue, getStoplist } from "@/utils/linguistics";
import { exportToCsv } from "@/utils/exportCsv";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  LineChart,
  Line
} from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ResultsTable } from "@/components/ResultsTable";

const DetailsPanel = ({ dataset, tokenCol, settings, ui }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2 font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/50">
          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Method Summary
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 p-3 rounded-lg border border-dashed bg-muted/20 grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px]">
        <div className="space-y-1"><span className="font-bold opacity-60">DATASET</span><p>{dataset}</p></div>
        <div className="space-y-1"><span className="font-bold opacity-60">TOKEN SOURCE</span><p>{tokenCol}</p></div>
        <div className="space-y-1"><span className="font-bold opacity-60">TOGGLES</span><p>Stoplist: {settings.stoplist ? 'ON' : 'OFF'} | Lemma: {settings.lemmas ? 'ON' : 'OFF'}</p></div>
        <div className="space-y-1"><span className="font-bold opacity-60">SCOPE</span><p>{ui.corpusScope} | Top-{ui.topN}</p></div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const PinnedPanel = ({ pinned, onRemove, title = "Pinned Items" }: any) => {
  if (pinned.length === 0) return null;
  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardHeader className="py-2 px-4 border-b border-primary/10 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[10px] uppercase font-bold text-primary flex items-center gap-2"><Pin className="h-3 w-3" /> {title}</CardTitle>
        <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => exportToCsv("pinned.csv", pinned)}>Export TSV</Button>
      </CardHeader>
      <CardContent className="p-2 flex flex-wrap gap-2">
        {pinned.map((item: any, i: number) => (
          <Badge key={i} variant="secondary" className="gap-1.5 pl-2 pr-1 py-0.5 text-[10px] font-medium bg-background border border-primary/10">
            {item.label} <span className="opacity-50 font-bold">{item.metric}</span>
            <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-destructive" onClick={() => onRemove(i)}><Trash2 className="h-2.5 w-2.5" /></Button>
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
};

// --- Lexical Tab Component ---
const LexicalTab = () => {
  const { lines } = useData();
  const ui = useUI();
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker } = ui;
  const computationCache = useRef<Map<string, any>>(new Map());
  const [lexSettings, setLexSettings] = useState({ stoplist: true, lemmatization: true, ngramSize: "2", excludeStage: true, contentFocus: false });
  const [pinned, setPinned] = useState<any[]>([]);

  const results = useMemo(() => {
    const scopedLines = lines.filter(l => {
      if (corpusScope === "play" && (l.title || l.play_id) !== selectedPlayTitle) return false;
      if (selectedGenre && l.genre !== selectedGenre) return false;
      if (selectedSpeaker && l.speaker !== selectedSpeaker) return false;
      if (lexSettings.excludeStage && (l.unit === "stage" || l.unit === "stage_direction")) return false;
      return true;
    });
    if (!scopedLines.length) return null;
    const cacheKey = JSON.stringify({ scope: corpusScope, title: selectedPlayTitle, genre: selectedGenre, speaker: selectedSpeaker, topN, lex: lexSettings });
    if (computationCache.current.has(cacheKey)) return computationCache.current.get(cacheKey);

    const unigramCounts = new Map<string, number>();
    let totalTokens = 0;
    scopedLines.forEach(l => {
      const tokens = processTokens(l.text_norm || "", { useStoplist: lexSettings.stoplist, useLemmas: lexSettings.lemmatization });
      tokens.forEach(t => { unigramCounts.set(t, (unigramCounts.get(t) || 0) + 1); totalTokens++; });
    });
    if (totalTokens === 0) return { error: "No tokens found." };
    const freqList = Array.from(unigramCounts.entries()).map(([token, count]) => ({ token, count, per_10k: parseFloat(((count / totalTokens) * 10000).toFixed(2)) })).sort((a, b) => b.count - a.count).slice(0, topN);
    
    const ngramCounts = new Map<string, number>();
    const nSize = parseInt(lexSettings.ngramSize);
    scopedLines.forEach(l => {
      const tokens = processTokens(l.text_norm || "", { useStoplist: lexSettings.stoplist, useLemmas: lexSettings.lemmatization });
      for (let i = 0; i <= tokens.length - nSize; i++) { const gram = tokens.slice(i, i + nSize).join(" "); ngramCounts.set(gram, (ngramCounts.get(gram) || 0) + 1); }
    });
    let ngramList = Array.from(ngramCounts.entries()).map(([ngram, count]) => ({ ngram, count, per_10k: parseFloat(((count / totalTokens) * 10000).toFixed(2)) })).sort((a, b) => b.count - a.count);
    
    if (lexSettings.contentFocus) {
      const stoplist = getStoplist();
      ngramList = ngramList.filter(item => {
        const parts = item.ngram.split(" ");
        const stops = parts.filter(p => stoplist.has(p)).length;
        return stops < 2;
      });
    }

    const output = { freqList, ngramList: ngramList.slice(0, topN), totalTokens };
    computationCache.current.set(cacheKey, output);
    return output;
  }, [lines, corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, lexSettings]);

  const pinFreq = (item: any) => setPinned(p => [...p, { label: item.token, metric: item.count, type: "lex-freq" }]);
  const pinNgram = (item: any) => setPinned(p => [...p, { label: item.ngram, metric: item.count, type: "lex-ngram" }]);

  return (
    <div className="space-y-6">
      <DetailsPanel dataset="LINES ONLY" tokenCol="text_norm" settings={{ stoplist: lexSettings.stoplist, lemmas: lexSettings.lemmatization }} ui={ui} />
      <PinnedPanel pinned={pinned} onRemove={(idx: number) => setPinned(p => p.filter((_, i) => i !== idx))} />
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4" /> Lexical Parameters</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2"><div className="flex items-center space-x-2"><Checkbox id="l-stop" checked={lexSettings.stoplist} onCheckedChange={v => setLexSettings(s => ({...s, stoplist:!!v}))}/><Label htmlFor="l-stop" className="text-xs">Stoplist</Label></div><div className="flex items-center space-x-2"><Checkbox id="l-lemma" checked={lexSettings.lemmatization} onCheckedChange={v => setLexSettings(s => ({...s, lemmatization:!!v}))}/><Label htmlFor="l-lemma" className="text-xs">Lemmas</Label></div></div>
        <div className="space-y-1"><Label className="text-[10px] uppercase font-bold">N-grams</Label><Select value={lexSettings.ngramSize} onValueChange={v => setLexSettings(s => ({...s, ngramSize:v}))}><SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="2">Bigrams</SelectItem><SelectItem value="3">Trigrams</SelectItem></SelectContent></Select></div>
        <div className="flex items-center space-x-2 pt-5"><Checkbox id="l-focus" checked={lexSettings.contentFocus} onCheckedChange={v => setLexSettings(s => ({...s, contentFocus:!!v}))}/><Label htmlFor="l-focus" className="text-xs flex items-center gap-1.5">Content Focus <Info className="h-3 w-3 opacity-50" title="Hides n-grams with 2+ stoplist tokens" /></Label></div>
      </CardContent></Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="shadow-none">
          <CardHeader><CardTitle className="text-sm">Word Frequencies</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[200px]"><ResponsiveContainer><BarChart data={results?.freqList?.slice(0, 10)}><XAxis dataKey="token" fontSize={9}/><Tooltip/><Bar dataKey="count" fill="hsl(var(--primary))"/></BarChart></ResponsiveContainer></div>
            <ResultsTable data={results?.freqList || []} columns={[{ key: "token", label: "Token" }, { key: "count", label: "Count", sortable: true, align: "right" }, { key: "per_10k", label: "Per 10k", sortable: true, align: "right" }]} onPin={pinFreq} filename="lex_freq.csv" />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader><CardTitle className="text-sm">N-Grams {lexSettings.contentFocus && <Badge variant="outline" className="text-[9px] font-normal border-primary/30 text-primary">Filtered</Badge>}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[200px]"><ResponsiveContainer><BarChart data={results?.ngramList?.slice(0, 10)}><XAxis dataKey="ngram" fontSize={9}/><Tooltip/><Bar dataKey="count" fill="hsl(var(--primary))"/></BarChart></ResponsiveContainer></div>
            <ResultsTable data={results?.ngramList || []} columns={[{ key: "ngram", label: "Sequence" }, { key: "count", label: "Count", sortable: true, align: "right" }]} onPin={pinNgram} filename="lex_ngrams.csv" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// --- Semantic Tab ---
const SemanticTab = () => {
  const { speeches } = useData();
  const ui = useUI();
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker } = ui;
  const [targetTerm, setTargetTerm] = useState("");
  const [minCooc, setMinCooc] = useState(2);
  const [useStoplist, setUseStoplist] = useState(true);
  const [useLemmas, setUseLemmas] = useState(true);
  const [pinned, setPinned] = useState<any[]>([]);
  const computationCache = useRef<Map<string, any>>(new Map());

  const results = useMemo(() => {
    if (!targetTerm) return null;
    const filtered = speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      if (selectedGenre && s.genre !== selectedGenre) return false;
      if (selectedSpeaker && s.speaker !== selectedSpeaker) return false;
      return true;
    });
    const cacheKey = JSON.stringify({ scope: corpusScope, title: selectedPlayTitle, target: targetTerm, stoplist: useStoplist, lemmas: useLemmas });
    if (computationCache.current.has(cacheKey)) return computationCache.current.get(cacheKey);

    const q = processTokens(targetTerm, { useStoplist: false, useLemmas })[0] || targetTerm.toLowerCase();
    const globalCounts = new Map<string, number>();
    let totalTokens = 0;
    const speechTokens = filtered.map(s => {
      const tokens = processTokens(s.text_raw || "", { useStoplist, useLemmas });
      tokens.forEach(t => { globalCounts.set(t, (globalCounts.get(t) || 0) + 1); totalTokens++; });
      return { ...s, tokens };
    });
    const qFreq = globalCounts.get(q) || 0;
    if (qFreq === 0) return { error: `Term "${q}" not found.` };

    const coocCounts = new Map<string, number>();
    speechTokens.forEach(s => {
      s.tokens.forEach((t, i) => {
        if (t === q) {
          const win = s.tokens.slice(Math.max(0, i - 10), Math.min(s.tokens.length, i + 11));
          win.forEach((col, j) => { if (col !== q) coocCounts.set(col, (coocCounts.get(col) || 0) + 1); });
        }
      });
    });

    const associationList = Array.from(coocCounts.entries()).map(([term, count]) => {
      const termFreq = globalCounts.get(term) || 1;
      const pmi = Math.log2((count/totalTokens)/((qFreq/totalTokens)*(termFreq/totalTokens)));
      return { term, count, score: parseFloat(pmi.toFixed(3)) };
    }).filter(a => a.count >= minCooc).sort((a, b) => b.score - a.score).slice(0, topN);

    const output = { associationList };
    computationCache.current.set(cacheKey, output);
    return output;
  }, [speeches, targetTerm, corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, useStoplist, useLemmas, minCooc]);

  return (
    <div className="space-y-6">
      <DetailsPanel dataset="SPEECHES ONLY" tokenCol="text_raw (norm)" settings={{ stoplist: useStoplist, lemmas: useLemmas }} ui={ui} />
      <PinnedPanel pinned={pinned} onRemove={(idx: number) => setPinned(p => p.filter((_, i) => i !== idx))} />
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Semantic Parameters</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input placeholder="Target Term..." value={targetTerm} onChange={e => setTargetTerm(e.target.value)} className="h-8 text-xs"/>
        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold">Min Co-occurrence: {minCooc}</Label><Input type="range" min="1" max="10" value={minCooc} onChange={e => setMinCooc(parseInt(e.target.value))} className="h-4"/></div>
      </CardContent></Card>
      {results?.associationList && (
        <ResultsTable data={results.associationList} columns={[{ key: "term", label: "Term" }, { key: "count", label: "Count", sortable: true, align: "right" }, { key: "score", label: "PMI Score", sortable: true, align: "right" }]} onPin={(item) => setPinned(p => [...p, { label: item.term, metric: item.score }])} />
      )}
    </div>
  );
};

// --- Discursive Tab ---
const DiscursiveTab = () => {
  const { speeches } = useData();
  const ui = useUI();
  const { corpusScope, selectedPlayTitle, topN, timeMode } = ui;
  const [nodeLemma, setNodeLemma] = useState("lord");
  const [viewMode, setViewMode] = useState<"table" | "constellation">("constellation");
  const [useStoplist, setUseStoplist] = useState(true);
  const [useLemmas, setUseLemmas] = useState(true);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedCoLemma, setSelectedCoLemma] = useState<string | null>(null);
  const [driftMetric, setDriftMetric] = useState<"jaccard" | "size">("jaccard");
  const [pinned, setPinned] = useState<any[]>([]);
  const quadCache = useRef<Map<string, any>>(new Map());

  const getTimeSlice = (s: any) => (timeMode === "year" ? s.year_est || s.year_mid || s.year_min || "Unknown" : s.decade || s.decade_num || "Unknown");

  const results = useMemo(() => {
    const filtered = speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      return true;
    });
    const cacheKey = JSON.stringify({ scope: corpusScope, node: nodeLemma, stop: useStoplist, lem: useLemmas, time: timeMode });
    if (computationCache.current.has(cacheKey)) return computationCache.current.get(cacheKey);

    let totalNodeWindows = 0;
    const lemmaFreqs = new Map<string, { count: number; speeches: Set<number> }>();
    const speechTokens = filtered.map((s, idx) => {
      const tokens = processTokens(s.text_raw || "", { useStoplist, useLemmas });
      tokens.forEach(t => { if (!lemmaFreqs.has(t)) lemmaFreqs.set(t, { count: 0, speeches: new Set() }); lemmaFreqs.get(t)!.count++; lemmaFreqs.get(t)!.speeches.add(idx); });
      return { ...s, tokens, time: formatTimeValue(getTimeSlice(s)) };
    });

    const activeNode = nodeLemma.trim().toLowerCase();
    const quadsByTime = new Map<string, any[]>();
    const allSlices = new Set<string>();
    const edgeExamples = new Map<string, any[]>();

    speechTokens.forEach(s => {
      if (s.time === "Unknown") return;
      const nodeIndices = s.tokens.reduce((acc: number[], t, i) => { if (t === activeNode) acc.push(i); return acc; }, []);
      if (nodeIndices.length === 0) return;
      allSlices.add(s.time);
      totalNodeWindows += nodeIndices.length;
      const coocInSlice = new Map<string, number>();
      nodeIndices.forEach(idx => {
        const win = s.tokens.slice(Math.max(0, idx - 50), Math.min(s.tokens.length, idx + 51));
        win.forEach(t => { if (t === activeNode) return; coocInSlice.set(t, (coocInSlice.get(t) || 0) + 1); const ek = `${activeNode}|${t}`; if (!edgeExamples.has(ek)) edgeExamples.set(ek, []); if (edgeExamples.get(ek)!.length < 5) edgeExamples.get(ek)!.push({ title: s.title || s.play_id, speaker: s.speaker, text: s.text_raw || "" }); });
      });
      if (!quadsByTime.has(s.time)) quadsByTime.set(s.time, []);
      quadsByTime.get(s.time)!.push({ node: activeNode, cooc: coocInSlice });
    });

    const sortedSlices = Array.from(allSlices).sort();
    const driftTable = sortedSlices.map((slice, idx) => {
      const sliceData = quadsByTime.get(slice) || [];
      const agg = new Map<string, number>();
      sliceData.forEach(sd => sd.cooc.forEach((c: number, t: string) => agg.set(t, (agg.get(t) || 0) + c)));
      const sorted = Array.from(agg.entries()).sort((a, b) => b[1] - a[1]);
      const topNSet = new Set(sorted.slice(0, topN).map(([t]) => t));
      
      let jaccard = 0;
      if (idx > 0) {
        const prevAgg = quadsByTime.get(sortedSlices[idx-1]) || [];
        const prevMap = new Map<string, number>();
        prevAgg.forEach(sd => sd.cooc.forEach((c: number, t: string) => prevMap.set(t, (prevMap.get(t) || 0) + c)));
        const prevSet = new Set(Array.from(prevMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([t]) => t));
        const intersection = Array.from(topNSet).filter(t => prevSet.has(t)).length;
        const union = new Set([...Array.from(topNSet), ...Array.from(prevSet)]).size;
        jaccard = union > 0 ? intersection / union : 0;
      }

      return { slice, size: agg.size, topN: sorted.slice(0, topN).map(([term, count]) => ({ term, count })), top3: sorted.slice(0, 3).map(([t]) => t), jaccard: parseFloat(jaccard.toFixed(3)) };
    });

    const output = { sortedSlices, driftTable, totalNodeWindows, edgeExamples, topNodes: Array.from(lemmaFreqs.entries()).map(([lemma, d]) => ({ lemma, count: d.count })).sort((a, b) => b.count - a.count).slice(0, 50) };
    quadCache.current.set(cacheKey, output);
    return output;
  }, [speeches, corpusScope, nodeLemma, useStoplist, useLemmas, timeMode, topN, selectedPlayTitle]);

  const activeSliceData = results?.driftTable[currentTimeIndex];

  return (
    <div className="space-y-6">
      <DetailsPanel dataset="SPEECHES ONLY" tokenCol="text_raw" settings={{ stoplist: useStoplist, lemmas: useLemmas }} ui={ui} />
      <PinnedPanel pinned={pinned} onRemove={(idx: number) => setPinned(p => p.filter((_, i) => i !== idx))} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-3 shadow-none border-muted/60">
          <CardHeader className="pb-3 bg-muted/5 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Network className="h-4 w-4 text-amber-500" /> Sanity Checks</CardTitle>
            <div className="flex bg-muted p-0.5 rounded-md">
              <Button variant={viewMode === "constellation" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("constellation")} className="h-6 text-[9px] px-2">Constellation</Button>
              <Button variant={viewMode === "table" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("table")} className="h-6 text-[9px] px-2">Table</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-1"><span className="text-[9px] font-bold text-muted-foreground uppercase">NODE</span><p className="text-sm font-bold text-amber-600">{nodeLemma}</p></div>
            <div className="space-y-1"><span className="text-[9px] font-bold text-muted-foreground uppercase">WINDOWS</span><p className="text-sm font-bold">{results?.totalNodeWindows || 0}</p></div>
            <div className="space-y-1"><span className="text-[9px] font-bold text-muted-foreground uppercase">SLICE</span><p className="text-sm font-bold">{currentTimeIndex + 1} of {results?.sortedSlices.length}</p></div>
            <div className="space-y-1"><span className="text-[9px] font-bold text-muted-foreground uppercase">QUAD</span><p className="text-[10px] font-bold text-primary truncate">{activeSliceData?.top3.join(', ')}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-none border-amber-100 bg-amber-50/5">
          <CardHeader className="bg-amber-100/20 border-b border-amber-100"><CardTitle className="text-sm font-bold">Constellation: {nodeLemma} ({results?.sortedSlices[currentTimeIndex]})</CardTitle></CardHeader>
          <CardContent className="pt-6 space-y-4">
            {viewMode === "constellation" ? (
              <div className="space-y-2">
                {activeSliceData?.topN.map((item: any) => (
                  <div key={item.term} className="group cursor-pointer" onClick={() => setSelectedCoLemma(item.term)}>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="font-medium group-hover:text-primary transition-colors">{item.term}</span>
                      <span className="opacity-60">{item.count}</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500/60 rounded-full transition-all group-hover:bg-amber-500" style={{ width: `${(item.count / activeSliceData.topN[0].count) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ResultsTable data={activeSliceData?.topN || []} columns={[{ key: "term", label: "Term" }, { key: "count", label: "Weight", sortable: true, align: "right" }]} onPin={(item) => setPinned(p => [...p, { label: item.term, metric: item.count }])} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground px-1">Window Traceability (±50 tokens)</h4>
          {selectedCoLemma ? (
            <div className="space-y-2 max-h-[400px] overflow-auto pr-2 custom-scrollbar">
              {results?.edgeExamples.get(`${nodeLemma.trim().toLowerCase()}|${selectedCoLemma}`)?.map((ex: any, i: number) => (
                <div key={i} className="p-3 rounded-lg border bg-background text-[10px] italic shadow-sm border-amber-100">
                  "...{ex.text.substring(0, 200)}..."
                  <div className="mt-1 text-[8px] font-bold opacity-60 uppercase">{ex.title} | {ex.speaker}</div>
                </div>
              ))}
            </div>
          ) : <div className="h-40 border-2 border-dashed rounded-xl flex items-center justify-center text-[10px] text-muted-foreground italic">Select a neighbor to view context</div>}
        </div>
      </div>

      <Card className="shadow-none border-muted/60">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Diachronic Metrics</CardTitle>
          <Select value={driftMetric} onValueChange={(v: any) => setDriftMetric(v)}>
            <SelectTrigger className="h-7 text-[10px] w-32"><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="jaccard">Jaccard Stability</SelectItem><SelectItem value="size">Constellation Size</SelectItem></SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={results?.driftTable}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="slice" fontSize={9} />
                <YAxis fontSize={9} />
                <Tooltip contentStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey={driftMetric} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default function Analysis() {
  const ui = useUI();
  return (
    <MainLayout title="Linguistic Analysis">
      <Tabs defaultValue="lexical" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/50 p-1"><TabsTrigger value="lexical">Lexical</TabsTrigger><TabsTrigger value="semantic">Semantic</TabsTrigger><TabsTrigger value="discursive">Discursive</TabsTrigger></TabsList>
        <TabsContent value="lexical"><LexicalTab /></TabsContent>
        <TabsContent value="semantic"><SemanticTab /></TabsContent>
        <TabsContent value="discursive"><DiscursiveTab /></TabsContent>
      </Tabs>
    </MainLayout>
  );
}
