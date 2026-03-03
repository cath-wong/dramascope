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

// --- Discursive Concepts Tab Component (Refactored 8.5) ---
const DiscursiveTab = () => {
  const { speeches } = useData();
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, timeMode } = useUI();

  const [nodeLemma, setNodeLemma] = useState("lord");
  const [useStoplist, setUseStoplist] = useState(true);
  const [useLemmas, setUseLemmas] = useState(true);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedCoLemma, setSelectedCoLemma] = useState<string | null>(null);

  const quadCache = useRef<Map<string, any>>(new Map());

  const getTimeSlice = (s: any) => (timeMode === "year" ? s.year_est || s.year_mid || s.year_min || "Unknown" : s.decade || s.decade_num || "Unknown");

  const results = useMemo(() => {
    const filtered = speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      if (selectedGenre && s.genre !== selectedGenre) return false;
      if (selectedSpeaker && s.speaker !== selectedSpeaker) return false;
      return true;
    });

    const cacheKey = JSON.stringify({ scope: corpusScope, title: selectedPlayTitle, node: nodeLemma, stop: useStoplist, lem: useLemmas, time: timeMode, topN });
    if (quadCache.current.has(cacheKey)) return quadCache.current.get(cacheKey);

    // 1. Process speeches into tokens and compute global top nodes for browse list
    const lemmaFreqs = new Map<string, { count: number; speeches: Set<number> }>();
    const speechTokens = filtered.map((s, idx) => {
      const tokens = processTokens(s.text_raw || s.text_norm || "", { useStoplist, useLemmas });
      tokens.forEach(t => {
        if (!lemmaFreqs.has(t)) lemmaFreqs.set(t, { count: 0, speeches: new Set() });
        const entry = lemmaFreqs.get(t)!;
        entry.count++;
        entry.speeches.add(idx);
      });
      return { ...s, tokens, time: String(getTimeSlice(s)) };
    });

    const topNodes = Array.from(lemmaFreqs.entries())
      .map(([lemma, data]) => ({ lemma, count: data.count, speeches: data.speeches.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // 2. Node-Centred Windowing logic (±50 tokens)
    const activeNode = nodeLemma.trim().toLowerCase();
    const quadsByTime = new Map<string, any[]>();
    const allSlices = new Set<string>();
    const edgeExamples = new Map<string, any[]>();

    speechTokens.forEach(s => {
      if (s.time === "Unknown") return;
      allSlices.add(s.time);

      const nodeIndices = s.tokens.reduce((acc: number[], t, i) => {
        if (t === activeNode) acc.push(i);
        return acc;
      }, []);

      if (nodeIndices.length === 0) return;

      const coocInSlice = new Map<string, number>();

      nodeIndices.forEach(idx => {
        const start = Math.max(0, idx - 50);
        const end = Math.min(s.tokens.length, idx + 51);
        const windowTokens = s.tokens.slice(start, end);

        windowTokens.forEach(t => {
          if (t === activeNode) return;
          coocInSlice.set(t, (coocInSlice.get(t) || 0) + 1);
          
          const exampleKey = `${activeNode}|${t}`;
          if (!edgeExamples.has(exampleKey)) edgeExamples.set(exampleKey, []);
          if (edgeExamples.get(exampleKey)!.length < 5) {
            edgeExamples.get(exampleKey)!.push({
              title: s.title || s.play_id,
              act: s.act,
              scene: s.scene,
              speaker: s.speaker,
              text: s.text_raw || s.text_norm || ""
            });
          }
        });
      });

      if (!quadsByTime.has(s.time)) quadsByTime.set(s.time, []);
      quadsByTime.get(s.time)!.push({ node: activeNode, cooc: coocInSlice });
    });

    const sortedSlices = Array.from(allSlices).sort((a, b) => a.localeCompare(b));
    
    // 3. Aggregate per slice
    const driftTable = sortedSlices.map((slice, idx) => {
      const sliceData = quadsByTime.get(slice) || [];
      const aggregatedCooc = new Map<string, number>();
      sliceData.forEach(sd => {
        sd.cooc.forEach((count: number, term: string) => {
          aggregatedCooc.set(term, (aggregatedCooc.get(term) || 0) + count);
        });
      });

      const sortedCooc = Array.from(aggregatedCooc.entries()).sort((a, b) => b[1] - a[1]);
      const top3 = sortedCooc.slice(0, 3).map(([t]) => t);
      const topNCooc = sortedCooc.slice(0, topN);

      // Jaccard similarity to previous
      let jaccard = 0;
      if (idx > 0) {
        const prevCooc = driftTable[idx - 1].aggregatedCooc;
        const prevSet = new Set(Array.from(prevCooc.keys()).slice(0, topN));
        const currSet = new Set(topNCooc.map(([t]) => t));
        const intersection = Array.from(currSet).filter(t => prevSet.has(t));
        const union = new Set([...Array.from(currSet), ...Array.from(prevSet)]);
        jaccard = union.size > 0 ? intersection.length / union.size : 0;
      }

      return { 
        slice, 
        size: aggregatedCooc.size, 
        topN: topNCooc, 
        top3, 
        jaccard: parseFloat(jaccard.toFixed(3)),
        aggregatedCooc // stored for Jaccard next pass
      };
    });

    const output = { sortedSlices, driftTable, topNodes, edgeExamples };
    quadCache.current.set(cacheKey, output);
    return output;
  }, [speeches, corpusScope, selectedPlayTitle, nodeLemma, useStoplist, useLemmas, timeMode, topN]);

  useEffect(() => {
    let interval: any;
    if (isPlaying && results?.sortedSlices.length) {
      interval = setInterval(() => setCurrentTimeIndex(prev => (prev + 1) % results.sortedSlices.length), 1500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, results?.sortedSlices.length]);

  const activeSliceData = useMemo(() => results?.driftTable[currentTimeIndex], [results, currentTimeIndex]);

  if (!results || results.sortedSlices.length === 0) return <div className="py-12 text-center text-muted-foreground">Node lemma "{nodeLemma}" not found in current scope.</div>;

  return (
    <div className="space-y-6">
      <Alert className="bg-amber-500/10 border-amber-500/20">
        <Info className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-700 font-semibold">Node-Centred ±50 Window Model (Step 8.5 Refinement)</AlertTitle>
        <AlertDescription className="text-amber-600/80 text-xs italic">
          Preprocessing: Symmetry window ±50 tokens from each occurrence of "{nodeLemma}". Overlaps allowed.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 shadow-none border-muted/60">
          <CardHeader className="pb-2 bg-muted/5 border-b"><CardTitle className="text-[10px] uppercase font-bold text-muted-foreground">Top Scoped Nodes</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-[400px] overflow-auto">
            <Table>
              <TableBody>
                {results.topNodes.map(n => (
                  <TableRow key={n.lemma} className={`h-8 cursor-pointer ${nodeLemma === n.lemma ? 'bg-amber-50' : 'hover:bg-muted/30'}`} onClick={() => setNodeLemma(n.lemma)}>
                    <TableCell className="py-1 text-[10px] font-medium">{n.lemma}</TableCell>
                    <TableCell className="py-1 text-[10px] text-right text-muted-foreground">{n.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-none border-muted/60">
          <CardHeader className="pb-3 bg-muted/5 border-b"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-amber-500" /> Discursive Controls</CardTitle></CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Node Lemma</Label><Input value={nodeLemma} onChange={e => setNodeLemma(e.target.value)} className="h-9 text-xs" /></div>
            <div className="flex items-center gap-4 pt-6"><div className="flex items-center space-x-2"><Checkbox id="d-stop" checked={useStoplist} onCheckedChange={v => setUseStoplist(!!v)}/><Label htmlFor="d-stop" className="text-xs">Stoplist</Label></div><div className="flex items-center space-x-2"><Checkbox id="d-lemma" checked={useLemmas} onCheckedChange={v => setUseLemmas(!!v)}/><Label htmlFor="d-lemma" className="text-xs">Lemmatize</Label></div></div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Current Slice Quad (Top 3)</Label><div className="flex gap-1.5">{activeSliceData?.top3.map(t => <Badge key={t} variant="outline" className="text-[9px] bg-amber-50/50">{t}</Badge>)}</div></div>
          </CardContent>
        </Card>
      </div>

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
          <Button variant={isPlaying ? "destructive" : "default"} size="sm" onClick={() => setIsPlaying(!isPlaying)} className="h-9 gap-2">{isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {isPlaying ? "Stop" : "Play"}</Button>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("drift_metrics.csv", results.driftTable)} className="h-9 text-[10px] gap-1.5"><Download className="h-3 w-3" /> Export Drift</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-none border-amber-100 bg-amber-50/5">
          <CardHeader className="bg-amber-100/20 border-b border-amber-100"><CardTitle className="text-sm font-bold flex items-center gap-2"><Network className="h-4 w-4 text-amber-600" /> Constellation: {nodeLemma} ({results.sortedSlices[currentTimeIndex]})</CardTitle></CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="max-h-[400px] overflow-auto border rounded-md bg-background shadow-sm">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0"><TableRow><TableHead className="h-8 text-[9px]">Neighbour Lemma</TableHead><TableHead className="h-8 text-[9px] text-right">Window Cooc</TableHead></TableRow></TableHeader>
                <TableBody>
                  {activeSliceData?.topN.map(([term, weight]) => (
                    <TableRow key={term} className={`h-8 cursor-pointer ${selectedCoLemma === term ? 'bg-amber-100/50' : 'hover:bg-amber-50/50'}`} onClick={() => setSelectedCoLemma(term)}>
                      <TableCell className="py-1 text-[10px] font-medium">{term}</TableCell>
                      <TableCell className="py-1 text-[10px] text-right tabular-nums">{weight}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest px-1">Window Traceability (±50 tokens)</h4>
          {selectedCoLemma ? (
            <div className="space-y-2.5 max-h-[500px] overflow-auto pr-2 custom-scrollbar">
              {results.edgeExamples.get(`${nodeLemma.trim().toLowerCase()}|${selectedCoLemma}`)?.map((ex: any, i: number) => (
                <div key={i} className="p-4 rounded-lg border bg-background text-[11px] leading-relaxed shadow-sm border-amber-100">
                  <p className="font-serif italic text-foreground/90">"...{ex.text.substring(0, 250)}..."</p>
                  <div className="mt-2 text-[9px] text-muted-foreground border-t pt-2 uppercase font-bold">{ex.title} | {ex.speaker}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center border rounded-xl border-dashed bg-muted/5 text-[10px] text-muted-foreground italic min-h-[300px]">
              <Search className="w-6 h-6 opacity-10 mb-2" />
              Select a neighbour lemma to view source windows
            </div>
          )}
        </div>
      </div>

      <Card className="shadow-none border-muted/60">
        <CardHeader className="bg-muted/5 border-b"><CardTitle className="text-sm font-bold">Diachronic Stability ({timeMode} Mode)</CardTitle></CardHeader>
        <CardContent className="pt-6">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={results.driftTable}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="slice" fontSize={9} />
                <YAxis fontSize={9} domain={[0, 1]} />
                <Tooltip contentStyle={{ fontSize: '10px' }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="jaccard" name="Jaccard Stability (vs Prev)" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
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
        <Card className="bg-muted/30 border-dashed shadow-none"><CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0"><CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-2"><HelpCircle className="h-3 w-3" /> Parameters Summary</CardTitle><Badge variant="outline" className="text-[9px] h-4 font-normal opacity-60">Step 8.5 Active</Badge></CardHeader>
        <CardContent className="py-0 px-4 pb-4"><div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]"><div className="flex gap-2 items-center"><span className="text-muted-foreground">Scope:</span><Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px]">{corpusScope === "play" ? `Play: ${selectedPlayTitle}` : "Full Corpus"}</Badge></div>
              <div className="flex gap-2 items-center"><span className="text-muted-foreground">Time:</span><Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px] capitalize">{timeMode}</Badge></div>
              <div className="flex gap-2 items-center"><span className="text-muted-foreground">Top-N:</span><Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px]">{topN}</Badge></div>{selectedGenre && <div className="flex gap-2 items-center"><span className="text-muted-foreground">Genre:</span><Badge variant="outline" className="h-4 px-1.5 py-0 text-[9px]">{selectedGenre}</Badge></div>}</div></CardContent></Card>
        <Tabs defaultValue="discursive" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/50 p-1"><TabsTrigger value="lexical">Lexical</TabsTrigger><TabsTrigger value="semantic">Semantic</TabsTrigger><TabsTrigger value="discursive">Discursive Concepts</TabsTrigger></TabsList>
          <TabsContent value="lexical" className="mt-0 animate-in fade-in duration-300"><LexicalTab /></TabsContent>
          <TabsContent value="semantic" className="mt-0 animate-in fade-in duration-300"><SemanticTab /></TabsContent>
          <TabsContent value="discursive" className="mt-0 animate-in fade-in duration-300"><DiscursiveTab /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
