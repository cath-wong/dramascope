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
import { Info, Download, Settings2, BarChart3, Table as TableIcon, Search, HelpCircle, TrendingUp, TrendingDown, History, Share2 } from "lucide-react";
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
  LabelList
} from "recharts";

// --- Lexical Tab Component (Restored from Step 6) ---

const LexicalTab = () => {
  const { lines } = useData(); // LINES ONLY
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker } = useUI();
  
  const computationCache = useRef<Map<string, any>>(new Map());

  const [lexSettings, setLexSettings] = useState({
    stoplist: true,
    lemmatization: true,
    ngramSize: "2",
    collocQuery: "",
    collocWindow: 5,
    excludeStage: true,
    compareVerseProse: false
  });

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

    if (totalTokens === 0) return { error: "No tokens found. Adjust filters or check data." };

    const freqList = Array.from(unigramCounts.entries())
      .map(([token, count]) => ({ token, count, per_10k: ((count / totalTokens) * 10000).toFixed(2) }))
      .sort((a, b) => b.count - a.count).slice(0, topN);

    const nSize = parseInt(lexSettings.ngramSize);
    const ngramCounts = new Map<string, number>();
    scopedLines.forEach(l => {
      const tokens = processTokens(l.text_norm || "", { useStoplist: lexSettings.stoplist, useLemmas: lexSettings.lemmatization });
      for (let i = 0; i <= tokens.length - nSize; i++) {
        const gram = tokens.slice(i, i + nSize).join(" ");
        ngramCounts.set(gram, (ngramCounts.get(gram) || 0) + 1);
      }
    });
    const ngramList = Array.from(ngramCounts.entries())
      .map(([ngram, count]) => ({ ngram, count, per_10k: ((count / totalTokens) * 10000).toFixed(2) }))
      .sort((a, b) => b.count - a.count).slice(0, topN);

    let collocList: any[] = [];
    let collocExamples: Map<string, any[]> = new Map();
    if (lexSettings.collocQuery) {
      const q = processTokens(lexSettings.collocQuery, { useStoplist: false, useLemmas: lexSettings.lemmatization })[0] || lexSettings.collocQuery.toLowerCase();
      const coocCounts = new Map<string, number>();
      scopedLines.forEach(l => {
        const tokens = processTokens(l.text_norm || "", { useStoplist: lexSettings.stoplist, useLemmas: lexSettings.lemmatization });
        tokens.forEach((t, i) => {
          if (t === q) {
            const start = Math.max(0, i - lexSettings.collocWindow);
            const end = Math.min(tokens.length, i + lexSettings.collocWindow + 1);
            for (let j = start; j < end; j++) {
              if (i === j) continue;
              const col = tokens[j];
              coocCounts.set(col, (coocCounts.get(col) || 0) + 1);
              if (!collocExamples.has(col)) collocExamples.set(col, []);
              if (collocExamples.get(col)!.length < 5) collocExamples.get(col)!.push({ title: l.title || l.play_id, act: l.act, scene: l.scene, speaker: l.speaker, text: l.text_norm });
            }
          }
        });
      });
      collocList = Array.from(coocCounts.entries()).map(([collocate, count]) => ({ collocate, count, score: count })).sort((a, b) => b.count - a.count).slice(0, topN);
    }

    let vpData: any = null;
    if (lexSettings.compareVerseProse) {
      const vTop = Array.from(verseCounts.entries()).map(([token, count]) => ({ token, count, per_10k: verseTotal > 0 ? (count / verseTotal * 10000).toFixed(2) : "0" })).sort((a, b) => Number(b.per_10k) - Number(a.per_10k)).slice(0, 10);
      vpData = {
        summary: [{ type: "Verse", tokens: verseTotal, types: verseCounts.size }, { type: "Prose", tokens: proseTotal, types: proseCounts.size }],
        chart: vTop.map(v => ({ name: v.token, verse: parseFloat(v.per_10k), prose: parseFloat(((proseCounts.get(v.token) || 0) / (proseTotal || 1) * 10000).toFixed(2)) }))
      };
    }

    const output = { freqList, ngramList, collocList, collocExamples, totalTokens, vpData };
    computationCache.current.set(cacheKey, output);
    return output;
  }, [lines, corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, lexSettings]);

  if (results?.error) return <Alert variant="destructive" className="my-4"><Info className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{results.error}</AlertDescription></Alert>;

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-500/10 border-blue-500/20"><Info className="h-4 w-4 text-blue-500" /><AlertTitle className="text-blue-700 font-semibold">Dataset: LINES ONLY</AlertTitle><AlertDescription className="text-blue-600/80 text-xs italic">Using corpus_lines_real.csv (text_norm).</AlertDescription></Alert>
      <Card><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" /> Lexical Parameters</CardTitle></CardHeader>
      <CardContent className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-4 gap-6"><div className="space-y-3"><div className="flex items-center space-x-2"><Checkbox id="lex-stop" checked={lexSettings.stoplist} onCheckedChange={v => setLexSettings(s => ({...s, stoplist: !!v}))} /><Label htmlFor="lex-stop" className="text-xs cursor-pointer">Stoplist</Label></div><div className="flex items-center space-x-2"><Checkbox id="lex-lemma" checked={lexSettings.lemmatization} onCheckedChange={v => setLexSettings(s => ({...s, lemmatization: !!v}))} /><Label htmlFor="lex-lemma" className="text-xs cursor-pointer">Lemmatize</Label></div></div>
      <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">N-gram Size</Label><Select value={lexSettings.ngramSize} onValueChange={v => setLexSettings(s => ({...s, ngramSize: v}))}><SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="2">Bigrams (2)</SelectItem><SelectItem value="3">Trigrams (3)</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Collocation Query</Label><Input placeholder="e.g. love" value={lexSettings.collocQuery} onChange={e => setLexSettings(s => ({...s, collocQuery: e.target.value}))} className="h-8 text-xs" /></div>
      <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Window Size</Label><Input type="number" value={lexSettings.collocWindow} onChange={e => setLexSettings(s => ({...s, collocWindow: parseInt(e.target.value)||1}))} className="h-8 text-xs" /></div></div>
      <div className="pt-4 border-t border-dashed"><div className="flex items-center space-x-2"><Checkbox id="lex-vp" checked={lexSettings.compareVerseProse} onCheckedChange={v => setLexSettings(s => ({...s, compareVerseProse: !!v}))} /><Label htmlFor="lex-vp" className="text-xs cursor-pointer text-primary">Compare Verse vs Prose</Label></div></div></CardContent></Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="shadow-none overflow-hidden"><CardHeader className="flex flex-row items-center justify-between pb-4 bg-muted/5 border-b"><div className="space-y-1"><CardTitle className="text-sm font-bold">Word Frequencies</CardTitle><CardDescription className="text-[10px]">Top-{topN} tokens</CardDescription></div><Button variant="outline" size="icon" onClick={() => exportToCsv("lex_freq.csv", results?.freqList || [])} className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button></CardHeader>
        <CardContent className="pt-6 space-y-4"><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={results?.freqList.slice(0, 10)}><XAxis dataKey="token" fontSize={9} /><Tooltip contentStyle={{ fontSize: '10px' }} /><Bar dataKey="count" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer></div><div className="max-h-[250px] overflow-auto border rounded-md"><Table><TableHeader className="bg-muted/50 sticky top-0"><TableRow><TableHead className="h-8 text-[10px]">Rank</TableHead><TableHead className="h-8 text-[10px]">Token</TableHead><TableHead className="h-8 text-[10px] text-right">Count</TableHead></TableRow></TableHeader><TableBody>{results?.freqList.map((item, i) => (<TableRow key={i} className="h-8"><TableCell className="py-1 text-[10px] text-muted-foreground">{i+1}</TableCell><TableCell className="py-1 text-[10px] font-medium">{item.token}</TableCell><TableCell className="py-1 text-[10px] text-right font-semibold">{item.count.toLocaleString()}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
        <Card className="shadow-none overflow-hidden"><CardHeader className="flex flex-row items-center justify-between pb-4 bg-muted/5 border-b"><div className="space-y-1"><CardTitle className="text-sm font-bold">{lexSettings.ngramSize}-grams</CardTitle><CardDescription className="text-[10px]">Common sequences</CardDescription></div><Button variant="outline" size="icon" onClick={() => exportToCsv("lex_ngrams.csv", results?.ngramList || [])} className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button></CardHeader>
        <CardContent className="pt-6"><div className="max-h-[460px] overflow-auto border rounded-md"><Table><TableHeader className="bg-muted/50 sticky top-0"><TableRow><TableHead className="h-8 text-[10px]">Rank</TableHead><TableHead className="h-8 text-[10px]">Sequence</TableHead><TableHead className="h-8 text-[10px] text-right">Count</TableHead></TableRow></TableHeader><TableBody>{results?.ngramList.map((item, i) => (<TableRow key={i} className="h-8"><TableCell className="py-1 text-[10px] text-muted-foreground">{i+1}</TableCell><TableCell className="py-1 text-[10px] font-mono">{item.ngram}</TableCell><TableCell className="py-1 text-[10px] text-right font-semibold">{item.count.toLocaleString()}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
      </div>
      {lexSettings.collocQuery && <Card className="shadow-none border-dashed bg-muted/5"><CardHeader className="pb-4 bg-muted/5 border-b border-dashed"><div className="flex items-center justify-between"><div className="space-y-1"><CardTitle className="text-sm font-bold">Collocations for "{lexSettings.collocQuery}"</CardTitle></div><Button variant="outline" size="sm" onClick={() => exportToCsv("lex_collocs.csv", results?.collocList || [])} className="h-7 text-[10px] gap-1.5"><Download className="h-3 w-3" /> Export</Button></div></CardHeader><CardContent className="pt-6"><div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><div className="border rounded-md max-h-[400px] overflow-auto bg-background"><Table><TableHeader className="bg-muted/50 sticky top-0"><TableRow><TableHead className="h-8 text-[10px]">Collocate</TableHead><TableHead className="h-8 text-[10px] text-right">Count</TableHead></TableRow></TableHeader><TableBody>{results?.collocList.map((item, i) => (<TableRow key={i} className={`h-8 cursor-pointer ${selectedCollocate === item.collocate ? 'bg-primary/10' : 'hover:bg-primary/5'}`} onClick={() => setSelectedCollocate(item.collocate)}><TableCell className="py-1 text-[10px] font-medium">{item.collocate}</TableCell><TableCell className="py-1 text-[10px] text-right font-semibold">{item.count}</TableCell></TableRow>))}</TableBody></Table></div><div className="space-y-3"><h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest px-1">Source Excerpts</h4>{selectedCollocate ? <div className="space-y-2 overflow-auto max-h-[350px]">{results?.collocExamples.get(selectedCollocate)?.map((ex, idx) => (<div key={idx} className="p-3 rounded-lg border bg-background text-[11px] leading-relaxed italic border-muted/60">"{ex.text.substring(0, 200)}..."<div className="mt-2 text-[9px] text-muted-foreground font-bold uppercase">{ex.title} | {ex.speaker}</div></div>))}</div> : <div className="h-full flex items-center justify-center border rounded-xl border-dashed text-[10px] text-muted-foreground italic min-h-[200px]">Select a collocate</div>}</div></div></CardContent></Card>}
      {lexSettings.compareVerseProse && <Card className="shadow-none border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-bottom-3"><CardHeader><CardTitle className="text-sm font-bold text-primary">Verse vs Prose</CardTitle></CardHeader><CardContent className="space-y-6"><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={results?.vpData.chart}><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip contentStyle={{ fontSize: '10px' }} /><Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} /><Bar dataKey="verse" fill="hsl(var(--primary))" name="Verse" /><Bar dataKey="prose" fill="hsl(var(--muted-foreground))" name="Prose" /></BarChart></ResponsiveContainer></div></CardContent></Card>}
    </div>
  );
};

// --- Semantic Tab Component (From Step 7) ---

const SemanticTab = () => {
  const { speeches } = useData(); // SPEECHES ONLY
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, timeMode } = useUI();
  
  const [targetTerm, setTargetTerm] = useState("");
  const [debouncedTarget, setDebouncedTarget] = useState("");
  const [measure, setMeasure] = useState("pmi");
  const [useStoplist, setUseStoplist] = useState(true);
  const [useLemmas, setUseLemmas] = useState(true);
  const [windowSize, setWindowSize] = useState(10);
  const [sliceSize, setSliceSize] = useState(3);
  
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const computationCache = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTarget(targetTerm), 300);
    return () => clearTimeout(timer);
  }, [targetTerm]);

  const getTimeValue = (s: any) => (timeMode === "year" ? s.year_est || s.year_mid || s.year_min || 0 : s.decade || s.decade_num || 0);

  const results = useMemo(() => {
    if (!debouncedTarget) return null;
    const filtered = speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      if (selectedGenre && s.genre !== selectedGenre) return false;
      if (selectedSpeaker && s.speaker !== selectedSpeaker) return false;
      return true;
    });
    const cacheKey = JSON.stringify({ scope: corpusScope, title: selectedPlayTitle, genre: selectedGenre, speaker: selectedSpeaker, topN, timeMode, target: debouncedTarget, measure, stoplist: useStoplist, lemmas: useLemmas, windowSize, sliceSize });
    if (computationCache.current.has(cacheKey)) return computationCache.current.get(cacheKey);

    const qProcessed = processTokens(debouncedTarget, { useStoplist: false, useLemmas });
    const q = qProcessed[0] || debouncedTarget.toLowerCase();
    const globalCounts = new Map<string, number>();
    let totalTokens = 0;
    const speechTokens = filtered.map(s => {
      const tokens = processTokens(s.text_raw || s.text_norm || "", { useStoplist, useLemmas });
      tokens.forEach(t => { globalCounts.set(t, (globalCounts.get(t) || 0) + 1); totalTokens++; });
      return { ...s, tokens, time: getTimeValue(s) };
    });
    const qFreq = globalCounts.get(q) || 0;
    if (qFreq === 0) return { error: `Term "${q}" not found.` };

    const coocCounts = new Map<string, number>();
    const speechHits = new Map<string, Set<number>>();
    const examples = new Map<string, any[]>();

    speechTokens.forEach((s, idx) => {
      s.tokens.forEach((t, i) => {
        if (t === q) {
          const start = Math.max(0, i - windowSize), end = Math.min(s.tokens.length, i + windowSize + 1);
          for (let j = start; j < end; j++) {
            if (i === j) continue;
            const col = s.tokens[j];
            coocCounts.set(col, (coocCounts.get(col) || 0) + 1);
            if (!speechHits.has(col)) speechHits.set(col, new Set());
            speechHits.get(col)!.add(idx);
            if (!examples.has(col)) examples.set(col, []);
            if (examples.get(col)!.length < 5) examples.get(col)!.push({ title: s.title || s.play_id, act: s.act, scene: s.scene, speaker: s.speaker, text: s.text_raw || s.text_norm || "" });
          }
        }
      });
    });

    const associationList = Array.from(coocCounts.entries()).map(([term, count]) => {
      const termFreq = globalCounts.get(term) || 1;
      let score = measure === "pmi" ? Math.log2((count/totalTokens)/((qFreq/totalTokens)*(termFreq/totalTokens))) : (measure === "log-likelihood" ? count * Math.log(count/(qFreq*termFreq/totalTokens)) : count);
      return { term, count, score: parseFloat(score.toFixed(3)), hits: speechHits.get(term)?.size || 0 };
    }).filter(a => a.count > 1).sort((a, b) => b.score - a.score).slice(0, topN);

    let shiftData: any = null;
    const timeSlices = Array.from(new Set(speechTokens.map(s => s.time))).sort((a, b) => a - b);
    if (timeSlices.length >= 2) {
      const k = Math.min(sliceSize, Math.floor(timeSlices.length / 2));
      const earlySlices = new Set(timeSlices.slice(0, k)), lateSlices = new Set(timeSlices.slice(-k));
      const computeSubScore = (slices: Set<number>) => {
        const subFiltered = speechTokens.filter(s => slices.has(s.time));
        const subCooc = new Map<string, number>(), subGlobal = new Map<string, number>();
        let subTotal = 0, subQFreq = 0;
        subFiltered.forEach(s => s.tokens.forEach((t, i) => {
          subGlobal.set(t, (subGlobal.get(t) || 0) + 1); subTotal++;
          if (t === q) { subQFreq++; const start = Math.max(0, i - windowSize), end = Math.min(s.tokens.length, i + windowSize + 1); for (let j = start; j < end; j++) if (i !== j) subCooc.set(s.tokens[j], (subCooc.get(s.tokens[j]) || 0) + 1); }
        }));
        const scores = new Map<string, number>();
        subCooc.forEach((count, term) => scores.set(term, Math.log2((count/subTotal)/((subQFreq/subTotal)*((subGlobal.get(term)||1)/subTotal)))));
        return scores;
      };
      const earlyScores = computeSubScore(earlySlices), lateScores = computeSubScore(lateSlices);
      const combinedTerms = Array.from(new Set([...earlyScores.keys(), ...lateScores.keys()]));
      const shifts = combinedTerms.map(term => { const early = earlyScores.get(term) || 0, late = lateScores.get(term) || 0; return { term, early: parseFloat(early.toFixed(3)), late: parseFloat(late.toFixed(3)), delta: parseFloat((late - early).toFixed(3)) }; }).sort((a, b) => b.delta - a.delta);
      shiftData = { risers: shifts.filter(s => s.late > 0 && s.early > 0).slice(0, topN), fallers: shifts.filter(s => s.late > 0 && s.early > 0).sort((a, b) => a.delta - b.delta).slice(0, topN), scatter: shifts.filter(s => s.late > 0 && s.early > 0).slice(0, 50) };
    }

    const output = { associationList, examples, shiftData, totalTokens, qFreq };
    computationCache.current.set(cacheKey, output);
    return output;
  }, [speeches, debouncedTarget, corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, timeMode, measure, useStoplist, useLemmas, windowSize, sliceSize]);

  return (
    <div className="space-y-6">
      <Alert className="bg-purple-500/10 border-purple-500/20"><Info className="h-4 w-4 text-purple-500" /><AlertTitle className="text-purple-700 font-semibold">Dataset: SPEECHES ONLY</AlertTitle><AlertDescription className="text-purple-600/80 text-xs italic">Using corpus_speeches_real.csv (text_raw normalized).</AlertDescription></Alert>
      <Card className="shadow-none border-muted/60"><CardHeader className="pb-3 bg-muted/5 border-b"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-purple-500" /> Semantic Parameters</CardTitle></CardHeader>
      <CardContent className="pt-6 space-y-6"><div className="grid grid-cols-1 md:grid-cols-4 gap-6"><div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Target Term</Label><div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="e.g. honor" value={targetTerm} onChange={e => setTargetTerm(e.target.value)} className="h-9 text-xs pl-8" /></div></div>
      <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Measure</Label><Select value={measure} onValueChange={setMeasure}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pmi">PMI (Association)</SelectItem><SelectItem value="log-likelihood">Log-Likelihood</SelectItem><SelectItem value="count">Co-occurrence</SelectItem></SelectContent></Select></div>
      <div className="space-y-3 pt-2"><div className="flex items-center space-x-2"><Checkbox id="s-stop" checked={useStoplist} onCheckedChange={v => setUseStoplist(!!v)} /><Label htmlFor="s-stop" className="text-xs cursor-pointer">Stoplist</Label></div><div className="flex items-center space-x-2"><Checkbox id="s-lemma" checked={useLemmas} onCheckedChange={v => setUseLemmas(!!v)} /><Label htmlFor="s-lemma" className="text-xs cursor-pointer">Lemmatize</Label></div></div>
      <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Window Size</Label><Input type="number" value={windowSize} onChange={e => setWindowSize(parseInt(e.target.value)||1)} className="h-9 text-xs" /></div></div>
      <div className="pt-4 border-t border-dashed flex items-center gap-6"><div className="flex items-center gap-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Comparison Slices (K):</Label><Input type="number" value={sliceSize} onChange={e => setSliceSize(parseInt(e.target.value)||1)} className="h-7 w-16 text-xs" /></div><span className="text-[10px] text-muted-foreground italic">Compares first K vs last K time slices.</span></div></CardContent></Card>
      {!debouncedTarget ? <div className="py-24 text-center border rounded-xl border-dashed bg-muted/5"><Search className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" /><p className="text-sm text-muted-foreground font-medium">Enter a target term above</p></div> : results?.error ? <Alert variant="destructive"><Info className="h-4 w-4" /><AlertTitle>No Results</AlertTitle><AlertDescription>{results.error}</AlertDescription></Alert> : <div className="space-y-8">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="shadow-none overflow-hidden"><CardHeader className="flex flex-row items-center justify-between pb-4 bg-muted/5 border-b"><div className="space-y-1"><CardTitle className="text-sm font-bold">Semantic Associations</CardTitle><CardDescription className="text-[10px]">Terms most related to "{debouncedTarget}"</CardDescription></div><Button variant="outline" size="icon" onClick={() => exportToCsv("sem_assoc.csv", results?.associationList || [])} className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button></CardHeader>
          <CardContent className="pt-6 space-y-6"><div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={results?.associationList.slice(0, 10)} layout="vertical"><XAxis type="number" fontSize={9} /><YAxis dataKey="term" type="category" fontSize={9} width={80} /><Tooltip contentStyle={{ fontSize: '10px' }} /><Bar dataKey="score" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer></div><div className="max-h-[300px] overflow-auto border rounded-md"><Table><TableHeader className="bg-muted/50 sticky top-0"><TableRow><TableHead className="h-8 text-[10px]">Term</TableHead><TableHead className="h-8 text-[10px] text-right">Co-occ</TableHead><TableHead className="h-8 text-[10px] text-right">Score</TableHead></TableRow></TableHeader><TableBody>{results?.associationList.map((item: any, i: number) => (<TableRow key={i} className={`h-8 cursor-pointer ${selectedTerm === item.term ? 'bg-primary/10' : 'hover:bg-muted/30'}`} onClick={() => setSelectedTerm(item.term)}><TableCell className="py-1 text-[10px] font-medium">{item.term}</TableCell><TableCell className="py-1 text-[10px] text-right">{item.count}</TableCell><TableCell className="py-1 text-[10px] text-right font-bold text-primary">{item.score}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
          <div className="space-y-4"><h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest px-1">Source Excerpts</h4>{selectedTerm ? <div className="space-y-2.5 max-h-[600px] overflow-auto pr-2">{results?.examples.get(selectedTerm)?.map((ex: any, idx: number) => (<div key={idx} className="p-4 rounded-lg border bg-background text-[11px] leading-relaxed shadow-sm border-muted/60"><p className="mb-3 font-serif italic">"...{ex.text.substring(0, 300)}..."</p><div className="flex items-center gap-3 text-[9px] text-muted-foreground border-t pt-2.5 opacity-80 font-bold uppercase">{ex.title} | {ex.speaker}</div></div>))}</div> : <div className="h-full flex flex-col items-center justify-center border rounded-xl border-dashed bg-muted/5 text-[10px] text-muted-foreground italic min-h-[400px]">Select a term</div>}</div>
        </div>
        {results?.shiftData && <Card className="shadow-none border-purple-200 bg-purple-50/20"><CardHeader className="pb-4 bg-purple-100/30 border-b flex flex-row items-center justify-between"><div className="space-y-1"><CardTitle className="text-sm font-bold text-purple-800">Semantic Shift Pilot</CardTitle><CardDescription className="text-[10px] text-purple-700/70">Early vs. Late career</CardDescription></div><Button variant="outline" size="sm" onClick={() => exportToCsv("sem_shift.csv", results?.shiftData.risers || [])} className="h-7 text-[10px] border-purple-200 text-purple-700"><Download className="h-3 w-3 mr-1.5" /> Export Shift</Button></CardHeader>
        <CardContent className="pt-8 space-y-8"><div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><div className="space-y-4"><div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /><h5 className="text-[11px] font-bold uppercase">Top Risers</h5></div><div className="border border-purple-100 rounded-lg overflow-hidden bg-background"><Table><TableHeader className="bg-purple-50/50"><TableRow><TableHead className="h-8 text-[9px]">Term</TableHead><TableHead className="h-8 text-[9px] text-right">Early</TableHead><TableHead className="h-8 text-[9px] text-right">Late</TableHead><TableHead className="h-8 text-[9px] text-right">Delta</TableHead></TableRow></TableHeader><TableBody>{results?.shiftData.risers.slice(0, 10).map((s: any, i: number) => (<TableRow key={i} className="h-8"><TableCell className="py-1 text-[10px] font-medium">{s.term}</TableCell><TableCell className="py-1 text-[10px] text-right opacity-60">{s.early}</TableCell><TableCell className="py-1 text-[10px] text-right opacity-60">{s.late}</TableCell><TableCell className="py-1 text-[10px] text-right font-bold text-emerald-600">+{s.delta}</TableCell></TableRow>))}</TableBody></Table></div></div><div className="space-y-4"><div className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-rose-500" /><h5 className="text-[11px] font-bold uppercase">Top Fallers</h5></div><div className="border border-purple-100 rounded-lg overflow-hidden bg-background"><Table><TableHeader className="bg-purple-50/50"><TableRow><TableHead className="h-8 text-[9px]">Term</TableHead><TableHead className="h-8 text-[9px] text-right">Early</TableHead><TableHead className="h-8 text-[9px] text-right">Late</TableHead><TableHead className="h-8 text-[9px] text-right">Delta</TableHead></TableRow></TableHeader><TableBody>{results?.shiftData.fallers.slice(0, 10).map((s: any, i: number) => (<TableRow key={i} className="h-8"><TableCell className="py-1 text-[10px] font-medium">{s.term}</TableCell><TableCell className="py-1 text-[10px] text-right opacity-60">{s.early}</TableCell><TableCell className="py-1 text-[10px] text-right opacity-60">{s.late}</TableCell><TableCell className="py-1 text-[10px] text-right font-bold text-rose-600">{s.delta}</TableCell></TableRow>))}</TableBody></Table></div></div></div><div className="h-[350px] w-full pt-4"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}><CartesianGrid strokeDasharray="3 3" opacity={0.1} /><XAxis type="number" dataKey="early" fontSize={9} label={{ value: 'Early PMI', position: 'bottom', fontSize: 10 }} /><YAxis type="number" dataKey="late" fontSize={9} label={{ value: 'Late PMI', angle: -90, position: 'left', fontSize: 10 }} /><ZAxis type="number" range={[50, 400]} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter name="Terms" data={results?.shiftData.scatter} fill="hsl(var(--primary))" opacity={0.6}><LabelList dataKey="term" position="top" style={{ fontSize: '8px' }} /></Scatter></ScatterChart></ResponsiveContainer></div></CardContent></Card>}
      </div>}
    </div>
  );
};

// --- Discursive Tab Placeholder (Step 8) ---

const DiscursiveTab = () => {
  const { speeches } = useData(); // SPEECHES ONLY
  const [discSettings, setDiscSettings] = useState({ nodeLemmas: "lord, father, king", tokenSpan: 100, topPairs: 20 });
  return (
    <div className="space-y-6">
      <Alert className="bg-amber-500/10 border-amber-500/20"><Info className="h-4 w-4 text-amber-500" /><AlertTitle className="text-amber-700 font-semibold">Dataset: SPEECHES ONLY</AlertTitle><AlertDescription className="text-amber-600/80 text-xs italic">Using corpus_speeches_real.csv (Quad/constellation pilot).</AlertDescription></Alert>
      <Card className="shadow-none border-muted/60"><CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-amber-500" /> Discursive Parameters</CardTitle></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Node Lemmas</Label><Input value={discSettings.nodeLemmas} onChange={e => setDiscSettings(s => ({...s, nodeLemmas: e.target.value}))} className="h-9 text-xs" /></div><div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Token Span</Label><Input type="number" value={discSettings.tokenSpan} onChange={e => setDiscSettings(s => ({...s, tokenSpan: parseInt(e.target.value)||0}))} className="h-9 text-xs" /></div><div className="space-y-1.5 flex flex-col justify-end"><Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">Time Slider</Label><div className="h-9 flex items-center px-3 bg-muted rounded border text-[10px] text-muted-foreground italic">(Will activate in Step 8)</div></div></CardContent></Card>
      <Card className="min-h-[400px] flex flex-col items-center justify-center border-dashed bg-muted/5 shadow-none"><BarChart3 className="w-8 h-8 text-muted-foreground/20 mb-2" /><p className="text-xs text-muted-foreground italic">Discursive constellation visualization (Step 8)</p></Card>
    </div>
  );
};

// --- Analysis Page ---

export default function Analysis() {
  const { corpusScope, selectedPlayTitle, timeMode, topN, selectedGenre, selectedSpeaker } = useUI();

  return (
    <MainLayout title="Linguistic Analysis">
      <div className="space-y-6">
        <Card className="bg-muted/30 border-dashed shadow-none">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-2">
              <HelpCircle className="h-3 w-3" /> Parameters Summary
            </CardTitle>
            <Badge variant="outline" className="text-[9px] h-4 font-normal opacity-60">Step 7 Active</Badge>
          </CardHeader>
          <CardContent className="py-0 px-4 pb-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
              <div className="flex gap-2 items-center"><span className="text-muted-foreground">Scope:</span><Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px]">{corpusScope === "play" ? `Play: ${selectedPlayTitle}` : "Full Corpus"}</Badge></div>
              <div className="flex gap-2 items-center"><span className="text-muted-foreground">Time:</span><Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px] capitalize">{timeMode}</Badge></div>
              <div className="flex gap-2 items-center"><span className="text-muted-foreground">Top-N:</span><Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px]">{topN}</Badge></div>
              {selectedGenre && <div className="flex gap-2 items-center"><span className="text-muted-foreground">Genre:</span><Badge variant="outline" className="h-4 px-1.5 py-0 text-[9px]">{selectedGenre}</Badge></div>}
            </div>
          </CardContent>
        </Card>
        <Tabs defaultValue="semantic" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/50 p-1">
            <TabsTrigger value="lexical">Lexical</TabsTrigger>
            <TabsTrigger value="semantic">Semantic</TabsTrigger>
            <TabsTrigger value="discursive">Discursive Concepts</TabsTrigger>
          </TabsList>
          <TabsContent value="lexical" className="mt-0 animate-in fade-in duration-300"><LexicalTab /></TabsContent>
          <TabsContent value="semantic" className="mt-0 animate-in fade-in duration-300"><SemanticTab /></TabsContent>
          <TabsContent value="discursive" className="mt-0 animate-in fade-in duration-300"><DiscursiveTab /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
