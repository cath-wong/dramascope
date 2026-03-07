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
import { Info, Download, Settings2, BarChart3, Table as TableIcon, Search, HelpCircle, TrendingUp, TrendingDown, History, ChevronLeft, ChevronRight, Play, Pause, Network, ChevronDown, ChevronUp, Pin, Trash2, ListFilter, LayoutGrid, FileText, X } from "lucide-react";
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
  Line,
} from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ResultsTable } from "@/components/ResultsTable";
import { buildSankeyData } from "@/utils/sankey";
import D3Sankey from "@/components/D3Sankey";
import { FUNCTION_WORDS, isContentWord } from "@/utils/discursiveFilter";

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
    <Card className="mb-6 border-primary/20 bg-primary/5 shadow-sm">
      <CardHeader className="py-2 px-4 border-b border-primary/10 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[10px] uppercase font-bold text-primary flex items-center gap-2"><Pin className="h-3 w-3" /> {title}</CardTitle>
        <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => exportToCsv("pinned_curation.csv", pinned)}>Export Pinned</Button>
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

  return (
    <div className="space-y-6">
      <DetailsPanel dataset="LINES ONLY" tokenCol="text_norm" settings={{ stoplist: lexSettings.stoplist, lemmas: lexSettings.lemmatization }} ui={ui} />
      <PinnedPanel pinned={pinned} onRemove={(idx: number) => setPinned(p => p.filter((_, i) => i !== idx))} />
      <Card className="shadow-none border-muted/60"><CardHeader className="pb-3 bg-muted/5 border-b"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4" /> Lexical Parameters</CardTitle></CardHeader>
      <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2"><div className="flex items-center space-x-2"><Checkbox id="l-stop" checked={lexSettings.stoplist} onCheckedChange={v => setLexSettings(s => ({...s, stoplist:!!v}))}/><Label htmlFor="l-stop" className="text-xs">Stoplist</Label></div><div className="flex items-center space-x-2"><Checkbox id="l-lemma" checked={lexSettings.lemmatization} onCheckedChange={v => setLexSettings(s => ({...s, lemmatization:!!v}))}/><Label htmlFor="l-lemma" className="text-xs">Lemmas</Label></div></div>
        <div className="space-y-1"><Label className="text-[10px] uppercase font-bold">N-grams</Label><Select value={lexSettings.ngramSize} onValueChange={v => setLexSettings(s => ({...s, ngramSize:v}))}><SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="2">Bigrams</SelectItem><SelectItem value="3">Trigrams</SelectItem></SelectContent></Select></div>
        <div className="flex items-center space-x-2 pt-5"><Checkbox id="l-focus" checked={lexSettings.contentFocus} onCheckedChange={v => setLexSettings(s => ({...s, contentFocus:!!v}))}/><Label htmlFor="l-focus" className="text-xs flex items-center gap-1.5">Content Focus <Info className="h-3 w-3 opacity-50" title="Hides n-grams with 2+ stoplist tokens" /></Label></div>
      </CardContent></Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="shadow-none">
          <CardHeader><CardTitle className="text-sm">Word Frequencies</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[200px]"><ResponsiveContainer><BarChart data={results?.freqList?.slice(0, 10)}><XAxis dataKey="token" fontSize={9}/><Tooltip/><Bar dataKey="count" fill="hsl(var(--primary))"/></BarChart></ResponsiveContainer></div>
            <ResultsTable data={results?.freqList || []} columns={[{ key: "token", label: "Token" }, { key: "count", label: "Count", sortable: true, align: "right" }, { key: "per_10k", label: "Per 10k", sortable: true, align: "right" }]} onPin={(item) => setPinned(p => [...p, { label: item.token, metric: item.count }])} filename="lex_freq.csv" />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader><CardTitle className="text-sm">N-Grams {lexSettings.contentFocus && <Badge variant="outline" className="text-[9px] font-normal border-primary/30 text-primary">Filtered</Badge>}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[200px]"><ResponsiveContainer><BarChart data={results?.ngramList?.slice(0, 10)}><XAxis dataKey="ngram" fontSize={9}/><Tooltip/><Bar dataKey="count" fill="hsl(var(--primary))"/></BarChart></ResponsiveContainer></div>
            <ResultsTable data={results?.ngramList || []} columns={[{ key: "ngram", label: "Sequence" }, { key: "count", label: "Count", sortable: true, align: "right" }]} onPin={(item) => setPinned(p => [...p, { label: item.ngram, metric: item.count }])} filename="lex_ngrams.csv" />
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
      <Card className="shadow-none border-muted/60"><CardHeader className="pb-3 bg-muted/5 border-b"><CardTitle className="text-sm font-semibold">Semantic Parameters</CardTitle></CardHeader>
      <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold">Target Term</Label><Input placeholder="Term..." value={targetTerm} onChange={e => setTargetTerm(e.target.value)} className="h-8 text-xs"/></div>
        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold">Min Co-occurrence: {minCooc}</Label><Input type="range" min="1" max="10" value={minCooc} onChange={e => setMinCooc(parseInt(e.target.value))} className="h-4"/></div>
      </CardContent></Card>
      {results?.associationList && (
        <ResultsTable data={results.associationList} columns={[{ key: "term", label: "Term" }, { key: "count", label: "Count", sortable: true, align: "right" }, { key: "score", label: "PMI Score", sortable: true, align: "right" }]} onPin={(item) => setPinned(p => [...p, { label: item.term, metric: item.score }])} filename="semantic_associations.csv" />
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
  const [inventoryScope, setInventoryScope] = useState<"slice" | "all">("slice");
  const [minFreq, setMinFreq] = useState(2);
  const [topNodeLimit, setTopNodeLimit] = useState<10 | 20 | 50>(20);
  const [inventorySearch, setInventorySearch] = useState("");
  const [useStoplist, setUseStoplist] = useState(true);
  const [useLemmas, setUseLemmas] = useState(true);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedQuadKey, setSelectedQuadKey] = useState<string | null>(null);
  const [driftMetric, setDriftMetric] = useState<"jaccard" | "size">("jaccard");
  const [pinned, setPinned] = useState<any[]>([]);
  const quadCache = useRef<Map<string, any>>(new Map());

  // Sankey specific state
  const [sankeyAnalysisMode, setSankeyAnalysisMode] = useState<"all-time" | "time-slice">("all-time");
  const [selectedSankeySlice, setSelectedSankeySlice] = useState<string>("");
  const [minSankeyWeight, setMinSankeyWeight] = useState(3);
  const [maxNodesPerLayer, setMaxNodesPerLayer] = useState(20);
  const [selectedSankeyLink, setSelectedSankeyLink] = useState<{ source: string, target: string, layerSource: number } | null>(null);

  // Content word filtering
  const [contentWordOnly, setContentWordOnly] = useState(false);

  const getTimeSlice = (s: any) => (timeMode === "year" ? s.year_est || s.year_mid || s.year_min || "Unknown" : s.decade || s.decade_num || "Unknown");

  const results = useMemo(() => {
    const filtered = speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      return true;
    });
    console.log("[Discursive] speeches loaded:", speeches.length);
    console.log("[Discursive] filtered speeches:", filtered.length);
    console.log("[Discursive] first speech keys:", filtered[0] ? Object.keys(filtered[0]) : null);
    console.log("[Discursive] sample text_raw:", filtered[0]?.text_raw);
    console.log("[Discursive] sample text_norm:", filtered[0]?.text_norm);
    // IMPORTANT: do not cache when data has not loaded yet (prevents stale empty cache)
    if (!speeches || speeches.length === 0) return null;

    // include a data signature so cache invalidates when CSV loads / scope changes
    const cacheKey = JSON.stringify({
      scope: corpusScope,
      play: selectedPlayTitle,
      node: nodeLemma,
      stop: useStoplist,
      lem: useLemmas,
      time: timeMode,
      topN,
      speechesLen: speeches.length,   // <-- key fix
    });

    if (quadCache.current.has(cacheKey)) return quadCache.current.get(cacheKey);

    let totalNodeWindows = 0;
    let totalQuadWindows = 0;
    const quadInstancesAll: any[] = [];
    const lemmaFreqs = new Map<string, { count: number; speeches: Set<number> }>();
    const speechTokens = filtered.map((s, idx) => {
      const tokens = processTokens(s.text_raw || "", { useStoplist, useLemmas });
      tokens.forEach(t => { if (!lemmaFreqs.has(t)) lemmaFreqs.set(t, { count: 0, speeches: new Set() }); lemmaFreqs.get(t)!.count++; lemmaFreqs.get(t)!.speeches.add(idx); });
      return { ...s, tokens, time: formatTimeValue(getTimeSlice(s)) };
    });

    const activeNode = nodeLemma.trim().toLowerCase();
    const quadFreqBySlice = new Map<string, Map<string, number>>();
    const quadExamples = new Map<string, any[]>();
    const allSlices = new Set<string>();

    speechTokens.forEach(s => {
      if (s.time === "Unknown") return;
      const nodeIndices = s.tokens.reduce((acc: number[], t, i) => { if (t === activeNode) acc.push(i); return acc; }, []);
      if (nodeIndices.length === 0) return;
      allSlices.add(s.time);
      totalNodeWindows += nodeIndices.length;

      if (!quadFreqBySlice.has(s.time)) quadFreqBySlice.set(s.time, new Map());

      nodeIndices.forEach(idx => {
        const start = Math.max(0, idx - 50);
        const end = Math.min(s.tokens.length, idx + 51);
        const winTokens = s.tokens.slice(start, end);

        const winCounts = new Map<string, number>();
        winTokens.forEach(t => { if (t === activeNode) return; winCounts.set(t, (winCounts.get(t) || 0) + 1); });

        const sortedWin = Array.from(winCounts.entries()).sort((a, b) => b[1] - a[1]);
        if (sortedWin.length >= 3) {
          totalQuadWindows++;
          const co = sortedWin.slice(0, 3);
          const quadArray = [activeNode, ...co.map(pair => pair[0])].sort();
          const quadKey = quadArray.join("|");

          const instance = {
            slice: s.time,
            quadKey,
            node: activeNode,
            co: co.map(p => p[0]),
            weights: co.map(p => p[1]),
            source: { title: s.title || s.play_id, speaker: s.speaker, act: s.act, scene: s.scene, excerpt: (s.text_raw || "").substring(0, 200) + "..." }
          };

          quadInstancesAll.push(instance);
          const sliceFreq = quadFreqBySlice.get(s.time)!;
          sliceFreq.set(quadKey, (sliceFreq.get(quadKey) || 0) + 1);

          if (!quadExamples.has(quadKey)) quadExamples.set(quadKey, []);
          if (quadExamples.get(quadKey)!.length < 10) quadExamples.get(quadKey)!.push(instance);
        }
      });
    });

    const sortedSlices = Array.from(allSlices).sort();
    const driftTable = sortedSlices.map((slice, idx) => {
      const freqMap = quadFreqBySlice.get(slice) || new Map();
      const sortedQuads = Array.from(freqMap.entries()).sort((a, b) => b[1] - a[1]);
      const topNQuads = sortedQuads.slice(0, topN).map(([quadKey, count]) => ({ quadKey, count }));
      const top3 = topNQuads.slice(0, 3).map(q => q.quadKey);

      let jaccard = 0;
      if (idx > 0) {
        const prevFreqMap = quadFreqBySlice.get(sortedSlices[idx - 1]) || new Map();
        const prevSet = new Set(Array.from(prevFreqMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k]) => k));
        const currSet = new Set(topNQuads.map(q => q.quadKey));
        const intersection = Array.from(currSet).filter(k => prevSet.has(k)).length;
        const union = new Set([...Array.from(currSet), ...Array.from(prevSet)]).size;
        jaccard = union > 0 ? intersection / union : 0;
      }

      return { slice, size: freqMap.size, topN: topNQuads, top3, jaccard: parseFloat(jaccard.toFixed(3)), totalQuadWindows: Array.from(freqMap.values()).reduce((a, b) => a + b, 0) };
    });

    const quadFreqBySliceObj: Record<string, any[]> = {};
    quadFreqBySlice.forEach((val, key) => { quadFreqBySliceObj[key] = Array.from(val.entries()).map(([quadKey, count]) => ({ quadKey, count })).sort((a, b) => b.count - a.count); });

    const output = { 
      sortedSlices, 
      driftTable, 
      totalNodeWindows, 
      totalQuadWindows,
      quadFreqBySliceObj,
      quadInstancesAll,
      quadExamplesObj: Object.fromEntries(quadExamples),
      topNodes: Array.from(lemmaFreqs.entries()).map(([lemma, d]) => ({ lemma, count: d.count })).sort((a, b) => b.count - a.count).slice(0, 50) 
    };
    quadCache.current.set(cacheKey, output);
    return output;
  }, [speeches, corpusScope, nodeLemma, useStoplist, useLemmas, timeMode, topN, selectedPlayTitle]);

  const topNodeRows = useMemo(() => {
    if (!results?.topNodes) return [];
    let nodes = results.topNodes;
    if (contentWordOnly) {
      nodes = nodes.filter(n => isContentWord(n.lemma));
    }
    return nodes.slice(0, topNodeLimit);
  }, [results, topNodeLimit, contentWordOnly]);

  useEffect(() => {
    if (results?.sortedSlices?.length && !selectedSankeySlice) {
      setSelectedSankeySlice(results.sortedSlices[0]);
    }
  }, [results, selectedSankeySlice]);

  const activeSlice = results?.sortedSlices[currentTimeIndex];
  const activeSliceData = results?.driftTable[currentTimeIndex];

  const topQuadsFiltered = useMemo(() => {
    if (!activeSliceData?.topN) return [];
    if (!contentWordOnly) return activeSliceData.topN;
    return activeSliceData.topN.filter(q => {
      const quadParts = q.quadKey.split("|");
      return quadParts.every(lemma => isContentWord(lemma));
    });
  }, [activeSliceData, contentWordOnly]);

  const sankeyData = useMemo(() => {
    if (!results?.quadInstancesAll) return null;

    const instances =
      sankeyAnalysisMode === "all-time"
        ? results.quadInstancesAll
        : results.quadInstancesAll.filter(q => q.slice === selectedSankeySlice);

    console.log("[Sankey] instances:", instances.length, "mode:", sankeyAnalysisMode, "slice:", selectedSankeySlice);
    console.log("[Sankey] sample instance:", instances[0]);

    let out = buildSankeyData(instances, { minWeight: minSankeyWeight, maxNodesPerLayer });

    // Apply content-word filtering to Sankey visualization
    if (contentWordOnly) {
      const filteredNodeIds = new Set(
        out.nodes
          .filter(n => isContentWord(n.label))
          .map(n => n.id)
      );
      out = {
        ...out,
        nodes: out.nodes.filter(n => filteredNodeIds.has(n.id)),
        links: out.links.filter(l => filteredNodeIds.has(l.source) && filteredNodeIds.has(l.target))
      };
    }

    console.log("[Sankey] out nodes:", out.nodes.length, "out links:", out.links.length);
    console.log("[Sankey] out link sample:", out.links.slice(0, 5));

    return out;
  }, [results, sankeyAnalysisMode, selectedSankeySlice, minSankeyWeight, maxNodesPerLayer, contentWordOnly]);

  const inventoryRows = useMemo(() => {
    if (!results) return [];
    let base: any[] = [];
    if (inventoryScope === "slice") {
      base = results.quadFreqBySliceObj[activeSlice] || [];
      base = base.map(q => {
        const ex = results.quadExamplesObj[q.quadKey]?.[0];
        return { 
          quadKey: q.quadKey,
          node: nodeLemma,
          co1: ex?.co?.[0] || "",
          co2: ex?.co?.[1] || "",
          co3: ex?.co?.[2] || "",
          count: q.count, 
          first_seen: activeSlice, 
          last_seen: activeSlice, 
          example_title: ex?.source.title, 
          example_meta: `A: ${ex?.source.act} S: ${ex?.source.scene} | ${ex?.source.speaker}`, 
          excerpt: ex?.source.excerpt,
          co: ex?.co || []
        };
      });
    } else {
      const agg = new Map<string, { count: number; first: string; last: string }>();
      results.sortedSlices.forEach(slice => {
        (results.quadFreqBySliceObj[slice] || []).forEach(q => {
          if (!agg.has(q.quadKey)) agg.set(q.quadKey, { count: 0, first: slice, last: slice });
          const e = agg.get(q.quadKey)!; e.count += q.count; e.last = slice;
        });
      });
      base = Array.from(agg.entries()).map(([quadKey, d]) => {
        const ex = results.quadExamplesObj[quadKey]?.[0];
        return {
          quadKey,
          node: nodeLemma,
          co1: ex?.co?.[0] || "",
          co2: ex?.co?.[1] || "",
          co3: ex?.co?.[2] || "",
          count: d.count,
          first_seen: d.first,
          last_seen: d.last,
          example_title: ex?.source.title,
          example_meta: `A: ${ex?.source.act} S: ${ex?.source.scene} | ${ex?.source.speaker}`,
          excerpt: ex?.source.excerpt,
          co: ex?.co || []
        };
      });
    }

    let filtered = base.filter(r => r.count >= minFreq);
    if (inventorySearch) {
      const s = inventorySearch.toLowerCase();
      filtered = filtered.filter(r => r.quadKey.toLowerCase().includes(s));
    }

    // Sankey Filter
    if (selectedSankeyLink) {
      const { source, target, layerSource } = selectedSankeyLink;
      const s = source.split("__")[0];
      const t = target.split("__")[0];

      filtered = filtered.filter(r => {
        if (layerSource === 0) return r.co[0] === t;
        if (layerSource === 1) return r.co[0] === s && r.co[1] === t;
        if (layerSource === 2) return r.co[1] === s && r.co[2] === t;
        return true;
      });
    }

    // Content-word filtering: hide quads where node or any co-lemma is a function word
    if (contentWordOnly) {
      filtered = filtered.filter(r => {
        const quadParts = r.quadKey.split("|");
        return quadParts.every(lemma => isContentWord(lemma));
      });
    }

    const denom = results.totalQuadWindows || 0;

    filtered = filtered.map(r => ({
      ...r,
      share: denom > 0 ? `${((r.count / denom) * 100).toFixed(1)}%` : "—",
    }));

    return filtered;
  }, [results, inventoryScope, activeSlice, minFreq, inventorySearch, selectedSankeyLink, contentWordOnly]);

  const inventoryColumns = [
    { key: "node", label: "Node (L0)" },
    { key: "co1", label: "Co-1 (L1)" },
    { key: "co2", label: "Co-2 (L2)" },
    { key: "co3", label: "Co-3 (L3)" },
    { key: "count", label: "Freq", sortable: true, align: "right" },
    { key: "share", label: "Share", sortable: true, align: "right" },
    { key: "first_seen", label: "First Seen", sortable: true },
    { key: "last_seen", label: "Last Seen", sortable: true },
    { key: "example_title", label: "Source" },
    { key: "example_meta", label: "Metadata" },
    { key: "excerpt", label: "Excerpt" }
  ];

  const sankeyTableRows = useMemo(() => {
    if (!sankeyData?.links) return [];

    const parse = (id: string) => {
      const m = id.match(/__L(\d+)$/);
      return {
        id,
        label: id.split("__")[0],
        layer: m ? Number(m[1]) : null,
      };
    };

    return sankeyData.links.map((l) => {
      const s = parse(l.source);
      const t = parse(l.target);
      return {
        source: s.label,
        target: t.label,
        weight: l.value,
        layer_source: s.layer,
        layer_target: t.layer,
        source_id: s.id,
        target_id: t.id,
      };
    });
  }, [sankeyData]);

  return (
    <div className="space-y-6 pb-12">
      <DetailsPanel dataset="SPEECHES ONLY" tokenCol="text_raw" settings={{ stoplist: useStoplist, lemmas: useLemmas }} ui={ui} />
      <PinnedPanel pinned={pinned} onRemove={(idx: number) => setPinned(p => p.filter((_, i) => i !== idx))} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-4 shadow-none border-muted/60">
          <CardHeader className="pb-3 bg-muted/5 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Network className="h-4 w-4 text-amber-500" /> Sanity Checks</CardTitle>
            <div className="flex bg-muted p-0.5 rounded-md shadow-inner">
              <Button variant={viewMode === "constellation" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("constellation")} className="h-6 text-[9px] px-2">Bars</Button>
              <Button variant={viewMode === "table" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("table")} className="h-6 text-[9px] px-2">Table</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-1"><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">NODE WINDOWS</span><p className="text-sm font-bold text-amber-600">{results?.totalNodeWindows || 0}</p></div>
            <div className="space-y-1"><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">QUAD WINDOWS</span><p className="text-sm font-bold">{results?.totalQuadWindows || 0}</p></div>
            <div className="space-y-1"><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">SLICE</span><p className="text-sm font-bold">{currentTimeIndex + 1} of {results?.sortedSlices.length || 0}</p></div>
            <div className="space-y-1"><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">TOP QUAD</span><p className="text-[10px] font-bold text-primary truncate" title={activeSliceData?.top3[0]}>{activeSliceData?.top3[0]?.replace(/\|/g, ', ') || '-'}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none border-muted/60 overflow-hidden">
        <CardHeader className="bg-muted/5 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-sm font-bold flex items-center gap-2">Sankey Traffic (Synchronic Overview)</CardTitle>
            <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5"><Badge variant="outline" className="h-4 text-[8px] bg-background">Mode: {sankeyAnalysisMode === "all-time" ? "All-Time" : `Time Slice (${selectedSankeySlice})`}</Badge></span>
              <span className="flex items-center gap-1.5"><Badge variant="outline" className="h-4 text-[8px] bg-background">Node: {nodeLemma}</Badge></span>
              <span className="flex items-center gap-1.5"><Badge variant="outline" className="h-4 text-[8px] bg-background">Scope: {corpusScope === "play" ? selectedPlayTitle : "Full Corpus"}</Badge></span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-muted p-0.5 rounded-md border shadow-inner">
              <Button variant={sankeyAnalysisMode === "all-time" ? "default" : "ghost"} size="sm" onClick={() => setSankeyAnalysisMode("all-time")} className="h-7 text-[9px] px-3">All Time</Button>
              <Button variant={sankeyAnalysisMode === "time-slice" ? "default" : "ghost"} size="sm" onClick={() => setSankeyAnalysisMode("time-slice")} className="h-7 text-[9px] px-3">Time Slice</Button>
            </div>
            {sankeyAnalysisMode === "time-slice" && (
              <Select value={selectedSankeySlice} onValueChange={setSelectedSankeySlice}>
                <SelectTrigger className="h-7 text-[9px] w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {results?.sortedSlices.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2 h-7 px-2 border rounded bg-background shadow-sm">
              <Label className="text-[9px] font-bold opacity-60">MIN EDGE</Label>
              <Input type="number" value={minSankeyWeight} onChange={e => setMinSankeyWeight(parseInt(e.target.value)||1)} className="h-5 w-10 text-[10px] p-0 text-center border-none shadow-none focus-visible:ring-0" />
            </div>
            <Select value={maxNodesPerLayer.toString()} onValueChange={v => setMaxNodesPerLayer(parseInt(v))}>
              <SelectTrigger className="h-7 text-[9px] w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Max 10 Nodes</SelectItem>
                <SelectItem value="20">Max 20 Nodes</SelectItem>
                <SelectItem value="50">Max 50 Nodes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {sankeyAnalysisMode === "time-slice" && results?.quadInstancesAll.filter(q => q.slice === selectedSankeySlice).length === 0 ? (
            <div className="h-40 border-2 border-dashed rounded-xl flex items-center justify-center text-[10px] text-muted-foreground italic">
              No quad windows in this slice.
            </div>
          ) : sankeyData && sankeyData.links.length > 0 ? (
            <div className="h-[400px] w-full">
              <D3Sankey
                nodes={sankeyData.nodes}
                links={sankeyData.links}
                width={900}
                height={360}
                onLinkClick={(l) => {
                  const layerSource = parseInt(l.source.split("__L")[1]);
                  setSelectedSankeyLink({ source: l.source, target: l.target, layerSource });
                }}
              />
              <div className="flex justify-between px-10 text-[9px] font-bold opacity-40 uppercase mt-2">
                <span>Node (L0)</span>
                <span>Primary (L1)</span>
                <span>Secondary (L2)</span>
                <span>Tertiary (L3)</span>
              </div>
            </div>
          ) : (
            <div className="h-40 border-2 border-dashed rounded-xl flex items-center justify-center text-[10px] text-muted-foreground italic">
              {contentWordOnly ? "No content-word Sankey data. Try switching to All Words." : "Not enough data to render Sankey at this threshold."}
            </div>
          )}

          <Collapsible className="mt-6 border rounded-lg bg-muted/5">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full h-8 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between px-4 hover:bg-muted/10">
                Sankey Edge Table <ChevronDown className="h-3 w-3" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="p-4 pt-0 border-t">
              <ResultsTable 
                data={sankeyTableRows} 
                columns={[
                  { key: "source", label: "Source" },
                  { key: "target", label: "Target" },
                  { key: "weight", label: "Weight", sortable: true, align: "right" },
                  { key: "layer_source", label: "Layer S", align: "center" },
                  { key: "layer_target", label: "Layer T", align: "center" }
                ]} 
                filename={`sankey_edges_${nodeLemma}_${sankeyAnalysisMode}_${sankeyAnalysisMode === "time-slice" ? selectedSankeySlice : "all"}_${corpusScope}.csv`}
              />
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Card className="shadow-none border-amber-100 bg-amber-50/5">
        <CardHeader className="bg-amber-100/20 border-b border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">Quad Inventory (Node: {nodeLemma})</CardTitle>
            {selectedSankeyLink && (
              <Badge variant="secondary" className="h-6 gap-1 px-2 text-[9px] bg-primary/10 border-primary/20 text-primary animate-in fade-in zoom-in">
                Active Sankey filter: {selectedSankeyLink.source.split("__")[0]} → {selectedSankeyLink.target.split("__")[0]}
                <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => setSelectedSankeyLink(null)} />
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-muted p-0.5 rounded-md border shadow-inner">
              <Button variant={inventoryScope === "slice" ? "default" : "ghost"} size="sm" onClick={() => setInventoryScope("slice")} className="h-7 text-[9px] px-3">Current Slice</Button>
              <Button variant={inventoryScope === "all" ? "default" : "ghost"} size="sm" onClick={() => setInventoryScope("all")} className="h-7 text-[9px] px-3">All Slices</Button>
            </div>
            <div className="flex items-center gap-2 h-7 px-2 border rounded bg-background shadow-sm">
              <Label className="text-[9px] font-bold opacity-60">MIN FREQ</Label>
              <Input type="number" value={minFreq} onChange={e => setMinFreq(parseInt(e.target.value)||1)} className="h-5 w-12 text-[10px] p-0 text-center border-none shadow-none focus-visible:ring-0" />
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
              <Input placeholder="Search quads..." value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} className="h-7 text-[9px] pl-7 w-40" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <ResultsTable 
            data={inventoryRows} 
            columns={inventoryColumns} 
            onPin={(item) => setPinned(p => [...p, { label: item.quadKey, metric: item.count }])} 
            filename={`quad_inventory_${nodeLemma}_${inventoryScope}.csv`}
            metadata={{ node: nodeLemma, scope: inventoryScope, timeMode, minFreq }}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-none border-amber-100 bg-amber-50/5">
          <CardHeader className="bg-amber-100/20 border-b border-amber-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold">Top Quads: {activeSlice}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {topQuadsFiltered.length > 0 ? (
              viewMode === "constellation" ? (
                <div className="space-y-2">
                  {topQuadsFiltered.map((item: any) => (
                    <div key={item.quadKey} className={`group cursor-pointer p-1.5 rounded transition-all hover:bg-amber-100/30 ${selectedQuadKey === item.quadKey ? 'bg-amber-100/50 border border-amber-200' : 'border border-transparent'}`} onClick={() => setSelectedQuadKey(item.quadKey)}>
                      <div className="flex justify-between text-[10px] mb-1.5">
                        <span className="font-medium group-hover:text-primary transition-colors flex flex-wrap gap-1 items-center">
                          {item.quadKey.split("|").map((l: string, i: number) => (
                            <Badge key={i} variant={l === nodeLemma ? "default" : "outline"} className="h-4 px-1.5 text-[8px] font-bold tracking-tight">{l}</Badge>
                          ))}
                        </span>
                        <span className="opacity-60 font-mono text-[9px]">{item.count}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-amber-500/60 rounded-full transition-all group-hover:bg-amber-500" style={{ width: `${(item.count / topQuadsFiltered[0].count) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ResultsTable data={topQuadsFiltered} columns={[{ key: "quadKey", label: "Quad" }, { key: "count", label: "Freq", sortable: true, align: "right" }]} onPin={(item) => setPinned(p => [...p, { label: item.quadKey, metric: item.count }])} filename="slice_quads.csv" />
              )
            ) : (
              <div className="text-[10px] text-muted-foreground italic">No content-word quads in this slice. Try switching to All Words.</div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground px-1 flex items-center justify-between">
            Quad Drill-Down 
            {selectedQuadKey && <Button variant="ghost" size="sm" className="h-5 text-[9px] hover:bg-primary/10" onClick={() => exportToCsv(`quad_drilldown_${selectedQuadKey}.csv`, results?.quadExamplesObj[selectedQuadKey])}><Download className="h-3 w-3 mr-1" /> Export Contexts</Button>}
          </h4>
          {selectedQuadKey ? (
            <div className="space-y-2 max-h-[500px] overflow-auto pr-2 custom-scrollbar">
              <div className="p-3 mb-3 bg-primary/5 rounded border border-primary/10 text-[10px] font-bold text-primary flex items-center gap-2 shadow-sm"><LayoutGrid className="h-3.5 w-3.5"/> ACTIVE QUAD: {selectedQuadKey.replace(/\|/g, ' · ')}</div>
              {results?.quadExamplesObj[selectedQuadKey]?.map((ex: any, i: number) => (
                <div key={i} className="p-4 rounded-lg border bg-background text-[11px] leading-relaxed shadow-sm border-amber-100/60 hover:shadow-md transition-shadow">
                  <p className="mb-3 italic font-serif text-foreground/90">"...{ex.source.excerpt}"</p>
                  <div className="flex justify-between items-center text-[9px] font-bold opacity-70 uppercase border-t pt-2.5">
                    <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> {ex.source.title} | A: {ex.source.act} S: {ex.source.scene} | {ex.source.speaker}</span>
                    <Badge variant="outline" className="text-[8px] h-4 bg-muted/30">{ex.slice}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-[10px] text-muted-foreground italic gap-2 bg-muted/5">
              <ListFilter className="h-5 w-5 opacity-20" />
              Select a quad from the list to explore source instances
            </div>}
        </div>
      </div>

      <Card className="shadow-none border-muted/60">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Diachronic Stability</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={driftMetric} onValueChange={(v: any) => setDriftMetric(v)}>
              <SelectTrigger className="h-7 text-[10px] w-44 shadow-sm"><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="jaccard">Jaccard Index (Stability)</SelectItem><SelectItem value="size">Vocabulary Variety (Unique Quads)</SelectItem></SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={results?.driftTable}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="slice" fontSize={9} />
                <YAxis fontSize={9} />
                <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Line type="monotone" dataKey={driftMetric} name={driftMetric === 'jaccard' ? 'Stability' : 'Variety'} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(var(--primary))" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none border-muted/60">
        <CardHeader className="bg-muted/5 border-b flex flex-col md:flex-row md:items-center justify-between gap-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Network className="h-4 w-4 text-amber-500" /> Top Node Lemmas
          </CardTitle>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-muted p-0.5 rounded-md border shadow-inner">
              <Button variant={!contentWordOnly ? "default" : "ghost"} size="sm" onClick={() => setContentWordOnly(false)} className="h-7 text-[9px] px-3">All Words</Button>
              <Button variant={contentWordOnly ? "default" : "ghost"} size="sm" onClick={() => setContentWordOnly(true)} className="h-7 text-[9px] px-3">Content Only</Button>
            </div>
            <Label className="text-[9px] font-bold opacity-60">SHOW</Label>
            <Select value={topNodeLimit.toString()} onValueChange={(v) => setTopNodeLimit(Number(v) as 10 | 20 | 50)}>
              <SelectTrigger className="h-7 text-[9px] w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="50">Top 50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="pt-4 flex flex-wrap gap-2">
          {topNodeRows.length > 0 ? (
            topNodeRows.map((n: any) => (
              <Button
                key={n.lemma}
                variant={n.lemma === nodeLemma ? "default" : "outline"}
                size="sm"
                className="h-7 text-[10px] px-2 gap-2"
                onClick={() => setNodeLemma(n.lemma)}
                title={`Count: ${n.count}`}
              >
                <span className="font-semibold">{n.lemma}</span>
                <span className="opacity-60 font-mono">{n.count}</span>
              </Button>
            ))
          ) : (
            <div className="text-[10px] text-muted-foreground italic">No content-word lemmas. Try switching to All Words.</div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row items-center gap-4 p-4 border rounded-xl bg-card shadow-lg sticky bottom-0 z-10 backdrop-blur-md bg-background/95">
        <div className="space-y-1 flex-1 w-full">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest px-1">Active Node Lemma</Label>
          <div className="relative">
            <Network className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input value={nodeLemma} onChange={e => setNodeLemma(e.target.value)} className="h-9 text-xs w-full md:w-56 pl-8 font-medium shadow-inner" placeholder="Enter node lemma..."/>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 bg-muted/30 p-1 rounded-lg border shadow-inner">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 bg-background" onClick={() => setCurrentTimeIndex(p => Math.max(0, p - 1))} disabled={currentTimeIndex === 0}><ChevronLeft className="h-4 w-4"/></Button>
          <div className="text-center min-w-[110px] px-2"><p className="text-[9px] font-bold text-muted-foreground uppercase leading-none mb-1 opacity-60">{timeMode}</p><p className="text-sm font-bold text-primary">{activeSlice}</p></div>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 bg-background" onClick={() => setCurrentTimeIndex(p => Math.min((results?.sortedSlices.length || 1) - 1, p + 1))} disabled={currentTimeIndex === (results?.sortedSlices.length || 1) - 1}><ChevronRight className="h-4 w-4"/></Button>
        </div>
        <div className="shrink-0"><Button variant={isPlaying ? "destructive" : "default"} size="sm" onClick={() => setIsPlaying(!isPlaying)} className="h-9 gap-2 px-5 shadow-sm font-bold text-xs">{isPlaying ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4"/>} {isPlaying ? 'STOP SEQUENCE' : 'PLAY SEQUENCE'}</Button></div>
      </div>
    </div>
  );
};

export default function Analysis() {
  const ui = useUI();
  return (
    <MainLayout title="Linguistic Analysis">
      <Tabs defaultValue="discursive" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/50 p-1 border rounded-xl"><TabsTrigger value="lexical">Lexical</TabsTrigger><TabsTrigger value="semantic">Semantic</TabsTrigger><TabsTrigger value="discursive">Discursive</TabsTrigger></TabsList>
        <TabsContent value="lexical" className="animate-in fade-in duration-500"><LexicalTab /></TabsContent>
        <TabsContent value="semantic" className="animate-in fade-in duration-500"><SemanticTab /></TabsContent>
        <TabsContent value="discursive" className="animate-in fade-in duration-500"><DiscursiveTab /></TabsContent>
      </Tabs>
    </MainLayout>
  );
}
