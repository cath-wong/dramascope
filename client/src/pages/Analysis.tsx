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
import { Info, Download, Settings2, BarChart3, Table as TableIcon, Search, HelpCircle, TrendingUp, TrendingDown, History, Share2, ChevronLeft, ChevronRight, Play, Pause, Network } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { processTokens } from "@/utils/linguistics";
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
  ScatterChart,
  Scatter,
  ZAxis,
  LabelList,
  LineChart,
  Line
} from "recharts";

// --- Lexical Tab Component ---
const LexicalTab = () => {
  const { lines } = useData();
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker } = useUI();
  const computationCache = useRef<Map<string, any>>(new Map());
  const [lexSettings, setLexSettings] = useState({ stoplist: true, lemmatization: true, ngramSize: "2", collocQuery: "", collocWindow: 5, excludeStage: true, compareVerseProse: false });
  const [selectedCollocate, setSelectedCollocate] = useState<string | null>(null);

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
    const verseCounts = new Map<string, number>();
    const proseCounts = new Map<string, number>();
    let verseTotal = 0;
    let proseTotal = 0;

    scopedLines.forEach(l => {
      const tokens = processTokens(l.text_norm || "", { useStoplist: lexSettings.stoplist, useLemmas: lexSettings.lemmatization });
      tokens.forEach(t => {
        unigramCounts.set(t, (unigramCounts.get(t) || 0) + 1);
        totalTokens++;
        if (lexSettings.compareVerseProse) {
          if (l.unit === "verse_line" || l.unit === "verse") { verseCounts.set(t, (verseCounts.get(t) || 0) + 1); verseTotal++; }
          else if (l.unit === "prose_chunk" || l.unit === "prose") { proseCounts.set(t, (proseCounts.get(t) || 0) + 1); proseTotal++; }
        }
      });
    });
    if (totalTokens === 0) return { error: "No tokens found." };

    const freqList = Array.from(unigramCounts.entries()).map(([token, count]) => ({ token, count, per_10k: ((count / totalTokens) * 10000).toFixed(2) })).sort((a, b) => b.count - a.count).slice(0, topN);
    const nSize = parseInt(lexSettings.ngramSize);
    const ngramCounts = new Map<string, number>();
    scopedLines.forEach(l => {
      const tokens = processTokens(l.text_norm || "", { useStoplist: lexSettings.stoplist, useLemmas: lexSettings.lemmatization });
      for (let i = 0; i <= tokens.length - nSize; i++) { const gram = tokens.slice(i, i + nSize).join(" "); ngramCounts.set(gram, (ngramCounts.get(gram) || 0) + 1); }
    });
    const ngramList = Array.from(ngramCounts.entries()).map(([ngram, count]) => ({ ngram, count, per_10k: ((count / totalTokens) * 10000).toFixed(2) })).sort((a, b) => b.count - a.count).slice(0, topN);

    let collocList: any[] = [];
    let collocExamples: Map<string, any[]> = new Map();
    if (lexSettings.collocQuery) {
      const q = processTokens(lexSettings.collocQuery, { useStoplist: false, useLemmas: lexSettings.lemmatization })[0] || lexSettings.collocQuery.toLowerCase();
      const coocCounts = new Map<string, number>();
      scopedLines.forEach(l => {
        const tokens = processTokens(l.text_norm || "", { useStoplist: lexSettings.stoplist, useLemmas: lexSettings.lemmatization });
        tokens.forEach((t, i) => {
          if (t === q) {
            const start = Math.max(0, i - lexSettings.collocWindow), end = Math.min(tokens.length, i + lexSettings.collocWindow + 1);
            for (let j = start; j < end; j++) { if (i !== j) { const col = tokens[j]; coocCounts.set(col, (coocCounts.get(col) || 0) + 1); if (!collocExamples.has(col)) collocExamples.set(col, []); if (collocExamples.get(col)!.length < 5) collocExamples.get(col)!.push({ title: l.title || l.play_id, act: l.act, scene: l.scene, speaker: l.speaker, text: l.text_norm }); } }
          }
        });
      });
      collocList = Array.from(coocCounts.entries()).map(([collocate, count]) => ({ collocate, count, score: count })).sort((a, b) => b.count - a.count).slice(0, topN);
    }
    const output = { freqList, ngramList, collocList, collocExamples, totalTokens };
    computationCache.current.set(cacheKey, output);
    return output;
  }, [lines, corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, lexSettings]);

  if (results?.error) return <Alert variant="destructive"><Info className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{results.error}</AlertDescription></Alert>;
  return (
    <div className="space-y-6">
      <Alert className="bg-blue-500/10 border-blue-500/20"><Info className="h-4 w-4 text-blue-500" /><AlertTitle className="text-blue-700 font-semibold">Dataset: LINES ONLY</AlertTitle><AlertDescription className="text-blue-600/80 text-xs">Analysis of corpus_lines_real.csv.</AlertDescription></Alert>
      <Card><CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4" /> Parameters</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4"><div className="space-y-2"><div className="flex items-center space-x-2"><Checkbox id="l-stop" checked={lexSettings.stoplist} onCheckedChange={v => setLexSettings(s => ({...s, stoplist:!!v}))}/><Label htmlFor="l-stop" className="text-xs">Stoplist</Label></div><div className="flex items-center space-x-2"><Checkbox id="l-lemma" checked={lexSettings.lemmatization} onCheckedChange={v => setLexSettings(s => ({...s, lemmatization:!!v}))}/><Label htmlFor="l-lemma" className="text-xs">Lemmas</Label></div></div><div className="space-y-1"><Label className="text-[10px] uppercase font-bold">N-grams</Label><Select value={lexSettings.ngramSize} onValueChange={v => setLexSettings(s => ({...s, ngramSize:v}))}><SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="2">Bigrams</SelectItem><SelectItem value="3">Trigrams</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Collocation</Label><Input placeholder="Query..." value={lexSettings.collocQuery} onChange={e => setLexSettings(s => ({...s, collocQuery:e.target.value}))} className="h-8 text-xs"/></div><div className="space-y-1"><Label className="text-[10px] uppercase font-bold">Window</Label><Input type="number" value={lexSettings.collocWindow} onChange={e => setLexSettings(s => ({...s, collocWindow:parseInt(e.target.value)||1}))} className="h-8 text-xs"/></div></CardContent></Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="shadow-none"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm">Word Frequencies</CardTitle><Button variant="outline" size="icon" onClick={() => exportToCsv("lex_freq.csv", results?.freqList || [])} className="h-7 w-7"><Download className="h-3 w-3"/></Button></CardHeader>
        <CardContent className="space-y-4"><div className="h-[200px]"><ResponsiveContainer><BarChart data={results?.freqList.slice(0, 10)}><XAxis dataKey="token" fontSize={9}/><Tooltip/><Bar dataKey="count" fill="hsl(var(--primary))"/></BarChart></ResponsiveContainer></div><div className="max-h-[200px] overflow-auto border rounded-md"><Table><TableHeader className="bg-muted/50 sticky top-0"><TableRow><TableHead className="h-8 text-[10px]">Token</TableHead><TableHead className="h-8 text-[10px] text-right">Count</TableHead></TableRow></TableHeader><TableBody>{results?.freqList.map((item, i) => (<TableRow key={i} className="h-8"><TableCell className="py-1 text-[10px]">{item.token}</TableCell><TableCell className="py-1 text-[10px] text-right">{item.count}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
        <Card className="shadow-none"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm">{lexSettings.ngramSize}-grams</CardTitle><Button variant="outline" size="icon" onClick={() => exportToCsv("lex_ngrams.csv", results?.ngramList || [])} className="h-7 w-7"><Download className="h-3 w-3"/></Button></CardHeader><CardContent><div className="max-h-[400px] overflow-auto border rounded-md"><Table><TableHeader className="bg-muted/50 sticky top-0"><TableRow><TableHead className="h-8 text-[10px]">Sequence</TableHead><TableHead className="h-8 text-[10px] text-right">Count</TableHead></TableRow></TableHeader><TableBody>{results?.ngramList.map((item, i) => (<TableRow key={i} className="h-8"><TableCell className="py-1 text-[10px] font-mono">{item.ngram}</TableCell><TableCell className="py-1 text-[10px] text-right">{item.count}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
      </div>
    </div>
  );
};

// --- Semantic Tab Component ---
const SemanticTab = () => {
  const { speeches } = useData();
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, timeMode } = useUI();
  const [targetTerm, setTargetTerm] = useState("");
  const [measure, setMeasure] = useState("pmi");
  const [useStoplist, setUseStoplist] = useState(true);
  const [useLemmas, setUseLemmas] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const computationCache = useRef<Map<string, any>>(new Map());

  const results = useMemo(() => {
    if (!targetTerm) return null;
    const filtered = speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      if (selectedGenre && s.genre !== selectedGenre) return false;
      if (selectedSpeaker && s.speaker !== selectedSpeaker) return false;
      return true;
    });
    const cacheKey = JSON.stringify({ scope: corpusScope, title: selectedPlayTitle, target: targetTerm, measure, stoplist: useStoplist, lemmas: useLemmas });
    if (computationCache.current.has(cacheKey)) return computationCache.current.get(cacheKey);

    const qProcessed = processTokens(targetTerm, { useStoplist: false, useLemmas });
    const q = qProcessed[0] || targetTerm.toLowerCase();
    const globalCounts = new Map<string, number>();
    let totalTokens = 0;
    const speechTokens = filtered.map(s => {
      const tokens = processTokens(s.text_raw || s.text_norm || "", { useStoplist, useLemmas });
      tokens.forEach(t => { globalCounts.set(t, (globalCounts.get(t) || 0) + 1); totalTokens++; });
      return { ...s, tokens };
    });
    const qFreq = globalCounts.get(q) || 0;
    if (qFreq === 0) return { error: `Term "${q}" not found.` };

    const coocCounts = new Map<string, number>(), examples = new Map<string, any[]>();
    speechTokens.forEach(s => {
      s.tokens.forEach((t, i) => {
        if (t === q) {
          const start = Math.max(0, i - 10), end = Math.min(s.tokens.length, i + 11);
          for (let j = start; j < end; j++) {
            if (i === j) continue;
            const col = s.tokens[j]; coocCounts.set(col, (coocCounts.get(col) || 0) + 1);
            if (!examples.has(col)) examples.set(col, []);
            if (examples.get(col)!.length < 5) examples.get(col)!.push({ title: s.title || s.play_id, speaker: s.speaker, text: s.text_raw || s.text_norm || "" });
          }
        }
      });
    });

    const associationList = Array.from(coocCounts.entries()).map(([term, count]) => {
      const termFreq = globalCounts.get(term) || 1;
      let score = measure === "pmi" ? Math.log2((count/totalTokens)/((qFreq/totalTokens)*(termFreq/totalTokens))) : count;
      return { term, count, score: parseFloat(score.toFixed(3)) };
    }).filter(a => a.count > 1).sort((a, b) => b.score - a.score).slice(0, topN);

    const output = { associationList, examples };
    computationCache.current.set(cacheKey, output);
    return output;
  }, [speeches, targetTerm, corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, measure, useStoplist, useLemmas]);

  return (
    <div className="space-y-6">
      <Alert className="bg-purple-500/10 border-purple-500/20"><Info className="h-4 w-4 text-purple-500" /><AlertTitle className="text-purple-700 font-semibold">Dataset: SPEECHES ONLY</AlertTitle></Alert>
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Semantic Target</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4"><Input placeholder="Term..." value={targetTerm} onChange={e => setTargetTerm(e.target.value)} className="h-8 text-xs"/><Select value={measure} onValueChange={setMeasure}><SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pmi">PMI</SelectItem><SelectItem value="count">Count</SelectItem></SelectContent></Select><div className="flex items-center space-x-2"><Checkbox id="s-stop" checked={useStoplist} onCheckedChange={v => setUseStoplist(!!v)}/><Label htmlFor="s-stop" className="text-xs">Stoplist</Label></div></CardContent></Card>
      {targetTerm && results?.associationList && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="shadow-none"><CardHeader><CardTitle className="text-sm">Associations</CardTitle></CardHeader>
          <CardContent><div className="max-h-[300px] overflow-auto border rounded-md"><Table><TableHeader className="bg-muted/50 sticky top-0"><TableRow><TableHead className="h-8 text-[10px]">Term</TableHead><TableHead className="h-8 text-[10px] text-right">Score</TableHead></TableRow></TableHeader><TableBody>{results.associationList.map((item, i) => (<TableRow key={i} className={`h-8 cursor-pointer ${selectedTerm === item.term ? 'bg-primary/10' : ''}`} onClick={() => setSelectedTerm(item.term)}><TableCell className="py-1 text-[10px] font-medium">{item.term}</TableCell><TableCell className="py-1 text-[10px] text-right font-bold text-primary">{item.score}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
          <div className="space-y-2">{selectedTerm && results.examples.get(selectedTerm)?.map((ex, i) => (<Card key={i} className="p-3 text-[10px] italic">"{ex.text.substring(0, 150)}..."<div className="mt-1 font-bold">{ex.title} | {ex.speaker}</div></Card>))}</div>
        </div>
      )}
    </div>
  );
};

// --- Discursive Concepts Tab Component ---
const DiscursiveTab = () => {
  const { speeches } = useData();
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, timeMode } = useUI();

  const [nodeLemma, setNodeLemma] = useState("lord");
  const [tokenSpan, setTokenSpan] = useState(100);
  const [topPairsP, setTopPairsP] = useState(20);
  const [useStoplist, setUseStoplist] = useState(true);
  const [useLemmas, setUseLemmas] = useState(true);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const quadCache = useRef<Map<string, any>>(new Map());

  const getTimeSlice = (s: any) => (timeMode === "year" ? s.year_est || s.year_mid || s.year_min || "Unknown" : s.decade || s.decade_num || "Unknown");

  const results = useMemo(() => {
    const filtered = speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      if (selectedGenre && s.genre !== selectedGenre) return false;
      if (selectedSpeaker && s.speaker !== selectedSpeaker) return false;
      return true;
    });

    const cacheKey = JSON.stringify({ scope: corpusScope, title: selectedPlayTitle, node: nodeLemma, span: tokenSpan, p: topPairsP, stop: useStoplist, lem: useLemmas, time: timeMode });
    if (quadCache.current.has(cacheKey)) return quadCache.current.get(cacheKey);

    // 1. Process speeches into quads
    const quadsByTime = new Map<string, any[]>();
    const allSlices = new Set<string>();

    filtered.forEach(s => {
      const tokens = processTokens(s.text_raw || s.text_norm || "", { useStoplist, useLemmas }).slice(0, tokenSpan);
      if (tokens.length < 4) return;
      const slice = String(getTimeSlice(s));
      if (slice === "Unknown") return;
      allSlices.add(slice);

      // Preprocessing note: Using "Unique-token-in-speech" approach for quad candidate pairs.
      const uniqueTokens = Array.from(new Set(tokens));
      const pairs: [string, string][] = [];
      for (let i = 0; i < uniqueTokens.length; i++) {
        for (let j = i + 1; j < uniqueTokens.length; j++) {
          pairs.push([uniqueTokens[i], uniqueTokens[j]].sort() as [string, string]);
        }
      }

      // Sample P pairs (in this pilot, we just take first P as we don't have complex scoring per speech yet)
      const topPairs = pairs.slice(0, topPairsP);
      
      // Form candidate quads: pairs sharing one lemma, union has 4 unique
      const quadsInSpeech: Set<string> = new Set();
      for (let i = 0; i < topPairs.length; i++) {
        for (let j = i + 1; j < topPairs.length; j++) {
          const p1 = topPairs[i], p2 = topPairs[j];
          const union = Array.from(new Set([...p1, ...p2])).sort();
          if (union.length === 4) {
            const shared = p1.filter(t => p2.includes(t));
            if (shared.length === 1) {
              quadsInSpeech.add(union.join("|"));
            }
          }
        }
      }

      if (!quadsByTime.has(slice)) quadsByTime.set(slice, []);
      quadsInSpeech.forEach(qStr => {
        quadsByTime.get(slice)!.push({ terms: qStr.split("|"), speaker: s.speaker, title: s.title || s.play_id, act: s.act, scene: s.scene, text: s.text_raw || s.text_norm || "" });
      });
    });

    const sortedSlices = Array.from(allSlices).sort((a, b) => a.localeCompare(b));
    
    // 2. Compute diachronic metrics
    const driftTable = sortedSlices.map((slice, idx) => {
      const sliceQuads = quadsByTime.get(slice) || [];
      const nodeQuads = sliceQuads.filter(q => q.terms.includes(nodeLemma));
      const coLemmas = new Map<string, number>();
      nodeQuads.forEach(q => q.terms.filter(t => t !== nodeLemma).forEach(t => coLemmas.set(t, (coLemmas.get(t) || 0) + 1)));
      
      const topCoLemmas = Array.from(coLemmas.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
      
      // Jaccard similarity to previous
      let jaccard = 0;
      if (idx > 0) {
        const prevSlice = sortedSlices[idx - 1];
        const prevQuads = quadsByTime.get(prevSlice) || [];
        const prevNodeQuads = prevQuads.filter(q => q.terms.includes(nodeLemma));
        const prevCoLemmas = new Set(prevNodeQuads.flatMap(q => q.terms.filter(t => t !== nodeLemma)));
        const currCoLemmas = new Set(coLemmas.keys());
        const intersection = Array.from(currCoLemmas).filter(t => prevCoLemmas.has(t));
        const union = new Set([...Array.from(currCoLemmas), ...Array.from(prevCoLemmas)]);
        jaccard = union.size > 0 ? intersection.length / union.size : 0;
      }

      return { slice, size: coLemmas.size, top: topCoLemmas, jaccard: parseFloat(jaccard.toFixed(3)), quads: nodeQuads };
    });

    const output = { sortedSlices, driftTable, quadsByTime };
    quadCache.current.set(cacheKey, output);
    return output;
  }, [speeches, corpusScope, selectedPlayTitle, nodeLemma, tokenSpan, topPairsP, useStoplist, useLemmas, timeMode]);

  // Animation effect
  useEffect(() => {
    let interval: any;
    if (isPlaying && results?.sortedSlices.length) {
      interval = setInterval(() => {
        setCurrentTimeIndex(prev => (prev + 1) % results.sortedSlices.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, results?.sortedSlices.length]);

  const activeSliceData = useMemo(() => {
    if (!results || !results.sortedSlices.length) return null;
    return results.driftTable[currentTimeIndex];
  }, [results, currentTimeIndex]);

  if (!results?.sortedSlices.length) return <div className="py-12 text-center text-muted-foreground">No discursive data found for this scope/lemma.</div>;

  return (
    <div className="space-y-6">
      <Alert className="bg-amber-500/10 border-amber-500/20"><Info className="h-4 w-4 text-amber-500" /><AlertTitle className="text-amber-700 font-semibold">Dataset: SPEECHES ONLY (Quads)</AlertTitle><AlertDescription className="text-amber-600/80 text-xs italic">Preprocessing: Unique-token-in-speech co-occurrence within first {tokenSpan} tokens.</AlertDescription></Alert>

      <Card><CardHeader className="pb-3 bg-muted/5 border-b"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-amber-500" /> Discursive Parameters</CardTitle></CardHeader>
      <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6"><div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Node Lemma</Label><Input value={nodeLemma} onChange={e => setNodeLemma(e.target.value)} className="h-9 text-xs" /></div><div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Token Span</Label><Input type="number" value={tokenSpan} onChange={e => setTokenSpan(parseInt(e.target.value)||10)} className="h-9 text-xs" /></div><div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Top Pairs P</Label><Input type="number" value={topPairsP} onChange={e => setTopPairsP(parseInt(e.target.value)||1)} className="h-9 text-xs" /></div></CardContent></Card>

      {/* Time Navigator */}
      <div className="flex items-center justify-between bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setCurrentTimeIndex(p => Math.max(0, p - 1))} disabled={currentTimeIndex === 0}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="text-center min-w-[120px]">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block leading-none mb-1">{timeMode} Slice</span>
            <span className="text-sm font-bold text-primary">{results.sortedSlices[currentTimeIndex]}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCurrentTimeIndex(p => Math.min(results.sortedSlices.length - 1, p + 1))} disabled={currentTimeIndex === results.sortedSlices.length - 1}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={isPlaying ? "destructive" : "default"} size="sm" onClick={() => setIsPlaying(!isPlaying)} className="gap-2 h-9 px-4">{isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {isPlaying ? "Stop" : "Play Sequence"}</Button>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("discursive_edges.csv", activeSliceData?.top || [])} className="h-9 text-[10px] gap-1.5"><Download className="h-3 w-3" /> Export Slice</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Constellation View */}
        <Card className="shadow-none border-amber-100 bg-amber-50/10">
          <CardHeader className="bg-amber-100/30 border-b border-amber-100"><CardTitle className="text-sm font-bold flex items-center gap-2"><Network className="h-4 w-4 text-amber-600" /> Constellation: {nodeLemma}</CardTitle></CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              {activeSliceData?.top.map(([term, weight]) => (
                <div key={term} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold w-16 truncate">{term}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${(weight / activeSliceData.top[0][1]) * 100}%` }} /></div>
                  <span className="text-[10px] font-mono w-8 text-right">{weight}</span>
                </div>
              ))}
            </div>
            <div className="max-h-[300px] overflow-auto border rounded-md bg-background mt-4">
              <Table><TableHeader><TableRow><TableHead className="h-8 text-[9px]">Term</TableHead><TableHead className="h-8 text-[9px] text-right">Weight</TableHead></TableRow></TableHeader>
              <TableBody>{activeSliceData?.top.map(([term, weight]) => (<TableRow key={term} className="h-8"><TableCell className="py-1 text-[10px] font-medium">{term}</TableCell><TableCell className="py-1 text-[10px] text-right tabular-nums">{weight}</TableCell></TableRow>))}</TableBody></Table>
            </div>
          </CardContent>
        </Card>

        {/* Traceability */}
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest px-1">Example Quads in Slice</h4>
          <div className="space-y-2.5 max-h-[600px] overflow-auto pr-2 custom-scrollbar">
            {activeSliceData?.quads.slice(0, 10).map((q: any, i: number) => (
              <div key={i} className="p-4 rounded-lg border bg-background text-[11px] leading-relaxed shadow-sm border-amber-100">
                <div className="flex flex-wrap gap-1 mb-2">{q.terms.map((t: string) => <Badge key={t} variant={t === nodeLemma ? "default" : "secondary"} className="text-[8px] h-4 px-1">{t}</Badge>)}</div>
                <p className="font-serif italic text-foreground/80">"...{q.text.substring(0, 150)}..."</p>
                <div className="mt-2 text-[9px] text-muted-foreground border-t pt-1.5 uppercase font-bold">{q.title} | {q.speaker}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Diachronic Drift Chart */}
      <Card className="shadow-none border-muted/60 bg-muted/5">
        <CardHeader className="bg-muted/10 border-b"><CardTitle className="text-sm font-bold">Diachronic Stability (Jaccard Index)</CardTitle></CardHeader>
        <CardContent className="pt-6">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={results.driftTable} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="slice" fontSize={9} />
                <YAxis fontSize={9} domain={[0, 1]} />
                <Tooltip contentStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="jaccard" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 border rounded-lg overflow-hidden bg-background">
            <Table><TableHeader className="bg-muted/50"><TableRow><TableHead className="h-8 text-[9px]">Time Slice</TableHead><TableHead className="h-8 text-[9px] text-right">Const. Size</TableHead><TableHead className="h-8 text-[9px] text-right">Jaccard (Prev)</TableHead></TableRow></TableHeader>
            <TableBody>{results.driftTable.map((d: any) => (<TableRow key={d.slice} className={`h-8 ${results.sortedSlices[currentTimeIndex] === d.slice ? 'bg-primary/5' : ''}`}><TableCell className="py-1 text-[10px] font-medium">{d.slice}</TableCell><TableCell className="py-1 text-[10px] text-right tabular-nums">{d.size}</TableCell><TableCell className="py-1 text-[10px] text-right tabular-nums">{d.jaccard}</TableCell></TableRow>))}</TableBody></Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// --- Analysis Page ---
export default function Analysis() {
  const { corpusScope, selectedPlayTitle, timeMode, topN, selectedGenre, selectedSpeaker } = useUI();
  return (
    <MainLayout title="Linguistic Analysis">
      <div className="space-y-6">
        <Card className="bg-muted/30 border-dashed shadow-none"><CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0"><CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-2"><HelpCircle className="h-3 w-3" /> Parameters Summary</CardTitle><Badge variant="outline" className="text-[9px] h-4 font-normal opacity-60">Step 8 Active</Badge></CardHeader>
        <CardContent className="py-0 px-4 pb-4"><div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]"><div className="flex gap-2 items-center"><span className="text-muted-foreground">Scope:</span><Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px]">{corpusScope === "play" ? `Play: ${selectedPlayTitle}` : "Full Corpus"}</Badge></div><div className="flex gap-2 items-center"><span className="text-muted-foreground">Time:</span><Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px] capitalize">{timeMode}</Badge></div><div className="flex gap-2 items-center"><span className="text-muted-foreground">Top-N:</span><Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px]">{topN}</Badge></div>{selectedGenre && <div className="flex gap-2 items-center"><span className="text-muted-foreground">Genre:</span><Badge variant="outline" className="h-4 px-1.5 py-0 text-[9px]">{selectedGenre}</Badge></div>}</div></CardContent></Card>
        <Tabs defaultValue="lexical" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/50 p-1"><TabsTrigger value="lexical">Lexical</TabsTrigger><TabsTrigger value="semantic">Semantic</TabsTrigger><TabsTrigger value="discursive">Discursive Concepts</TabsTrigger></TabsList>
          <TabsContent value="lexical" className="mt-0 animate-in fade-in duration-300"><LexicalTab /></TabsContent>
          <TabsContent value="semantic" className="mt-0 animate-in fade-in duration-300"><SemanticTab /></TabsContent>
          <TabsContent value="discursive" className="mt-0 animate-in fade-in duration-300"><DiscursiveTab /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
