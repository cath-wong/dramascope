import React, { useState, useMemo, useRef, useEffect, useTransition } from "react";
import { MainLayout } from "@/components/MainLayout";
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
import { Info, Download, Settings2, BarChart3, Table as TableIcon, Search, HelpCircle, TrendingUp, TrendingDown, History, ChevronLeft, ChevronRight, Play, Pause, Network, ChevronDown, ChevronUp, Pin, Trash2, ListFilter, LayoutGrid, FileText, X, Clipboard, ArrowUpDown, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { processTokens, formatTimeValue, getStoplist } from "@/utils/linguistics";
import { isLexicalContentWord, cleanLexicalToken } from "@/utils/lexicalFilter";
import { exportToCsv } from "@/utils/exportCsv";
import { useToast } from "@/hooks/use-toast";
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
import { computeSimilarityMatrix } from "@/utils/constellationMatrix";
import { computeClusters } from "@/utils/constellationClustering";

const DetailsPanel = ({ dataset, tokenCol, settings, ui, playwrights }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const pwLabel = playwrights && playwrights.length > 0
    ? (playwrights.length === 8 ? "All" : playwrights.map((pw: string) => pw.split(" ").pop()).join(", "))
    : "—";
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
        {playwrights && <div className="space-y-1"><span className="font-bold opacity-60">PLAYWRIGHTS</span><p>{pwLabel}</p></div>}
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

interface KwicRow {
  left: string; match: string; right: string;
  play: string; speaker: string; act: string; scene: string; unit: string; time: string;
  fullExcerpt: string; searchWord: string;
}

interface CollocRow {
  collocate: string; logdice: number; cooc: number;
  leftFreq: number; rightFreq: number; collocFreq: number;
  dominantPos: "Left" | "Right" | "Balanced";
}

interface CollocSettings {
  window: number; minCooc: number; minColFreq: number;
  ranking: "logdice" | "cooc"; position: "both" | "left" | "right";
}

interface CompWordStat {
  word: string; freq: number; relFreq: number;
  playsCount: number; mostPlay: string;
  firstSeen: number | null; lastSeen: number | null;
}

const COMP_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];

// --- Lexical Tab Component ---
const LexicalTab = () => {
  const ui = useUI();
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, selectedLines: lines, playwrightKey } = ui;
  const computationCache = useRef<Map<string, any>>(new Map());
  const [lexSettings, setLexSettings] = useState({ stoplist: true, lemmatization: true, ngramSize: "2", excludeStage: true, contentFocus: false });
  const [pinned, setPinned] = useState<any[]>([]);
  const [selectedWord, setSelectedWord] = useState("");
  const [wordView, setWordView] = useState<"all" | "content">("all");
  const [kwicSearch, setKwicSearch] = useState("");
  const [kwicLimit, setKwicLimit] = useState("50");
  const [kwicSort, setKwicSort] = useState("corpus");
  const [collocSettings, setCollocSettings] = useState<CollocSettings>({ window: 5, minCooc: 3, minColFreq: 3, ranking: "logdice", position: "both" });
  const [collocSearch, setCollocSearch] = useState("");
  const [collocLimit, setCollocLimit] = useState("50");
  const [comparisonWords, setComparisonWords] = useState<string[]>([]);
  const [comparisonInput, setComparisonInput] = useState("");
  const [comparisonView, setComparisonView] = useState<"summary" | "play" | "time">("summary");
  const [comparisonSort, setComparisonSort] = useState("order");
  const [compWarning, setCompWarning] = useState("");
  const [drillWord, setDrillWord] = useState("");
  const [drillSearch, setDrillSearch] = useState("");
  const [drillLimit, setDrillLimit] = useState<"20"|"50"|"all">("20");
  const [drillSort, setDrillSort] = useState("-freq");

  const results = useMemo(() => {
    const scopedLines = lines.filter(l => {
      if (corpusScope === "play" && (l.title || l.play_id) !== selectedPlayTitle) return false;
      if (selectedGenre && l.genre !== selectedGenre) return false;
      if (selectedSpeaker && l.speaker !== selectedSpeaker) return false;
      if (lexSettings.excludeStage && (l.unit === "stage" || l.unit === "stage_direction")) return false;
      return true;
    });
    if (!scopedLines.length) return null;
    const cacheKey = JSON.stringify({ pw: playwrightKey, scope: corpusScope, title: selectedPlayTitle, genre: selectedGenre, speaker: selectedSpeaker, topN, lex: lexSettings, wordView });
    if (computationCache.current.has(cacheKey)) return computationCache.current.get(cacheKey);

    const isContent = wordView === "content";
    const unigramCounts = new Map<string, number>();
    let totalTokens = 0;
    scopedLines.forEach(l => {
      const raw = processTokens(l.text_norm || "", { useStoplist: lexSettings.stoplist, useLemmas: lexSettings.lemmatization });
      const cleaned = raw.map(t => cleanLexicalToken(t, isContent)).filter((t): t is string => t !== null);
      const tokens = isContent ? cleaned.filter(isLexicalContentWord) : cleaned;
      tokens.forEach(t => { unigramCounts.set(t, (unigramCounts.get(t) || 0) + 1); totalTokens++; });
    });
    if (totalTokens === 0) return { error: "No tokens found." };

    const totalTypes = unigramCounts.size;
    const ttr = parseFloat((totalTypes / totalTokens).toFixed(4));
    const freqList = Array.from(unigramCounts.entries()).map(([token, count]) => ({ token, count, per_10k: parseFloat(((count / totalTokens) * 10000).toFixed(2)) })).sort((a, b) => b.count - a.count).slice(0, topN);

    const ngramCounts = new Map<string, number>();
    const nSize = parseInt(lexSettings.ngramSize);
    scopedLines.forEach(l => {
      const raw = processTokens(l.text_norm || "", { useStoplist: lexSettings.stoplist, useLemmas: lexSettings.lemmatization });
      const cleaned = raw.map(t => cleanLexicalToken(t, isContent)).filter((t): t is string => t !== null);
      const tokens = isContent ? cleaned.filter(isLexicalContentWord) : cleaned;
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

    const output = { freqList, ngramList: ngramList.slice(0, topN), totalTokens, totalTypes, ttr, unigramCounts };
    computationCache.current.set(cacheKey, output);
    return output;
  }, [lines, corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, lexSettings, wordView]);

  const wordData = useMemo(() => {
    if (!selectedWord.trim() || !results || !results.unigramCounts) return null;
    const processed = processTokens(selectedWord.trim(), { useStoplist: false, useLemmas: lexSettings.lemmatization });
    const word = processed[0] || selectedWord.trim().toLowerCase();
    const freq = (results.unigramCounts as Map<string, number>).get(word) || 0;
    const relFreq = results.totalTokens > 0 ? parseFloat(((freq / results.totalTokens) * 10000).toFixed(2)) : 0;
    return { word, freq, relFreq, found: freq > 0 };
  }, [selectedWord, results, lexSettings.lemmatization]);

  const wordPlayData = useMemo(() => {
    if (!wordData?.found || !lines) return [];
    const word = wordData.word;
    const playMap = new Map<string, number>();
    lines.forEach(l => {
      if (corpusScope === "play" && (l.title || l.play_id) !== selectedPlayTitle) return;
      if (selectedGenre && l.genre !== selectedGenre) return;
      if (selectedSpeaker && l.speaker !== selectedSpeaker) return;
      if (lexSettings.excludeStage && (l.unit === "stage" || l.unit === "stage_direction")) return;
      const tokens = processTokens(l.text_norm || "", { useStoplist: false, useLemmas: lexSettings.lemmatization });
      const count = tokens.filter(t => t === word).length;
      if (count > 0) {
        const play = l.title || l.play_id;
        playMap.set(play, (playMap.get(play) || 0) + count);
      }
    });
    return Array.from(playMap.entries()).map(([play, count]) => ({ play, count })).sort((a, b) => b.count - a.count);
  }, [wordData, lines, corpusScope, selectedPlayTitle, selectedGenre, selectedSpeaker, lexSettings]);

  const kwicData = useMemo((): KwicRow[] => {
    if (!selectedWord.trim() || !lines) return [];
    const processed = processTokens(selectedWord.trim(), { useStoplist: false, useLemmas: lexSettings.lemmatization });
    const searchLemma = processed[0] || selectedWord.trim().toLowerCase();
    const rows: KwicRow[] = [];
    lines.forEach(l => {
      if (corpusScope === "play" && (l.title || l.play_id) !== selectedPlayTitle) return;
      if (selectedGenre && l.genre !== selectedGenre) return;
      if (selectedSpeaker && l.speaker !== selectedSpeaker) return;
      if (lexSettings.excludeStage && (l.unit === "stage" || l.unit === "stage_direction")) return;
      const normText: string = l.text_norm || "";
      const rawText: string = l.text_raw || normText;
      const fastCheck = processTokens(normText, { useStoplist: false, useLemmas: lexSettings.lemmatization });
      if (!fastCheck.includes(searchLemma)) return;
      const normWords: string[] = normText.split(/\s+/).filter((w: string) => w.length > 0);
      const rawWords: string[] = rawText.split(/\s+/).filter((w: string) => w.length > 0);
      normWords.forEach((normW: string, i: number) => {
        const stripped = normW.replace(/[^a-zA-Z0-9''']/g, "").toLowerCase();
        if (!stripped) return;
        const tokenLemma = lexSettings.lemmatization
          ? (processTokens(stripped, { useStoplist: false, useLemmas: true })[0] || stripped)
          : stripped;
        if (tokenLemma !== searchLemma) return;
        rows.push({
          left: normWords.slice(Math.max(0, i - 10), i).join(" "),
          match: rawWords[i] || normW,
          right: normWords.slice(i + 1, Math.min(normWords.length, i + 11)).join(" "),
          play: l.title || l.play_id || "",
          speaker: l.speaker || "",
          act: String(l.act || ""),
          scene: String(l.scene || ""),
          unit: l.unit || "",
          time: l.year_est ? String(Math.round(Number(l.year_est))) : "",
          fullExcerpt: rawText,
          searchWord: searchLemma,
        });
      });
    });
    return rows;
  }, [selectedWord, lines, corpusScope, selectedPlayTitle, selectedGenre, selectedSpeaker, lexSettings.lemmatization, lexSettings.excludeStage]);

  const collocWindowSize = collocSettings.window;
  const collocData = useMemo((): { rows: CollocRow[]; nodeFreq: number } => {
    if (!selectedWord.trim() || !lines) return { rows: [], nodeFreq: 0 };
    const processed = processTokens(selectedWord.trim(), { useStoplist: false, useLemmas: lexSettings.lemmatization });
    const searchLemma = processed[0] || selectedWord.trim().toLowerCase();
    const isContent = wordView === "content";
    const stopSet = lexSettings.stoplist ? getStoplist() : null;
    const coocTotal = new Map<string, number>();
    const coocLeft = new Map<string, number>();
    const coocRight = new Map<string, number>();
    const corpFreq = new Map<string, number>();
    let nodeFreq = 0;
    lines.forEach((l: any) => {
      if (corpusScope === "play" && (l.title || l.play_id) !== selectedPlayTitle) return;
      if (selectedGenre && l.genre !== selectedGenre) return;
      if (selectedSpeaker && l.speaker !== selectedSpeaker) return;
      if (lexSettings.excludeStage && (l.unit === "stage" || l.unit === "stage_direction")) return;
      const normText: string = l.text_norm || "";
      const tokens: string[] = processTokens(normText, { useStoplist: false, useLemmas: lexSettings.lemmatization });
      tokens.forEach((t: string) => {
        if (t === searchLemma) return;
        if (stopSet && stopSet.has(t)) return;
        if (isContent && !isLexicalContentWord(t)) return;
        corpFreq.set(t, (corpFreq.get(t) || 0) + 1);
      });
      tokens.forEach((t: string, idx: number) => {
        if (t !== searchLemma) return;
        nodeFreq++;
        for (let j = Math.max(0, idx - collocWindowSize); j < idx; j++) {
          const ct: string = tokens[j];
          if (ct === searchLemma) continue;
          if (stopSet && stopSet.has(ct)) continue;
          if (isContent && !isLexicalContentWord(ct)) continue;
          coocTotal.set(ct, (coocTotal.get(ct) || 0) + 1);
          coocLeft.set(ct, (coocLeft.get(ct) || 0) + 1);
        }
        for (let j = idx + 1; j <= Math.min(tokens.length - 1, idx + collocWindowSize); j++) {
          const ct: string = tokens[j];
          if (ct === searchLemma) continue;
          if (stopSet && stopSet.has(ct)) continue;
          if (isContent && !isLexicalContentWord(ct)) continue;
          coocTotal.set(ct, (coocTotal.get(ct) || 0) + 1);
          coocRight.set(ct, (coocRight.get(ct) || 0) + 1);
        }
      });
    });
    if (nodeFreq === 0) return { rows: [], nodeFreq: 0 };
    const rows: CollocRow[] = [];
    coocTotal.forEach((total: number, collocate: string) => {
      const colFreq = corpFreq.get(collocate) || 0;
      const leftCount = coocLeft.get(collocate) || 0;
      const rightCount = coocRight.get(collocate) || 0;
      const denom = nodeFreq + colFreq;
      const logdice = denom > 0 ? parseFloat((14 + Math.log2((2 * total) / denom)).toFixed(3)) : 0;
      const dominantPos: "Left" | "Right" | "Balanced" =
        leftCount > rightCount ? "Left" : rightCount > leftCount ? "Right" : "Balanced";
      rows.push({ collocate, logdice, cooc: total, leftFreq: leftCount, rightFreq: rightCount, collocFreq: colFreq, dominantPos });
    });
    return { rows, nodeFreq };
  }, [selectedWord, lines, corpusScope, selectedPlayTitle, selectedGenre, selectedSpeaker, lexSettings, wordView, collocWindowSize]);

  const comparisonData = useMemo((): {
    stats: CompWordStat[];
    byPlay: { play: string; counts: Record<string, number>; total: number }[];
    overTime: Record<string, number>[];
    totalTokens: number;
    playTokens: Record<string, number>;
  } | null => {
    if (comparisonWords.length < 2 || !lines) return null;
    const searchTerms: string[] = comparisonWords.map(w => {
      const p = processTokens(w, { useStoplist: false, useLemmas: lexSettings.lemmatization });
      return p[0] || w;
    });
    const freqMap: Record<string, number> = {};
    const playsMap: Record<string, Map<string, number>> = {};
    const timeMap: Record<string, Map<number, number>> = {};
    const firstSeenMap: Record<string, number | null> = {};
    const lastSeenMap: Record<string, number | null> = {};
    comparisonWords.forEach(w => {
      freqMap[w] = 0; playsMap[w] = new Map(); timeMap[w] = new Map();
      firstSeenMap[w] = null; lastSeenMap[w] = null;
    });
    const playTokensMap = new Map<string, number>();
    let totalTokens = 0;
    lines.forEach((l: any) => {
      if (corpusScope === "play" && (l.title || l.play_id) !== selectedPlayTitle) return;
      if (selectedGenre && l.genre !== selectedGenre) return;
      if (selectedSpeaker && l.speaker !== selectedSpeaker) return;
      if (lexSettings.excludeStage && (l.unit === "stage" || l.unit === "stage_direction")) return;
      const normText: string = l.text_norm || "";
      const tokens: string[] = processTokens(normText, { useStoplist: false, useLemmas: lexSettings.lemmatization });
      const playName: string = l.title || l.play_id || "Unknown";
      const decade: number | null = l.decade ? Math.round(parseFloat(String(l.decade))) : null;
      totalTokens += tokens.length;
      playTokensMap.set(playName, (playTokensMap.get(playName) || 0) + tokens.length);
      tokens.forEach((t: string) => {
        for (let i = 0; i < searchTerms.length; i++) {
          if (t !== searchTerms[i]) continue;
          const w = comparisonWords[i];
          freqMap[w]++;
          playsMap[w].set(playName, (playsMap[w].get(playName) || 0) + 1);
          if (decade) {
            timeMap[w].set(decade, (timeMap[w].get(decade) || 0) + 1);
            if (firstSeenMap[w] === null || decade < firstSeenMap[w]!) firstSeenMap[w] = decade;
            if (lastSeenMap[w] === null || decade > lastSeenMap[w]!) lastSeenMap[w] = decade;
          }
        }
      });
    });
    const stats: CompWordStat[] = comparisonWords.map(w => {
      const freq = freqMap[w];
      const relFreq = totalTokens > 0 ? parseFloat(((freq / totalTokens) * 10000).toFixed(2)) : 0;
      const plays = playsMap[w];
      let mostPlay = "—"; let maxPc = 0;
      plays.forEach((c, p) => { if (c > maxPc) { maxPc = c; mostPlay = p; } });
      return { word: w, freq, relFreq, playsCount: plays.size, mostPlay, firstSeen: firstSeenMap[w], lastSeen: lastSeenMap[w] };
    });
    const allPlaysMap = new Map<string, Record<string, number>>();
    comparisonWords.forEach(w => playsMap[w].forEach((count, play) => {
      if (!allPlaysMap.has(play)) allPlaysMap.set(play, {});
      allPlaysMap.get(play)![w] = count;
    }));
    const byPlay = Array.from(allPlaysMap.entries())
      .map(([play, counts]) => ({ play, counts, total: comparisonWords.reduce((s, w) => s + (counts[w] || 0), 0) }))
      .sort((a, b) => b.total - a.total);
    const allSlices = new Set<number>();
    comparisonWords.forEach(w => timeMap[w].forEach((_, s) => allSlices.add(s)));
    const overTime: Record<string, number>[] = Array.from(allSlices).sort().map(slice => {
      const entry: Record<string, number> = { slice };
      comparisonWords.forEach(w => { entry[w] = timeMap[w].get(slice) || 0; });
      return entry;
    });
    return { stats, byPlay, overTime, totalTokens, playTokens: Object.fromEntries(playTokensMap) };
  }, [comparisonWords, lines, corpusScope, selectedPlayTitle, selectedGenre, selectedSpeaker, lexSettings]);

  const drillRows = useMemo(() => {
    if (!drillWord || !comparisonData) return [];
    const wordTotal = comparisonData.stats.find(s => s.word === drillWord)?.freq || 0;
    const playTokens = comparisonData.playTokens;
    let rows = comparisonData.byPlay
      .filter(r => (r.counts[drillWord] || 0) > 0)
      .map(r => {
        const freq = r.counts[drillWord] || 0;
        const playTok = playTokens[r.play] || 0;
        const relFreq = playTok > 0 ? parseFloat(((freq / playTok) * 10000).toFixed(2)) : 0;
        const share = wordTotal > 0 ? parseFloat(((freq / wordTotal) * 100).toFixed(1)) : 0;
        return { play: r.play, freq, relFreq, share };
      });
    const sk = drillSort.replace(/^-/, "");
    const asc = !drillSort.startsWith("-");
    rows.sort((a, b) => {
      const av = (a as any)[sk]; const bv = (b as any)[sk];
      if (typeof av === "number") return asc ? av - bv : bv - av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    if (drillSearch.trim()) rows = rows.filter(r => r.play.toLowerCase().includes(drillSearch.toLowerCase().trim()));
    if (drillLimit !== "all") rows = rows.slice(0, parseInt(drillLimit));
    return rows;
  }, [drillWord, comparisonData, drillSearch, drillSort, drillLimit]);

  useEffect(() => {
    if (drillWord && !comparisonWords.includes(drillWord)) setDrillWord("");
  }, [comparisonWords, drillWord]);

  const addCompWord = () => {
    const trimmed = comparisonInput.trim().toLowerCase();
    if (!trimmed) return;
    if (comparisonWords.length >= 8) { setCompWarning("Maximum 8 words in a comparison set."); return; }
    if (comparisonWords.includes(trimmed)) { setCompWarning(`"${trimmed}" is already in the comparison set.`); return; }
    setComparisonWords(prev => [...prev, trimmed]);
    setComparisonInput("");
    setCompWarning("");
  };

  return (
    <div className="space-y-6">
      <DetailsPanel dataset="LINES ONLY" tokenCol="text_norm" settings={{ stoplist: lexSettings.stoplist, lemmas: lexSettings.lemmatization }} ui={ui} playwrights={ui.selectedPlaywrights} />
      <PinnedPanel pinned={pinned} onRemove={(idx: number) => setPinned(p => p.filter((_, i) => i !== idx))} />

      <Card className="shadow-none border-muted/60">
        <CardHeader className="pb-3 bg-muted/5 border-b">
          <CardTitle className="text-sm font-semibold">Lexical Controls</CardTitle>
          <CardDescription className="text-xs">Settings shared across all Lexical sections.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-5">
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center space-x-2">
              <Checkbox id="l-stop" checked={lexSettings.stoplist} onCheckedChange={v => setLexSettings(s => ({ ...s, stoplist: !!v }))} data-testid="checkbox-lex-stoplist" />
              <Label htmlFor="l-stop" className="text-xs">Stoplist</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="l-lemma" checked={lexSettings.lemmatization} onCheckedChange={v => setLexSettings(s => ({ ...s, lemmatization: !!v }))} data-testid="checkbox-lex-lemmas" />
              <Label htmlFor="l-lemma" className="text-xs">Lemmas</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="l-stage" checked={lexSettings.excludeStage} onCheckedChange={v => setLexSettings(s => ({ ...s, excludeStage: !!v }))} data-testid="checkbox-lex-exclude-stage" />
              <Label htmlFor="l-stage" className="text-xs">Exclude Stage Directions</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold">Word View</Label>
            <div className="flex rounded-md border overflow-hidden h-8 w-fit">
              <button
                type="button"
                onClick={() => setWordView("all")}
                className={`px-4 text-xs font-medium transition-colors ${wordView === "all" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                data-testid="button-wordview-all"
              >
                All Words
              </button>
              <button
                type="button"
                onClick={() => setWordView("content")}
                className={`px-4 text-xs font-medium border-l transition-colors ${wordView === "content" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                data-testid="button-wordview-content"
              >
                Content Words Only
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Content Words Only removes common grammatical function words from lexical frequency analyses while preserving the existing stoplist behaviour.
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3" data-testid="section-corpus-overview">
        <div>
          <h3 className="text-sm font-bold">A. Corpus Overview</h3>
          <p className="text-xs text-muted-foreground">Summary of the lexical composition of the current corpus selection.</p>
        </div>
        <Card className="shadow-none border-muted/60">
          <CardContent className="pt-6 space-y-6">
            {!results || results.error ? (
              <p className="text-xs text-muted-foreground" data-testid="text-overview-empty">{results?.error || "No corpus data available."}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Tokens</div>
                    <div className="font-semibold tabular-nums" data-testid="text-corpus-total-tokens">{results.totalTokens.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Word Types</div>
                    <div className="font-semibold tabular-nums" data-testid="text-corpus-total-types">{results.totalTypes.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Type-Token Ratio</div>
                    <div className="font-semibold tabular-nums" data-testid="text-corpus-ttr">{results.ttr}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Most Frequent</div>
                    <div className="font-semibold font-mono truncate" data-testid="text-corpus-top-word">{results.freqList[0]?.token || "—"}</div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Word Frequency List</div>
                  <div className="h-[180px] mb-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={results.freqList.slice(0, 10)} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="token" fontSize={9} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ fontSize: 10 }} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ResultsTable
                    data={results.freqList}
                    columns={[
                      { key: "token", label: "Token" },
                      { key: "count", label: "Frequency", sortable: true, align: "right" },
                      { key: "per_10k", label: "Per 10k", sortable: true, align: "right" },
                    ]}
                    onPin={(item) => setPinned(p => [...p, { label: item.token, metric: item.count }])}
                    filename="lex_freq.csv"
                    scrollable
                  />
                </div>

                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">N-gram List</div>
                    <Select value={lexSettings.ngramSize} onValueChange={v => setLexSettings(s => ({ ...s, ngramSize: v }))}>
                      <SelectTrigger className="h-7 text-xs w-28" data-testid="select-ngram-size"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2" className="text-xs">Bigrams</SelectItem>
                        <SelectItem value="3" className="text-xs">Trigrams</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="l-focus" checked={lexSettings.contentFocus} onCheckedChange={v => setLexSettings(s => ({ ...s, contentFocus: !!v }))} data-testid="checkbox-lex-content-focus" />
                      <Label htmlFor="l-focus" className="text-xs flex items-center gap-1">Content Focus <Info className="h-3 w-3 opacity-50" /></Label>
                    </div>
                  </div>
                  <div className="h-[180px] mb-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={results.ngramList.slice(0, 10)} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="ngram" fontSize={9} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ fontSize: 10 }} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ResultsTable
                    data={results.ngramList}
                    columns={[
                      { key: "ngram", label: "Sequence" },
                      { key: "count", label: "Frequency", sortable: true, align: "right" },
                      { key: "per_10k", label: "Per 10k", sortable: true, align: "right" },
                    ]}
                    onPin={(item) => setPinned(p => [...p, { label: item.ngram, metric: item.count }])}
                    filename="lex_ngrams.csv"
                    scrollable
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" data-testid="section-word-explorer">
        <div>
          <h3 className="text-sm font-bold">B. Word Explorer</h3>
          <p className="text-xs text-muted-foreground">Frequency, distribution, and source contexts for a selected word.</p>
        </div>
        <Card className="shadow-none border-muted/60">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lex-word" className="text-[10px] uppercase font-bold">Word</Label>
              <Input id="lex-word" placeholder="e.g. love" value={selectedWord} onChange={e => setSelectedWord(e.target.value)} className="h-8 text-xs max-w-xs" data-testid="input-lex-word" />
            </div>
            {!selectedWord.trim() ? (
              <p className="text-xs text-muted-foreground" data-testid="text-word-explorer-prompt">Enter a word to inspect its corpus contexts.</p>
            ) : (
              <div className="space-y-4">
                {wordData?.found ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Frequency</div>
                      <div className="font-semibold tabular-nums" data-testid="text-word-freq">{wordData.freq.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Relative Frequency</div>
                      <div className="font-semibold tabular-nums" data-testid="text-word-rel-freq">{wordData.relFreq} per 10k tokens</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">Lemma Form</div>
                      <div className="font-semibold font-mono" data-testid="text-word-lemma">{wordData.word}</div>
                    </div>
                  </div>
                ) : wordData ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-word-not-found">
                    "{wordData.word}" is not in the current frequency list — it may be filtered by Word View. Concordance results below use the full token set.
                  </p>
                ) : null}

                {wordData?.found && wordPlayData.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Frequency by Play</div>
                    <div className="rounded-md border bg-background">
                      <Table wrapperClassName="relative w-full max-h-[240px] overflow-y-auto overflow-x-auto">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Play</TableHead>
                            <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur text-right">Frequency</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wordPlayData.map((r, i) => (
                            <TableRow key={r.play} className="h-8" data-testid={`row-word-play-${i}`}>
                              <TableCell className="py-1 text-[10px]" data-testid={`text-word-play-${i}`}>{r.play}</TableCell>
                              <TableCell className="py-1 text-[10px] text-right tabular-nums" data-testid={`text-word-play-freq-${i}`}>{r.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* KWIC Concordance */}
                {(() => {
                  let display = [...kwicData];
                  if (kwicSearch.trim()) {
                    const q = kwicSearch.trim().toLowerCase();
                    display = display.filter(r =>
                      r.left.toLowerCase().includes(q) || r.match.toLowerCase().includes(q) ||
                      r.right.toLowerCase().includes(q) || r.play.toLowerCase().includes(q) ||
                      r.speaker.toLowerCase().includes(q)
                    );
                  }
                  if (kwicSort === "play") display.sort((a, b) => a.play.localeCompare(b.play));
                  else if (kwicSort === "speaker") display.sort((a, b) => a.speaker.localeCompare(b.speaker));
                  else if (kwicSort === "act") display.sort((a, b) => a.act.localeCompare(b.act));
                  else if (kwicSort === "scene") display.sort((a, b) => a.scene.localeCompare(b.scene));
                  else if (kwicSort === "time") display.sort((a, b) => a.time.localeCompare(b.time));
                  const totalFiltered = display.length;
                  if (kwicLimit !== "all") display = display.slice(0, parseInt(kwicLimit));
                  const playFreq = kwicData.reduce<Record<string, number>>((acc, r) => { acc[r.play] = (acc[r.play] || 0) + 1; return acc; }, {});
                  const topPlay = Object.entries(playFreq).sort((a, b) => b[1] - a[1])[0];
                  return (
                    <div className="space-y-3">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground">KWIC / Concordance</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs p-3 rounded-md bg-muted/30 border">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">Search Word</div>
                          <div className="font-mono font-semibold">{wordData?.word || selectedWord.trim().toLowerCase()}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Occurrences</div>
                          <div className="font-semibold tabular-nums" data-testid="text-kwic-total">{kwicData.length.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">Plays Represented</div>
                          <div className="font-semibold tabular-nums">{new Set(kwicData.map(r => r.play)).size}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">Most Represented</div>
                          <div className="text-[10px] font-semibold truncate" title={topPlay?.[0]}>{topPlay?.[0] || "—"}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Input
                          placeholder="Search within results…"
                          value={kwicSearch}
                          onChange={e => setKwicSearch(e.target.value)}
                          className="h-7 text-xs max-w-[200px]"
                          data-testid="input-kwic-search"
                        />
                        <Select value={kwicLimit} onValueChange={setKwicLimit}>
                          <SelectTrigger className="h-7 text-xs w-24" data-testid="select-kwic-limit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="20">Top 20</SelectItem>
                            <SelectItem value="50">Top 50</SelectItem>
                            <SelectItem value="100">Top 100</SelectItem>
                            <SelectItem value="all">All</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={kwicSort} onValueChange={setKwicSort}>
                          <SelectTrigger className="h-7 text-xs w-32" data-testid="select-kwic-sort">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="corpus">Corpus Order</SelectItem>
                            <SelectItem value="play">By Play</SelectItem>
                            <SelectItem value="speaker">By Speaker</SelectItem>
                            <SelectItem value="act">By Act</SelectItem>
                            <SelectItem value="scene">By Scene</SelectItem>
                            <SelectItem value="time">By Time</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => {
                            const ew = wordData?.word || selectedWord.trim().toLowerCase();
                            const sc = corpusScope === "play" ? (selectedPlayTitle || "play").replace(/\s+/g, "_") : corpusScope;
                            exportToCsv(`lexical_kwic_${ew}_${sc}.csv`, display.map(r => ({
                              search_word: r.searchWord, surface_match: r.match,
                              play: r.play, speaker: r.speaker, act: r.act, scene: r.scene,
                              unit: r.unit, time: r.time, left_context: r.left, match: r.match,
                              right_context: r.right, full_excerpt: r.fullExcerpt,
                            })));
                          }}
                          data-testid="button-kwic-export"
                        >
                          <Download className="w-3 h-3 mr-1" />CSV
                        </Button>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          Showing {display.length.toLocaleString()} of {totalFiltered.toLocaleString()} results
                        </span>
                      </div>
                      {kwicData.length === 0 ? (
                        <p className="text-xs text-muted-foreground" data-testid="text-kwic-empty">
                          No concordance lines found for "{selectedWord.trim()}" in the current corpus selection.
                        </p>
                      ) : (
                        <div className="rounded-md border">
                          <Table wrapperClassName="relative w-full max-h-[500px] overflow-y-auto overflow-x-auto">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur text-right w-[28%]">Left</TableHead>
                                <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur text-center w-[9%]">Match</TableHead>
                                <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur w-[28%]">Right</TableHead>
                                <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Play</TableHead>
                                <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Speaker</TableHead>
                                <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Act</TableHead>
                                <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Sc</TableHead>
                                <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Unit</TableHead>
                                <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Time</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {display.map((r, i) => (
                                <TableRow key={i} className="h-8 hover:bg-muted/30" data-testid={`row-kwic-${i}`}>
                                  <TableCell className="py-1 text-[10px] text-right text-muted-foreground font-mono whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">{r.left}</TableCell>
                                  <TableCell className="py-1 text-[10px] text-center">
                                    <span className="font-bold bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded" data-testid={`text-kwic-match-${i}`}>{r.match}</span>
                                  </TableCell>
                                  <TableCell className="py-1 text-[10px] text-muted-foreground font-mono whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">{r.right}</TableCell>
                                  <TableCell className="py-1 text-[10px]" data-testid={`text-kwic-play-${i}`}>{r.play}</TableCell>
                                  <TableCell className="py-1 text-[10px]" data-testid={`text-kwic-speaker-${i}`}>{r.speaker}</TableCell>
                                  <TableCell className="py-1 text-[10px] tabular-nums">{r.act}</TableCell>
                                  <TableCell className="py-1 text-[10px] tabular-nums">{r.scene}</TableCell>
                                  <TableCell className="py-1 text-[10px]">{r.unit}</TableCell>
                                  <TableCell className="py-1 text-[10px] tabular-nums">{r.time}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none border-muted/60" data-testid="section-word-comparison">
          <CardContent className="pt-6 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide">Word Comparison</h4>
              <p className="text-[10px] text-muted-foreground">Compare the corpus distribution of multiple user-selected words.</p>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <Input
                placeholder="Enter a word…"
                value={comparisonInput}
                onChange={e => { setComparisonInput(e.target.value); setCompWarning(""); }}
                onKeyDown={e => e.key === "Enter" && addCompWord()}
                className="h-7 text-xs max-w-[180px]"
                data-testid="input-comparison-word"
              />
              <Button size="sm" variant="outline" onClick={addCompWord} className="h-7 text-xs" data-testid="button-add-comparison-word">
                <Plus className="w-3 h-3 mr-1" />Add Word
              </Button>
              {comparisonWords.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => { setComparisonWords([]); setCompWarning(""); }} className="h-7 text-xs text-muted-foreground" data-testid="button-clear-comparison">
                  Clear All
                </Button>
              )}
            </div>
            {compWarning && <p className="text-[10px] text-amber-600 dark:text-amber-400">{compWarning}</p>}
            {comparisonWords.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="comparison-chips">
                {comparisonWords.map(w => (
                  <Badge key={w} variant="secondary" className="text-xs pr-1 gap-1" data-testid={`badge-comp-${w}`}>
                    {w}
                    <button onClick={() => setComparisonWords(p => p.filter(x => x !== w))} className="text-muted-foreground hover:text-foreground ml-0.5" data-testid={`button-comp-remove-${w}`}>
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {comparisonWords.length < 2 ? (
              <p className="text-xs text-muted-foreground" data-testid="text-comparison-min">Add at least two words to create a comparison set.</p>
            ) : !comparisonData || comparisonData.stats.every(s => s.freq === 0) ? (
              <p className="text-xs text-muted-foreground" data-testid="text-comparison-empty">None of the selected words occur in the current corpus selection.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-md bg-muted/30 border text-xs">
                  <div><div className="text-[10px] uppercase font-bold text-muted-foreground">Words Compared</div><div className="font-semibold tabular-nums" data-testid="text-comp-count">{comparisonWords.length}</div></div>
                  <div><div className="text-[10px] uppercase font-bold text-muted-foreground">Combined Frequency</div><div className="font-semibold tabular-nums" data-testid="text-comp-total">{comparisonData.stats.reduce((s,r) => s + r.freq, 0).toLocaleString()}</div></div>
                  <div><div className="text-[10px] uppercase font-bold text-muted-foreground">Most Frequent Word</div><div className="font-mono font-semibold" data-testid="text-comp-top-freq">{[...comparisonData.stats].sort((a,b) => b.freq - a.freq)[0]?.word || "—"}</div></div>
                  <div><div className="text-[10px] uppercase font-bold text-muted-foreground">Widest Distribution</div><div className="font-mono font-semibold" data-testid="text-comp-top-dist">{[...comparisonData.stats].sort((a,b) => b.playsCount - a.playsCount)[0]?.word || "—"}</div></div>
                </div>

                <div className="flex gap-2 flex-wrap items-center">
                  {(["summary","play","time"] as const).map(v => (
                    <Button key={v} size="sm" variant={comparisonView === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setComparisonView(v)} data-testid={`button-comp-view-${v}`}>
                      {v === "summary" ? "Summary" : v === "play" ? "By Play" : "Over Time"}
                    </Button>
                  ))}
                  <div className="ml-auto">
                    {comparisonView === "summary" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-comp-export-summary"
                        onClick={() => {
                          const sc = corpusScope === "play" ? (selectedPlayTitle || "play").replace(/\s+/g,"_") : corpusScope;
                          exportToCsv(`lexical_word_comparison_summary_${sc}.csv`, comparisonData.stats.map(r => ({
                            word: r.word, frequency: r.freq, relative_frequency_per_10k: r.relFreq,
                            plays_represented: r.playsCount, most_represented_play: r.mostPlay,
                            first_seen: r.firstSeen ?? "Unknown", last_seen: r.lastSeen ?? "Unknown"
                          })));
                        }}><Download className="w-3 h-3 mr-1"/>CSV</Button>
                    )}
                    {comparisonView === "play" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-comp-export-play"
                        onClick={() => {
                          const sc = corpusScope === "play" ? (selectedPlayTitle || "play").replace(/\s+/g,"_") : corpusScope;
                          exportToCsv(`lexical_word_comparison_by_play_${sc}.csv`, comparisonData.byPlay.map(r => ({ play: r.play, ...Object.fromEntries(comparisonWords.map(w => [w, r.counts[w] || 0])) })));
                        }}><Download className="w-3 h-3 mr-1"/>CSV</Button>
                    )}
                    {comparisonView === "time" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-comp-export-time"
                        onClick={() => {
                          const sc = corpusScope === "play" ? (selectedPlayTitle || "play").replace(/\s+/g,"_") : corpusScope;
                          exportToCsv(`lexical_word_comparison_over_time_${sc}.csv`, comparisonData.overTime.map(r => ({ time_slice: r["slice"], ...Object.fromEntries(comparisonWords.map(w => [w, r[w] || 0])) })));
                        }}><Download className="w-3 h-3 mr-1"/>CSV</Button>
                    )}
                  </div>
                </div>

                {comparisonView === "summary" && (
                  <>
                  <div className="rounded-md border">
                    <Table wrapperClassName="relative w-full max-h-[400px] overflow-y-auto overflow-x-auto">
                      <TableHeader>
                        <TableRow>
                          {[["Word","word"],["Frequency","freq"],["Rel/10k","relFreq"],["Plays","playsCount"],["Most Represented Play","mostPlay"],["First Seen","firstSeen"],["Last Seen","lastSeen"]].map(([label,key]) => (
                            <TableHead key={key} className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur" onClick={() => setComparisonSort(s => s === key ? `-${key}` : key)}>
                              <button className="inline-flex items-center gap-1 hover:text-foreground">{label}<ArrowUpDown className="w-2.5 h-2.5"/></button>
                            </TableHead>
                          ))}
                          <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Inspect</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          let rows = [...comparisonData.stats];
                          const sk = comparisonSort.replace(/^-/,"");
                          const asc = !comparisonSort.startsWith("-");
                          if (sk !== "order") rows.sort((a,b) => {
                            const av = (a as any)[sk]; const bv = (b as any)[sk];
                            if (av === null || av === undefined) return 1;
                            if (bv === null || bv === undefined) return -1;
                            return typeof av === "number" ? (asc ? av - bv : bv - av) : (asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av)));
                          });
                          return rows.map((r,i) => (
                            <TableRow key={r.word} className="h-8 hover:bg-muted/30" data-testid={`row-comp-summary-${i}`}>
                              <TableCell className="py-1 text-[10px] font-mono font-semibold" data-testid={`text-comp-word-${i}`}>{r.word}</TableCell>
                              <TableCell className="py-1 text-[10px] tabular-nums" data-testid={`text-comp-freq-${i}`}>{r.freq.toLocaleString()}</TableCell>
                              <TableCell className="py-1 text-[10px] tabular-nums">{r.relFreq}</TableCell>
                              <TableCell className="py-1 text-[10px] tabular-nums">
                                <button onClick={() => setDrillWord(dw => dw === r.word ? "" : r.word)} className={`tabular-nums underline-offset-2 hover:underline ${drillWord === r.word ? "text-primary font-bold" : "text-primary"}`} data-testid={`button-drill-plays-${i}`}>{r.playsCount}</button>
                              </TableCell>
                              <TableCell className="py-1 text-[10px] truncate max-w-[140px]" title={r.mostPlay}>{r.mostPlay}</TableCell>
                              <TableCell className="py-1 text-[10px] tabular-nums">{r.firstSeen ?? "Unknown"}</TableCell>
                              <TableCell className="py-1 text-[10px] tabular-nums">{r.lastSeen ?? "Unknown"}</TableCell>
                              <TableCell className="py-1 text-[10px]">
                                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={() => setSelectedWord(r.word)} data-testid={`button-comp-inspect-${i}`}>Inspect</Button>
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-3 space-y-2 border-t pt-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h5 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        {drillWord ? `Play Distribution — ${drillWord}` : "Play Distribution"}
                      </h5>
                      {drillWord && (
                        <div className="flex gap-2 items-center flex-wrap">
                          <Input placeholder="Search play…" value={drillSearch} onChange={e => setDrillSearch(e.target.value)} className="h-6 text-[10px] max-w-[130px]" data-testid="input-drill-search" />
                          <Select value={drillLimit} onValueChange={(v: any) => setDrillLimit(v)}>
                            <SelectTrigger className="h-6 text-[10px] w-[72px]" data-testid="select-drill-limit"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="20">Top 20</SelectItem>
                              <SelectItem value="50">Top 50</SelectItem>
                              <SelectItem value="all">All</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="outline" className="h-6 text-[10px]" data-testid="button-drill-export"
                            onClick={() => {
                              const sc = corpusScope === "play" ? (selectedPlayTitle || "play").replace(/\s+/g,"_") : corpusScope;
                              exportToCsv(`lexical_word_comparison_play_distribution_${drillWord}_${sc}.csv`,
                                drillRows.map(r => ({ word: drillWord, play: r.play, frequency: r.freq, relative_frequency_per_10k: r.relFreq, share_of_word_total_pct: r.share }))
                              );
                            }}><Download className="w-3 h-3 mr-1"/>CSV</Button>
                        </div>
                      )}
                    </div>
                    {!drillWord ? (
                      <p className="text-[10px] text-muted-foreground" data-testid="text-drill-empty">Select a word's play count to inspect its full play distribution.</p>
                    ) : drillRows.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground" data-testid="text-drill-no-match">No plays match the current search.</p>
                    ) : (
                      <div className="rounded-md border">
                        <Table wrapperClassName="relative w-full max-h-[420px] overflow-y-auto overflow-x-auto">
                          <TableHeader>
                            <TableRow>
                              {[["Play","play"],["Frequency","freq"],["Rel/10k","relFreq"],["Share %","share"]].map(([label,key]) => (
                                <TableHead key={key} className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur cursor-pointer" onClick={() => setDrillSort(s => { const k = s.replace(/^-/,""); return k === key ? (s.startsWith("-") ? key : `-${key}`) : `-${key}`; })} data-testid={`th-drill-${key}`}>
                                  <button className="inline-flex items-center gap-1 hover:text-foreground">{label}<ArrowUpDown className="w-2.5 h-2.5"/></button>
                                </TableHead>
                              ))}
                              <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Inspect</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {drillRows.map((r, i) => (
                              <TableRow key={r.play} className="h-8 hover:bg-muted/30" data-testid={`row-drill-${i}`}>
                                <TableCell className="py-1 text-[10px]">{r.play}</TableCell>
                                <TableCell className="py-1 text-[10px] tabular-nums">{r.freq.toLocaleString()}</TableCell>
                                <TableCell className="py-1 text-[10px] tabular-nums">{r.relFreq}</TableCell>
                                <TableCell className="py-1 text-[10px] tabular-nums">{r.share}%</TableCell>
                                <TableCell className="py-1 text-[10px]">
                                  <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={() => setSelectedWord(drillWord)} data-testid={`button-drill-inspect-${i}`}>Inspect</Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                  </>
                )}

                {comparisonView === "play" && (
                  <div className="rounded-md border">
                    <Table wrapperClassName="relative w-full max-h-[450px] overflow-y-auto overflow-x-auto">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-[10px] sticky top-0 left-0 z-30 bg-muted/95 backdrop-blur">Play</TableHead>
                          {comparisonWords.map(w => (
                            <TableHead key={w} className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur text-right">{w}</TableHead>
                          ))}
                          <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur text-right font-bold">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparisonData.byPlay.map((r,i) => (
                          <TableRow key={r.play} className="h-8 hover:bg-muted/30" data-testid={`row-comp-play-${i}`}>
                            <TableCell className="py-1 text-[10px] sticky left-0 z-10 bg-background">{r.play}</TableCell>
                            {comparisonWords.map(w => (
                              <TableCell key={w} className="py-1 text-[10px] tabular-nums text-right">{r.counts[w] || 0}</TableCell>
                            ))}
                            <TableCell className="py-1 text-[10px] tabular-nums text-right font-semibold">{r.total}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {comparisonView === "time" && (
                  <div className="space-y-2">
                    {comparisonData.overTime.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No time metadata available for the current corpus selection.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={comparisonData.overTime} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="slice" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} width={36} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {comparisonWords.map((w, i) => (
                            <Line key={w} type="monotone" dataKey={w} stroke={COMP_COLORS[i % COMP_COLORS.length]} dot={false} strokeWidth={2} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    <p className="text-[10px] italic text-muted-foreground">Raw frequency is shown for the active corpus and time selection. Frequency is grouped by decade.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" data-testid="section-collocates">
        <div>
          <h3 className="text-sm font-bold">C. Collocates</h3>
          <p className="text-xs text-muted-foreground">Words occurring characteristically near the selected word, ranked by association strength.</p>
        </div>
        <Card className="shadow-none border-muted/60">
          <CardContent className="pt-6 space-y-4">
            {!selectedWord.trim() ? (
              <p className="text-xs text-muted-foreground" data-testid="text-collocates-prompt">Enter a word in Word Explorer to calculate its collocates.</p>
            ) : collocData.nodeFreq === 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="text-collocates-not-found">The selected word does not occur in the current corpus selection.</p>
            ) : (() => {
              let rows = [...collocData.rows];
              rows = rows.filter(r => r.cooc >= collocSettings.minCooc && r.collocFreq >= collocSettings.minColFreq);
              if (collocSettings.position === "left") rows = rows.filter(r => r.leftFreq > 0);
              else if (collocSettings.position === "right") rows = rows.filter(r => r.rightFreq > 0);
              if (collocSearch.trim()) { const q = collocSearch.trim().toLowerCase(); rows = rows.filter(r => r.collocate.includes(q)); }
              rows.sort((a, b) => collocSettings.ranking === "cooc" ? b.cooc - a.cooc : b.logdice - a.logdice);
              const totalFiltered = rows.length;
              if (collocLimit !== "all") rows = rows.slice(0, parseInt(collocLimit));
              const maxLogDice = Math.max(...rows.map(r => r.logdice), 1);
              const maxCooc = Math.max(...rows.map(r => r.cooc), 1);
              const strongestRow = collocData.rows.filter(r => r.cooc >= collocSettings.minCooc).sort((a, b) => b.logdice - a.logdice)[0];
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold">Context Window</Label>
                      <Select value={String(collocSettings.window)} onValueChange={v => setCollocSettings(s => ({ ...s, window: parseInt(v) }))}>
                        <SelectTrigger className="h-7 text-xs w-24" data-testid="select-colloc-window"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">±2 tokens</SelectItem>
                          <SelectItem value="3">±3 tokens</SelectItem>
                          <SelectItem value="5">±5 tokens</SelectItem>
                          <SelectItem value="10">±10 tokens</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold">Min Co-occ</Label>
                      <Select value={String(collocSettings.minCooc)} onValueChange={v => setCollocSettings(s => ({ ...s, minCooc: parseInt(v) }))}>
                        <SelectTrigger className="h-7 text-xs w-20" data-testid="select-colloc-min-cooc"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["1","2","3","5","10"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold">Min Col Freq</Label>
                      <Select value={String(collocSettings.minColFreq)} onValueChange={v => setCollocSettings(s => ({ ...s, minColFreq: parseInt(v) }))}>
                        <SelectTrigger className="h-7 text-xs w-20" data-testid="select-colloc-min-freq"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["1","2","3","5","10"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold">Ranking</Label>
                      <Select value={collocSettings.ranking} onValueChange={v => setCollocSettings(s => ({ ...s, ranking: v as "logdice" | "cooc" }))}>
                        <SelectTrigger className="h-7 text-xs w-28" data-testid="select-colloc-ranking"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="logdice">LogDice</SelectItem>
                          <SelectItem value="cooc">Co-occurrence</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold">Position</Label>
                      <Select value={collocSettings.position} onValueChange={v => setCollocSettings(s => ({ ...s, position: v as "both" | "left" | "right" }))}>
                        <SelectTrigger className="h-7 text-xs w-28" data-testid="select-colloc-position"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">Both Sides</SelectItem>
                          <SelectItem value="left">Left Only</SelectItem>
                          <SelectItem value="right">Right Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs p-3 rounded-md bg-muted/30 border">
                    <div><div className="text-[10px] uppercase font-bold text-muted-foreground">Node Word</div><div className="font-mono font-semibold">{wordData?.word || selectedWord.trim().toLowerCase()}</div></div>
                    <div><div className="text-[10px] uppercase font-bold text-muted-foreground">Node Frequency</div><div className="font-semibold tabular-nums" data-testid="text-colloc-node-freq">{collocData.nodeFreq.toLocaleString()}</div></div>
                    <div><div className="text-[10px] uppercase font-bold text-muted-foreground">Eligible Collocates</div><div className="font-semibold tabular-nums" data-testid="text-colloc-count">{totalFiltered.toLocaleString()}</div></div>
                    <div><div className="text-[10px] uppercase font-bold text-muted-foreground">Strongest Collocate</div><div className="font-mono font-semibold truncate text-[10px]" title={strongestRow?.collocate}>{strongestRow?.collocate || "—"}</div></div>
                    <div><div className="text-[10px] uppercase font-bold text-muted-foreground">Context Window</div><div className="font-semibold">±{collocSettings.window} tokens</div></div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <Input placeholder="Search collocates…" value={collocSearch} onChange={e => setCollocSearch(e.target.value)} className="h-7 text-xs max-w-[180px]" data-testid="input-colloc-search" />
                    <Select value={collocLimit} onValueChange={setCollocLimit}>
                      <SelectTrigger className="h-7 text-xs w-24" data-testid="select-colloc-limit"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20">Top 20</SelectItem>
                        <SelectItem value="50">Top 50</SelectItem>
                        <SelectItem value="100">Top 100</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => {
                        const nw = wordData?.word || selectedWord.trim().toLowerCase();
                        const sc = corpusScope === "play" ? (selectedPlayTitle || "play").replace(/\s+/g, "_") : corpusScope;
                        exportToCsv(`lexical_collocates_${nw}_${sc}.csv`, rows.map(r => ({
                          node_word: nw, collocate: r.collocate, logdice: r.logdice,
                          cooccurrence: r.cooc, left_frequency: r.leftFreq, right_frequency: r.rightFreq,
                          collocate_frequency: r.collocFreq, dominant_position: r.dominantPos,
                          window_size: collocSettings.window, minimum_cooccurrence: collocSettings.minCooc,
                          minimum_collocate_frequency: collocSettings.minColFreq, position_filter: collocSettings.position,
                        })));
                      }}
                      data-testid="button-colloc-export"
                    >
                      <Download className="w-3 h-3 mr-1" />CSV
                    </Button>
                    <span className="text-[10px] text-muted-foreground ml-auto">Showing {rows.length.toLocaleString()} of {totalFiltered.toLocaleString()} collocates</span>
                  </div>

                  <p className="text-[10px] italic text-muted-foreground">
                    LogDice compares the observed co-occurrence frequency with the overall corpus frequencies of the node word and collocate. Higher values indicate stronger association under the current corpus and window settings.
                  </p>

                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground" data-testid="text-colloc-empty">No collocates meet the current frequency and window settings.</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table wrapperClassName="relative w-full max-h-[500px] overflow-y-auto overflow-x-auto">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Collocate</TableHead>
                            <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">LogDice</TableHead>
                            <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Co-occ</TableHead>
                            <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur text-right">Left</TableHead>
                            <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur text-right">Right</TableHead>
                            <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur text-right">Col Freq</TableHead>
                            <TableHead className="h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur">Position</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r, i) => (
                            <TableRow key={r.collocate} className="h-8 hover:bg-muted/30" data-testid={`row-colloc-${i}`}>
                              <TableCell className="py-1 text-[10px] font-mono font-semibold" data-testid={`text-colloc-word-${i}`}>{r.collocate}</TableCell>
                              <TableCell className="py-1 text-[10px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="tabular-nums w-10 shrink-0" data-testid={`text-colloc-logdice-${i}`}>{r.logdice.toFixed(2)}</span>
                                  <div className="h-1.5 rounded-full bg-primary/15 overflow-hidden flex-1 min-w-[40px]">
                                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.max(0, (r.logdice / maxLogDice) * 100).toFixed(1)}%` }} />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-1 text-[10px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="tabular-nums w-8 shrink-0" data-testid={`text-colloc-cooc-${i}`}>{r.cooc}</span>
                                  <div className="h-1.5 rounded-full bg-amber-200/60 overflow-hidden flex-1 min-w-[40px]">
                                    <div className="h-full rounded-full bg-amber-500/60" style={{ width: `${Math.max(0, (r.cooc / maxCooc) * 100).toFixed(1)}%` }} />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-1 text-[10px] tabular-nums text-right">{r.leftFreq}</TableCell>
                              <TableCell className="py-1 text-[10px] tabular-nums text-right">{r.rightFreq}</TableCell>
                              <TableCell className="py-1 text-[10px] tabular-nums text-right">{r.collocFreq.toLocaleString()}</TableCell>
                              <TableCell className="py-1 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-medium ${r.dominantPos === "Left" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : r.dominantPos === "Right" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>
                                  {r.dominantPos}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

// --- Semantic Tab ---
const EXPRESSION_NGRAM_LENGTHS = [2, 3, 4, 5];
const EXPRESSION_NGRAM_LENGTH_OPTIONS: { value: "2-5" | "2" | "3" | "4" | "5"; label: string }[] = [
  { value: "2-5", label: "2–5 tokens (Recommended)" },
  { value: "2", label: "Bigrams only" },
  { value: "3", label: "Trigrams only" },
  { value: "4", label: "Four-grams only" },
  { value: "5", label: "Five-grams only" },
];

interface ExpressionCandidate {
  expression: string;
  n: number;
  frequency: number;
  scope: string;
}

const ExpressionSnapshotTable = ({ data, filename, selectedExpression, onSelect }: { data: ExpressionCandidate[]; filename: string; selectedExpression?: string | null; onSelect?: (expr: string | null) => void }) => {
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof ExpressionCandidate; direction: "asc" | "desc" }>({ key: "frequency", direction: "desc" });
  const { toast } = useToast();

  const filteredData = useMemo(() => {
    let processed = [...data];
    if (search) {
      const lowerSearch = search.toLowerCase();
      processed = processed.filter(row => String(row.expression).toLowerCase().includes(lowerSearch));
    }
    processed.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return processed;
  }, [data, search, sortConfig]);

  const maxFrequency = useMemo(() => filteredData.reduce((max, row) => Math.max(max, row.frequency), 1), [filteredData]);

  const handleSort = (key: keyof ExpressionCandidate) => {
    setSortConfig(prev => prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "desc" });
  };

  const copyToClipboard = () => {
    const header = ["Expression", "Length", "Frequency", "Scope"].join("\t");
    const rows = filteredData.map(row => [row.expression, row.n, row.frequency, row.scope].join("\t")).join("\n");
    navigator.clipboard.writeText(`${header}\n${rows}`);
    toast({ title: "Copied to clipboard", description: `Copied ${filteredData.length} rows.` });
  };

  const handleExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportFilename = `${filename.replace(".csv", "")}_${timestamp}.csv`;
    const rows = filteredData.map(row => ({ expression: row.expression, n: row.n, frequency: row.frequency, scope: row.scope }));
    exportToCsv(exportFilename, rows);
  };

  const sortIndicator = (key: keyof ExpressionCandidate) => (
    <button onClick={() => handleSort(key)} className="inline-flex items-center gap-1 hover:text-foreground" data-testid={`button-sort-${key}`}>
      {key === "n" ? "Length" : key === "expression" ? "Expression" : key === "frequency" ? "Frequency" : "Scope"}
      <ArrowUpDown className="h-2.5 w-2.5" />
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search expressions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs pl-8"
            data-testid="input-expression-search"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={copyToClipboard} className="h-8 w-8" title="Copy as TSV" data-testid="button-copy-expressions"><Clipboard className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon" onClick={handleExport} className="h-8 w-8" title="Export CSV" data-testid="button-export-expressions"><Download className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="rounded-md border bg-background overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 text-[10px] bg-muted/50">{sortIndicator("expression")}</TableHead>
              <TableHead className="h-8 text-[10px] bg-muted/50 text-right">{sortIndicator("n")}</TableHead>
              <TableHead className="h-8 text-[10px] bg-muted/50 text-right">{sortIndicator("frequency")}</TableHead>
              <TableHead className="h-8 text-[10px] bg-muted/50">{sortIndicator("scope")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((row, i) => {
              const barPct = maxFrequency > 0 ? Math.max(4, Math.round((row.frequency / maxFrequency) * 100)) : 0;
              return (
                <TableRow key={i} className={`h-8 ${onSelect ? "cursor-pointer" : ""} ${row.expression === selectedExpression ? "bg-muted/60" : ""}`} onClick={() => onSelect?.(row.expression === selectedExpression ? null : row.expression)} data-testid={`row-expression-${i}`}>
                  <TableCell className="py-1 text-[10px]" data-testid={`text-expression-${i}`}>{row.expression}</TableCell>
                  <TableCell className="py-1 text-[10px] text-right" data-testid={`text-length-${i}`}>{row.n}</TableCell>
                  <TableCell className="py-1 text-[10px]" data-testid={`text-frequency-${i}`}>
                    <div className="flex items-center justify-end gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[80px]">
                        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="tabular-nums w-6 text-right">{row.frequency}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1 text-[10px]" data-testid={`text-scope-${i}`}>{row.scope}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="text-[10px] text-muted-foreground px-1" data-testid="text-expression-table-count">
        Showing {filteredData.length}{search ? ` of ${data.length}` : ""} results
      </div>
    </div>
  );
};

interface ExpressionFamily {
  pattern: string;
  members: { expression: string; frequency: number }[];
  memberCount: number;
  totalFrequency: number;
  mostFrequentMember: string;
}

const buildExpressionFamilies = (candidates: ExpressionCandidate[]): ExpressionFamily[] => {
  const byLength = new Map<number, ExpressionCandidate[]>();
  candidates.forEach(c => {
    if (!byLength.has(c.n)) byLength.set(c.n, []);
    byLength.get(c.n)!.push(c);
  });

  const rawGroups = new Map<string, { pattern: string; members: Map<string, ExpressionCandidate> }>();

  byLength.forEach((group, n) => {
    group.forEach(candidate => {
      const tokens = candidate.expression.split(" ");
      if (tokens.length !== n) return;
      for (let i = 0; i < n; i++) {
        const templateTokens = [...tokens];
        templateTokens[i] = "[X]";
        const pattern = templateTokens.join(" ");
        const key = `${n}::${pattern}`;
        if (!rawGroups.has(key)) rawGroups.set(key, { pattern, members: new Map() });
        rawGroups.get(key)!.members.set(candidate.expression, candidate);
      }
    });
  });

  const seenMemberSets = new Set<string>();
  const families: ExpressionFamily[] = [];

  rawGroups.forEach(({ pattern, members: membersMap }) => {
    if (membersMap.size < 2) return;
    const members = Array.from(membersMap.values()).sort((a, b) => b.frequency - a.frequency);
    const memberSetKey = `${pattern}::${members.map(m => m.expression).sort().join(",")}`;
    if (seenMemberSets.has(memberSetKey)) return;
    seenMemberSets.add(memberSetKey);
    const totalFrequency = members.reduce((sum, m) => sum + m.frequency, 0);
    families.push({
      pattern,
      members: members.map(m => ({ expression: m.expression, frequency: m.frequency })),
      memberCount: members.length,
      totalFrequency,
      mostFrequentMember: members[0].expression,
    });
  });

  families.sort((a, b) => b.totalFrequency - a.totalFrequency || b.memberCount - a.memberCount);
  return families;
};

type FamilySortKey = "pattern" | "memberCount" | "totalFrequency" | "mostFrequentMember";

const ExpressionFamilyPanel = ({ families, filename, speeches, useStoplist, useLemmas, evidencePlayFilename, evidenceExprFilename, contextEvidenceFilename }: { families: ExpressionFamily[]; filename: string; speeches: any[]; useStoplist: boolean; useLemmas: boolean; evidencePlayFilename: string; evidenceExprFilename: string; contextEvidenceFilename: string }) => {
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: FamilySortKey; direction: "asc" | "desc" }>({ key: "totalFrequency", direction: "desc" });
  const [showLimit, setShowLimit] = useState<"20" | "50" | "100" | "all">("50");

  const filteredFamilies = useMemo(() => {
    let processed = [...families];
    if (search) {
      const lowerSearch = search.toLowerCase();
      processed = processed.filter(f => f.pattern.toLowerCase().includes(lowerSearch) || f.mostFrequentMember.toLowerCase().includes(lowerSearch));
    }
    processed.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return processed;
  }, [families, search, sortConfig]);

  const displayedFamilies = useMemo(() => {
    if (showLimit === "all") return filteredFamilies;
    return filteredFamilies.slice(0, parseInt(showLimit));
  }, [filteredFamilies, showLimit]);

  useEffect(() => {
    if (!displayedFamilies.length) { setSelectedPattern(null); return; }
    if (selectedPattern && !displayedFamilies.some(f => f.pattern === selectedPattern)) {
      setSelectedPattern(null);
    }
  }, [displayedFamilies, selectedPattern]);

  const maxTotalFrequency = useMemo(() => displayedFamilies.reduce((max, f) => Math.max(max, f.totalFrequency), 1), [displayedFamilies]);
  const selected = useMemo(() => displayedFamilies.find(f => f.pattern === selectedPattern) || null, [displayedFamilies, selectedPattern]);

  const selectedMemberExpressions = useMemo(
    () => selected ? selected.members.map(m => m.expression) : [],
    [selected]
  );

  const handleSort = (key: FamilySortKey) => {
    setSortConfig(prev => prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "desc" });
  };

  const handleExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportFilename = `${filename.replace(".csv", "")}_${timestamp}.csv`;
    const rows = displayedFamilies.map(f => ({
      family: f.pattern,
      member_expressions: f.memberCount,
      total_frequency: f.totalFrequency,
      representative_expression: f.mostFrequentMember,
    }));
    exportToCsv(exportFilename, rows);
  };

  const sortIndicator = (key: FamilySortKey, label: string, align: "left" | "right" = "left") => (
    <button onClick={() => handleSort(key)} className={`inline-flex items-center gap-1 hover:text-foreground ${align === "right" ? "flex-row-reverse w-full justify-start" : ""}`} data-testid={`button-sort-family-${key}`}>
      {label}
      <ArrowUpDown className="h-2.5 w-2.5" />
    </button>
  );

  if (!families.length) {
    return (
      <Card className="shadow-none border-muted/60 border-dashed">
        <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-family-empty">
          No recurring expression families were identified for the current selection.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm min-w-[180px]">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search families..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs pl-8"
            data-testid="input-family-search"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="family-show-limit" className="text-[10px] uppercase font-bold text-muted-foreground">Show</Label>
          <Select value={showLimit} onValueChange={v => setShowLimit(v as typeof showLimit)}>
            <SelectTrigger id="family-show-limit" className="h-8 text-xs w-28" data-testid="select-family-show-limit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20" className="text-xs">Top 20</SelectItem>
              <SelectItem value="50" className="text-xs">Top 50</SelectItem>
              <SelectItem value="100" className="text-xs">Top 100</SelectItem>
              <SelectItem value="all" className="text-xs">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleExport} className="h-8 w-8" title="Export CSV" data-testid="button-export-families"><Download className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="rounded-md border bg-background overflow-y-auto" style={{ maxHeight: "450px" }}>
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">{sortIndicator("pattern", "Family Pattern")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">{sortIndicator("memberCount", "Member Expressions", "right")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">{sortIndicator("totalFrequency", "Total Frequency", "right")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">{sortIndicator("mostFrequentMember", "Representative Expression")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedFamilies.map((f, i) => {
                const barPct = maxTotalFrequency > 0 ? Math.max(4, Math.round((f.totalFrequency / maxTotalFrequency) * 100)) : 0;
                return (
                  <TableRow
                    key={f.pattern}
                    onClick={() => setSelectedPattern(f.pattern)}
                    className={`h-8 cursor-pointer ${f.pattern === selectedPattern ? "bg-muted/60" : ""}`}
                    data-testid={`row-family-${i}`}
                  >
                    <TableCell className="py-1 text-[10px] font-mono" data-testid={`text-family-pattern-${i}`}>{f.pattern}</TableCell>
                    <TableCell className="py-1 text-[10px] text-right" data-testid={`text-family-members-${i}`}>{f.memberCount}</TableCell>
                    <TableCell className="py-1 text-[10px]" data-testid={`text-family-frequency-${i}`}>
                      <div className="flex items-center justify-end gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[60px]">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${barPct}%` }} />
                        </div>
                        <span className="tabular-nums w-8 text-right">{f.totalFrequency}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1 text-[10px]" data-testid={`text-family-top-${i}`}>{f.mostFrequentMember}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <Card className="shadow-none border-muted/60 h-full flex flex-col" data-testid="card-family-members">
          <CardHeader className="pb-3 bg-muted/5 border-b">
            <CardTitle className="text-xs font-semibold" data-testid="text-family-members-title">
              {selected ? `Family Members — ${selected.pattern}` : "Family Members"}
            </CardTitle>
            <CardDescription className="text-[10px]">
              {selected ? "Member expressions within the selected family, with frequency share." : "Select an expression family to inspect its member expressions."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {selected ? (
              <div className="rounded-md border bg-background overflow-y-auto" style={{ maxHeight: "450px" }}>
                <Table>
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">Member Expression</TableHead>
                      <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">Frequency</TableHead>
                      <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">% of Family</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.members.map((m, i) => (
                      <TableRow key={m.expression} className="h-8" data-testid={`row-family-member-${i}`}>
                        <TableCell className="py-1 text-[10px]" data-testid={`text-family-member-expression-${i}`}>{m.expression}</TableCell>
                        <TableCell className="py-1 text-[10px] text-right" data-testid={`text-family-member-frequency-${i}`}>{m.frequency}</TableCell>
                        <TableCell className="py-1 text-[10px] text-right" data-testid={`text-family-member-pct-${i}`}>{selected.totalFrequency > 0 ? ((m.frequency / selected.totalFrequency) * 100).toFixed(1) : "0.0"}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-6 text-center" data-testid="text-family-members-empty">
                Select an expression family to inspect its member expressions.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {selected && (
        <CorpusEvidencePanel
          speeches={speeches}
          useStoplist={useStoplist}
          useLemmas={useLemmas}
          expressions={selectedMemberExpressions}
          label={selected.pattern}
          playDistFilename={evidencePlayFilename}
          exprEvidenceFilename={evidenceExprFilename}
          contextEvidenceFilename={contextEvidenceFilename}
        />
      )}
      <div className="text-[10px] text-muted-foreground px-1" data-testid="text-family-table-count">
        Showing {displayedFamilies.length} of {filteredFamilies.length} families{search ? ` (filtered from ${families.length})` : ""}
      </div>
    </div>
  );
};

interface ConventionalisationRow {
  pattern: string;
  indicator: number;
  band: "High" | "Moderate" | "Low";
  familyFrequency: number;
  representativeDominance: number;
  familySize: number;
  lexicalDiversity: number;
  avgMemberFrequency: number;
  representativeExpression: string;
  freqComponent: number;
  dominanceComponent: number;
  avgFreqComponent: number;
}

type ConvSortKey = "indicator" | "familyFrequency" | "representativeDominance" | "familySize" | "pattern" | "representativeExpression";

const getConvBand = (indicator: number): "High" | "Moderate" | "Low" =>
  indicator >= 70 ? "High" : indicator >= 40 ? "Moderate" : "Low";

const CONV_BAND_CLASS: Record<string, string> = {
  High: "text-emerald-600 dark:text-emerald-400",
  Moderate: "text-amber-600 dark:text-amber-400",
  Low: "text-muted-foreground",
};

const buildConventionalisationRows = (families: ExpressionFamily[]): ConventionalisationRow[] => {
  if (!families.length) return [];
  const raw = families.map(f => ({
    pattern: f.pattern,
    familyFrequency: f.totalFrequency,
    representativeDominance: f.totalFrequency > 0 ? (f.members[0].frequency / f.totalFrequency) * 100 : 0,
    familySize: f.memberCount,
    lexicalDiversity: f.memberCount,
    avgMemberFrequency: f.memberCount > 0 ? f.totalFrequency / f.memberCount : 0,
    representativeExpression: f.mostFrequentMember,
  }));
  const maxFreq = Math.max(...raw.map(r => r.familyFrequency), 1);
  const maxAvgFreq = Math.max(...raw.map(r => r.avgMemberFrequency), 1);
  return raw.map(r => {
    const freqComponent = (r.familyFrequency / maxFreq) * 100;
    const dominanceComponent = r.representativeDominance;
    const avgFreqComponent = (r.avgMemberFrequency / maxAvgFreq) * 100;
    const indicator = Math.round((freqComponent + dominanceComponent + avgFreqComponent) / 3);
    const band = getConvBand(indicator);
    return { ...r, indicator, band, freqComponent, dominanceComponent, avgFreqComponent };
  }).sort((a, b) => b.indicator - a.indicator);
};

const ConvBreakdownBar = ({ label, value, testId }: { label: string; value: number; testId: string }) => (
  <div className="space-y-0.5">
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium" data-testid={testId}>{value.toFixed(1)}</span>
    </div>
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${Math.max(2, value)}%` }} />
    </div>
  </div>
);

const ConventionalisationPanel = ({ families, filename, speeches, useStoplist, useLemmas, evidencePlayFilename, evidenceExprFilename, contextEvidenceFilename }: { families: ExpressionFamily[]; filename: string; speeches: any[]; useStoplist: boolean; useLemmas: boolean; evidencePlayFilename: string; evidenceExprFilename: string; contextEvidenceFilename: string }) => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: ConvSortKey; direction: "asc" | "desc" }>({ key: "indicator", direction: "desc" });
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  const rows = useMemo(() => buildConventionalisationRows(families), [families]);

  const filteredRows = useMemo(() => {
    let processed = [...rows];
    if (search) {
      const lowerSearch = search.toLowerCase();
      processed = processed.filter(r => r.pattern.toLowerCase().includes(lowerSearch) || r.representativeExpression.toLowerCase().includes(lowerSearch));
    }
    processed.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return processed;
  }, [rows, search, sortConfig]);

  useEffect(() => {
    if (!filteredRows.length) { setSelectedPattern(null); return; }
    if (selectedPattern && !filteredRows.some(r => r.pattern === selectedPattern)) {
      setSelectedPattern(null);
    }
  }, [filteredRows, selectedPattern]);

  const maxIndicator = useMemo(() => filteredRows.reduce((m, r) => Math.max(m, r.indicator), 1), [filteredRows]);
  const selectedRow = useMemo(() => filteredRows.find(r => r.pattern === selectedPattern) || null, [filteredRows, selectedPattern]);

  const selectedFamilyMembers = useMemo(() => {
    if (!selectedPattern) return [];
    const fam = families.find(f => f.pattern === selectedPattern);
    return fam ? fam.members.map(m => m.expression) : [];
  }, [families, selectedPattern]);

  const handleSort = (key: ConvSortKey) => {
    setSortConfig(prev => prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "desc" });
  };

  const handleExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rows_export = filteredRows.map(r => ({
      family: r.pattern,
      conventionalisation_indicator: r.indicator,
      indicator_band: r.band,
      family_frequency: r.familyFrequency,
      family_size: r.familySize,
      representative_dominance_pct: r.representativeDominance.toFixed(1),
      representative_expression: r.representativeExpression,
      frequency_component: r.freqComponent.toFixed(1),
      dominance_component: r.dominanceComponent.toFixed(1),
      avg_member_freq_component: r.avgFreqComponent.toFixed(1),
    }));
    exportToCsv(`${filename.replace(".csv", "")}_${timestamp}.csv`, rows_export);
  };

  const copyToClipboard = () => {
    const header = ["Family Pattern", "Indicator", "Band", "Family Frequency", "Rep. Dominance %", "Family Size", "Representative Expression"].join("\t");
    const tsv = filteredRows.map(r => [r.pattern, r.indicator, r.band, r.familyFrequency, r.representativeDominance.toFixed(1), r.familySize, r.representativeExpression].join("\t")).join("\n");
    navigator.clipboard.writeText(`${header}\n${tsv}`);
    toast({ title: "Copied to clipboard", description: `Copied ${filteredRows.length} rows.` });
  };

  const sortBtn = (key: ConvSortKey, label: string) => (
    <button onClick={() => handleSort(key)} className="inline-flex items-center gap-1 hover:text-foreground" data-testid={`button-sort-conv-${key}`}>
      {label}<ArrowUpDown className="h-2.5 w-2.5" />
    </button>
  );

  if (!rows.length) {
    return (
      <Card className="shadow-none border-muted/60 border-dashed">
        <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-conv-empty">
          No sufficient expression families are available to calculate conventionalisation indicators.
        </CardContent>
      </Card>
    );
  }

  const topCandidate = rows[0];
  const avgIndicator = rows.length ? (rows.reduce((s, r) => s + r.indicator, 0) / rows.length).toFixed(1) : "—";
  const highestDominance = [...rows].sort((a, b) => b.representativeDominance - a.representativeDominance)[0];
  const largestFamily = [...rows].sort((a, b) => b.familySize - a.familySize)[0];

  return (
    <div className="space-y-4">
      <Card className="shadow-none border-muted/60">
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="md:col-span-1">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Top Conventionalisation Candidate</div>
            <div className="font-mono font-semibold truncate mt-0.5" data-testid="text-conv-top-candidate" title={topCandidate.pattern}>{topCandidate.pattern}</div>
            <div className={`text-[10px] font-semibold mt-0.5 ${CONV_BAND_CLASS[topCandidate.band]}`}>{topCandidate.band} · {topCandidate.indicator}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Representative: {topCandidate.representativeExpression}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Average Indicator</div>
            <div className="font-semibold mt-0.5" data-testid="text-conv-avg-indicator">{avgIndicator}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Highest Dominance</div>
            <div className="font-semibold truncate mt-0.5" data-testid="text-conv-highest-dominance" title={highestDominance.pattern}>{highestDominance.pattern}</div>
            <div className="text-[10px] text-muted-foreground">{highestDominance.representativeDominance.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Largest Family</div>
            <div className="font-semibold truncate mt-0.5" data-testid="text-conv-largest-family" title={largestFamily.pattern}>{largestFamily.pattern}</div>
            <div className="text-[10px] text-muted-foreground">{largestFamily.familySize} members</div>
          </div>
        </CardContent>
      </Card>

      <Alert className="border-muted/40 bg-muted/10 py-2">
        <Info className="h-3 w-3" />
        <AlertDescription className="text-[10px] text-muted-foreground">
          <span className="font-semibold">High, Moderate, and Low labels</span> are descriptive bands for comparison within the current result set. They do not classify expressions as definitively formulaic or entrenched.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm min-w-[180px]">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search families..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs pl-8"
            data-testid="input-conv-search"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={copyToClipboard} className="h-8 w-8" title="Copy as TSV" data-testid="button-copy-conv"><Clipboard className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon" onClick={handleExport} className="h-8 w-8" title="Export CSV" data-testid="button-export-conv"><Download className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 rounded-md border bg-background overflow-y-auto" style={{ maxHeight: "450px" }}>
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">{sortBtn("pattern", "Family Pattern")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">{sortBtn("indicator", "Indicator")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">{sortBtn("familyFrequency", "Family Freq.")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">{sortBtn("representativeDominance", "Rep. Dom.")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">{sortBtn("familySize", "Size")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">{sortBtn("representativeExpression", "Rep. Expression")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r, i) => {
                const barPct = maxIndicator > 0 ? Math.max(4, Math.round((r.indicator / maxIndicator) * 100)) : 0;
                const isSelected = r.pattern === selectedPattern;
                return (
                  <TableRow
                    key={r.pattern}
                    className={`h-8 cursor-pointer ${isSelected ? "bg-muted/60" : ""}`}
                    onClick={() => setSelectedPattern(r.pattern)}
                    data-testid={`row-conv-${i}`}
                  >
                    <TableCell className="py-1 text-[10px] font-mono" data-testid={`text-conv-pattern-${i}`}>{r.pattern}</TableCell>
                    <TableCell className="py-1 text-[10px]" data-testid={`text-conv-indicator-${i}`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-semibold w-14 shrink-0 ${CONV_BAND_CLASS[r.band]}`} data-testid={`text-conv-band-${i}`}>{r.band} · {r.indicator}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[60px]">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-1 text-[10px] text-right" data-testid={`text-conv-frequency-${i}`}>{r.familyFrequency}</TableCell>
                    <TableCell className="py-1 text-[10px] text-right" data-testid={`text-conv-dominance-${i}`}>{r.representativeDominance.toFixed(1)}%</TableCell>
                    <TableCell className="py-1 text-[10px] text-right" data-testid={`text-conv-size-${i}`}>{r.familySize}</TableCell>
                    <TableCell className="py-1 text-[10px]" data-testid={`text-conv-rep-${i}`}>{r.representativeExpression}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <Card className="shadow-none border-muted/60" data-testid="card-conv-evidence">
          <CardHeader className="pb-3 bg-muted/5 border-b">
            <CardTitle className="text-xs font-semibold" data-testid="text-conv-evidence-title">Selected Candidate Evidence</CardTitle>
            <CardDescription className="text-[10px]">Indicator breakdown for the selected expression family.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {selectedRow ? (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <div className="font-mono text-[10px] font-semibold" data-testid="text-conv-evidence-pattern">{selectedRow.pattern}</div>
                  <div className={`text-[10px] font-semibold ${CONV_BAND_CLASS[selectedRow.band]}`} data-testid="text-conv-evidence-band">{selectedRow.band} · {selectedRow.indicator}</div>
                  <div className="text-[10px] text-muted-foreground">Representative: {selectedRow.representativeExpression}</div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground border-t pt-3">
                  <div>Family Frequency <span className="font-semibold text-foreground">{selectedRow.familyFrequency}</span></div>
                  <div>Family Size <span className="font-semibold text-foreground">{selectedRow.familySize}</span></div>
                  <div>Rep. Dominance <span className="font-semibold text-foreground">{selectedRow.representativeDominance.toFixed(1)}%</span></div>
                  <div>Avg. Member Freq. <span className="font-semibold text-foreground">{selectedRow.avgMemberFrequency.toFixed(1)}</span></div>
                </div>
                <div className="space-y-2 border-t pt-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Indicator Breakdown</div>
                  <ConvBreakdownBar label="Frequency contribution" value={selectedRow.freqComponent} testId="text-conv-evidence-freq-component" />
                  <ConvBreakdownBar label="Dominance contribution" value={selectedRow.dominanceComponent} testId="text-conv-evidence-dom-component" />
                  <ConvBreakdownBar label="Avg. member freq. contribution" value={selectedRow.avgFreqComponent} testId="text-conv-evidence-avg-component" />
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-4 text-center" data-testid="text-conv-evidence-empty">
                Select a candidate from the table to inspect its evidence.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedPattern && (
        <CorpusEvidencePanel
          speeches={speeches}
          useStoplist={useStoplist}
          useLemmas={useLemmas}
          expressions={selectedFamilyMembers}
          label={selectedPattern}
          playDistFilename={evidencePlayFilename}
          exprEvidenceFilename={evidenceExprFilename}
          contextEvidenceFilename={contextEvidenceFilename}
        />
      )}
      <div className="text-[10px] text-muted-foreground px-1" data-testid="text-conv-table-count">
        Showing {filteredRows.length}{search ? ` of ${rows.length}` : ""} families
      </div>
    </div>
  );
};

// --- Diachronic Expression Change ---

type TemporalBehaviour = "Persistent" | "Emerging" | "Declining" | "Intermittent" | "Transient";

interface DiacRow {
  key: string;
  n?: number;
  totalFrequency: number;
  firstSeen: string;
  lastSeen: string;
  slicesPresent: number;
  temporalBehaviour: TemporalBehaviour;
  sliceFreqs: Record<string, number>;
}

type DiacSortKey = "key" | "totalFrequency" | "firstSeen" | "lastSeen" | "slicesPresent" | "temporalBehaviour";

const DIAC_BEHAVIOUR_CLASS: Record<string, string> = {
  Persistent: "text-emerald-600 dark:text-emerald-400",
  Emerging: "text-blue-600 dark:text-blue-400",
  Declining: "text-orange-600 dark:text-orange-400",
  Intermittent: "text-amber-600 dark:text-amber-400",
  Transient: "text-muted-foreground",
};

const getDiacBehaviour = (presentSlices: string[], allSlices: string[]): TemporalBehaviour => {
  const total = allSlices.length;
  if (total === 0 || presentSlices.length === 0) return "Transient";
  if (presentSlices.length === 1) return "Transient";
  const firstIdx = allSlices.indexOf(presentSlices[0]);
  const lastIdx = allSlices.indexOf(presentSlices[presentSlices.length - 1]);
  const span = lastIdx - firstIdx;
  const count = presentSlices.length;
  const isContiguous = presentSlices.every((s, i) => {
    if (i === 0) return true;
    return allSlices.indexOf(s) === allSlices.indexOf(presentSlices[i - 1]) + 1;
  });
  if (count >= 3 && span >= total / 2) return "Persistent";
  if (firstIdx > total / 3 && lastIdx >= (total * 2) / 3) return "Emerging";
  if (firstIdx <= total / 3 && lastIdx < (total * 2) / 3) return "Declining";
  if (!isContiguous) return "Intermittent";
  return "Intermittent";
};

const DiachronicExpressionPanel = ({
  speeches, expressionScope, nodeLemma, useStoplist, useLemmas, activeNgramLengths,
  minExpressionFreq, expressionFamilies, timeMode, candidateFilename, familyFilename,
  evidencePlayFilename, evidenceExprFilename, contextEvidenceFilename,
  precomputedCandidateRows, precomputedAllSlices,
}: {
  speeches: any[];
  expressionScope: "node" | "corpus";
  nodeLemma: string;
  useStoplist: boolean;
  useLemmas: boolean;
  activeNgramLengths: number[];
  minExpressionFreq: number;
  expressionFamilies: ExpressionFamily[];
  timeMode: string;
  candidateFilename: string;
  familyFilename: string;
  evidencePlayFilename: string;
  evidenceExprFilename: string;
  contextEvidenceFilename: string;
  precomputedCandidateRows?: DiacRow[];
  precomputedAllSlices?: string[];
}) => {
  const [diacObject, setDiacObject] = useState<"candidates" | "families">("candidates");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: DiacSortKey; direction: "asc" | "desc" }>({ key: "totalFrequency", direction: "desc" });
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(100);

  const processedNode = useMemo(() => {
    if (expressionScope !== "node" || !nodeLemma.trim()) return "";
    return processTokens(nodeLemma, { useStoplist: false, useLemmas })[0] || nodeLemma.trim().toLowerCase();
  }, [expressionScope, nodeLemma, useLemmas]);

  const allSlices = useMemo(() => {
    if (precomputedAllSlices !== undefined) return precomputedAllSlices;
    const sliceSet = new Set<string>();
    speeches.forEach(s => {
      const raw = timeMode === "year" ? (s.year_est || s.year_mid || s.year_min) : (s.decade || s.decade_num);
      if (raw != null && raw !== "") sliceSet.add(formatTimeValue(raw));
    });
    return Array.from(sliceSet).sort();
  }, [speeches, timeMode, precomputedAllSlices]);

  const candidateRows = useMemo((): DiacRow[] => {
    if (precomputedCandidateRows !== undefined) return precomputedCandidateRows;
    if (!speeches.length) return [];
    if (expressionScope === "node" && !nodeLemma.trim()) return [];
    const exprMap = new Map<string, { n: number; slices: Map<string, number> }>();
    speeches.forEach(s => {
      const raw = timeMode === "year" ? (s.year_est || s.year_mid || s.year_min) : (s.decade || s.decade_num);
      if (raw == null || raw === "") return;
      const slice = formatTimeValue(raw);
      const tokens = processTokens(s.text_raw || "", { useStoplist, useLemmas });
      activeNgramLengths.forEach(n => {
        for (let i = 0; i + n <= tokens.length; i++) {
          const gram = tokens.slice(i, i + n);
          if (expressionScope === "node" && !gram.includes(processedNode)) continue;
          const key = gram.join(" ");
          if (!exprMap.has(key)) exprMap.set(key, { n, slices: new Map() });
          const entry = exprMap.get(key)!;
          entry.slices.set(slice, (entry.slices.get(slice) || 0) + 1);
        }
      });
    });
    const rows: DiacRow[] = [];
    exprMap.forEach((entry, expression) => {
      const totalFrequency = Array.from(entry.slices.values()).reduce((s, v) => s + v, 0);
      if (totalFrequency < minExpressionFreq) return;
      const presentSlices = Array.from(entry.slices.keys()).sort();
      const sliceFreqs: Record<string, number> = {};
      entry.slices.forEach((v, k) => { sliceFreqs[k] = v; });
      rows.push({
        key: expression, n: entry.n, totalFrequency,
        firstSeen: presentSlices[0] || "—",
        lastSeen: presentSlices[presentSlices.length - 1] || "—",
        slicesPresent: presentSlices.length,
        temporalBehaviour: getDiacBehaviour(presentSlices, allSlices),
        sliceFreqs,
      });
    });
    return rows.sort((a, b) => b.totalFrequency - a.totalFrequency);
  }, [speeches, expressionScope, nodeLemma, processedNode, useStoplist, useLemmas, activeNgramLengths, minExpressionFreq, timeMode, allSlices, precomputedCandidateRows]);

  const familyRows = useMemo((): DiacRow[] => {
    if (!expressionFamilies.length || !candidateRows.length) return [];
    const exprLookup = new Map<string, Record<string, number>>();
    candidateRows.forEach(r => exprLookup.set(r.key, r.sliceFreqs));
    return expressionFamilies.map(family => {
      const familySliceMap = new Map<string, number>();
      family.members.forEach(m => {
        const sf = exprLookup.get(m.expression);
        if (!sf) return;
        Object.entries(sf).forEach(([slice, count]) => {
          familySliceMap.set(slice, (familySliceMap.get(slice) || 0) + count);
        });
      });
      const totalFrequency = Array.from(familySliceMap.values()).reduce((s, v) => s + v, 0);
      const presentSlices = Array.from(familySliceMap.keys()).sort();
      const sliceFreqs: Record<string, number> = {};
      familySliceMap.forEach((v, k) => { sliceFreqs[k] = v; });
      return {
        key: family.pattern, totalFrequency,
        firstSeen: presentSlices[0] || "—",
        lastSeen: presentSlices[presentSlices.length - 1] || "—",
        slicesPresent: presentSlices.length,
        temporalBehaviour: getDiacBehaviour(presentSlices, allSlices),
        sliceFreqs,
      };
    }).filter(r => r.totalFrequency > 0).sort((a, b) => b.totalFrequency - a.totalFrequency);
  }, [expressionFamilies, candidateRows, allSlices]);

  const activeRows = diacObject === "candidates" ? candidateRows : familyRows;

  const filteredRows = useMemo(() => {
    let processed = [...activeRows];
    if (search) {
      const ls = search.toLowerCase();
      processed = processed.filter(r => r.key.toLowerCase().includes(ls));
    }
    processed.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return processed;
  }, [activeRows, search, sortConfig]);

  useEffect(() => {
    if (!filteredRows.length) { setSelectedKey(null); return; }
    if (selectedKey && !filteredRows.some(r => r.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [filteredRows, selectedKey]);

  useEffect(() => { setVisibleCount(100); }, [filteredRows]);

  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);
  const selectedRow = filteredRows.find(r => r.key === selectedKey) || null;
  const maxFreq = useMemo(() => filteredRows.reduce((m, r) => Math.max(m, r.totalFrequency), 1), [filteredRows]);

  const evidenceExpressions = useMemo(() => {
    if (!selectedRow) return [];
    if (diacObject === "candidates") return [selectedRow.key];
    const fam = expressionFamilies.find(f => f.pattern === selectedRow.key);
    return fam ? fam.members.map(m => m.expression) : [];
  }, [selectedRow, diacObject, expressionFamilies]);

  const mostPersistent = useMemo(() =>
    activeRows.reduce<DiacRow | null>((best, r) => (!best || r.slicesPresent > best.slicesPresent) ? r : best, null),
  [activeRows]);
  const mostFrequent = activeRows[0] || null;
  const dominantBehaviour = useMemo(() => {
    if (!activeRows.length) return "—";
    const counts: Record<string, number> = {};
    activeRows.forEach(r => { counts[r.temporalBehaviour] = (counts[r.temporalBehaviour] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  }, [activeRows]);

  const handleSort = (key: DiacSortKey) => {
    setSortConfig(prev => prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "desc" });
  };

  const handleExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = diacObject === "candidates" ? candidateFilename : familyFilename;
    const rows_export = filteredRows.map(r => ({
      [diacObject === "candidates" ? "expression" : "family_pattern"]: r.key,
      ...(diacObject === "candidates" && r.n !== undefined ? { length: r.n } : {}),
      total_frequency: r.totalFrequency,
      first_seen: r.firstSeen,
      last_seen: r.lastSeen,
      slices_present: r.slicesPresent,
      temporal_behaviour: r.temporalBehaviour,
    }));
    exportToCsv(`${filename.replace(".csv", "")}_${timestamp}.csv`, rows_export);
  };

  const sortBtn = (key: DiacSortKey, label: string) => (
    <button onClick={() => handleSort(key)} className="inline-flex items-center gap-1 hover:text-foreground" data-testid={`button-sort-diac-${key}`}>
      {label}<ArrowUpDown className="h-2.5 w-2.5" />
    </button>
  );

  if (expressionScope === "node" && !nodeLemma.trim()) {
    return (
      <Card className="shadow-none border-muted/60 border-dashed">
        <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-diac-empty-no-node">
          Enter a node lemma to view node-centred diachronic expression evidence.
        </CardContent>
      </Card>
    );
  }

  if (!candidateRows.length) {
    return (
      <Card className="shadow-none border-muted/60 border-dashed">
        <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-diac-empty">
          No sufficient diachronic expression evidence is available for the current selection.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="text-[10px] uppercase font-bold text-muted-foreground">Diachronic Object</div>
        <div className="flex rounded-md border overflow-hidden h-7">
          <button type="button" onClick={() => { setDiacObject("candidates"); setSelectedKey(null); }}
            className={`px-3 text-xs font-medium transition-colors ${diacObject === "candidates" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            data-testid="button-diac-candidates">
            Expression Candidates
          </button>
          <button type="button" onClick={() => { setDiacObject("families"); setSelectedKey(null); }}
            className={`px-3 text-xs font-medium border-l transition-colors ${diacObject === "families" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            data-testid="button-diac-families">
            Expression Families
          </button>
        </div>
      </div>

      <Card className="shadow-none border-muted/60">
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Tracked {diacObject === "candidates" ? "Candidates" : "Families"}</div>
            <div className="font-semibold" data-testid="text-diac-tracked-count">{activeRows.length}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Most Persistent</div>
            <div className="font-mono font-semibold truncate" data-testid="text-diac-most-persistent" title={mostPersistent?.key}>{mostPersistent?.key || "—"}</div>
            <div className="text-[10px] text-muted-foreground">{mostPersistent ? `${mostPersistent.slicesPresent} slices` : ""}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Most Frequent</div>
            <div className="font-mono font-semibold truncate" data-testid="text-diac-most-frequent" title={mostFrequent?.key}>{mostFrequent?.key || "—"}</div>
            <div className="text-[10px] text-muted-foreground">{mostFrequent ? `freq: ${mostFrequent.totalFrequency}` : ""}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Dominant Behaviour</div>
            <div className={`font-semibold ${DIAC_BEHAVIOUR_CLASS[dominantBehaviour] || ""}`} data-testid="text-diac-dominant-behaviour">{dominantBehaviour}</div>
          </div>
        </CardContent>
      </Card>

      <Alert className="border-muted/40 bg-muted/10 py-2">
        <Info className="h-3 w-3" />
        <AlertDescription className="text-[10px] text-muted-foreground">
          <span className="font-semibold">Temporal behaviour categories</span> describe how often an expression or expression family appears across available time slices. They are descriptive indicators and should not be read as definitive evidence of semantic change.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm min-w-[180px]">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pl-8" data-testid="input-diac-search" />
        </div>
        <Button variant="outline" size="icon" onClick={handleExport} className="h-8 w-8" title="Export CSV" data-testid="button-export-diac"><Download className="h-3.5 w-3.5" /></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 rounded-md border bg-background overflow-y-auto" style={{ maxHeight: "450px" }}>
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">{sortBtn("key", diacObject === "candidates" ? "Expression" : "Family Pattern")}</TableHead>
                {diacObject === "candidates" && <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">Len.</TableHead>}
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">{sortBtn("totalFrequency", "Total Freq.")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">{sortBtn("firstSeen", "First Seen")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">{sortBtn("lastSeen", "Last Seen")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">{sortBtn("slicesPresent", "Slices")}</TableHead>
                <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">{sortBtn("temporalBehaviour", "Behaviour")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((r, i) => {
                const barPct = maxFreq > 0 ? Math.max(4, Math.round((r.totalFrequency / maxFreq) * 100)) : 0;
                const isSelected = r.key === selectedKey;
                return (
                  <TableRow key={r.key} className={`h-8 cursor-pointer ${isSelected ? "bg-muted/60" : ""}`}
                    onClick={() => setSelectedKey(r.key)} data-testid={`row-diac-${i}`}>
                    <TableCell className="py-1 text-[10px] font-mono" data-testid={`text-diac-key-${i}`}>{r.key}</TableCell>
                    {diacObject === "candidates" && <TableCell className="py-1 text-[10px] text-right">{r.n}</TableCell>}
                    <TableCell className="py-1 text-[10px]" data-testid={`text-diac-freq-${i}`}>
                      <div className="flex items-center justify-end gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[60px]">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${barPct}%` }} />
                        </div>
                        <span className="tabular-nums w-6 text-right">{r.totalFrequency}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1 text-[10px]" data-testid={`text-diac-first-${i}`}>{r.firstSeen}</TableCell>
                    <TableCell className="py-1 text-[10px]" data-testid={`text-diac-last-${i}`}>{r.lastSeen}</TableCell>
                    <TableCell className="py-1 text-[10px] text-right" data-testid={`text-diac-slices-${i}`}>{r.slicesPresent}</TableCell>
                    <TableCell className="py-1 text-[10px]" data-testid={`text-diac-behaviour-${i}`}>
                      <span className={DIAC_BEHAVIOUR_CLASS[r.temporalBehaviour] || ""}>{r.temporalBehaviour}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibleCount < filteredRows.length && (
                <TableRow>
                  <TableCell colSpan={diacObject === "candidates" ? 7 : 6} className="py-2 text-center">
                    <button
                      onClick={() => setVisibleCount(c => c + 100)}
                      className="text-[10px] text-primary hover:underline"
                      data-testid="button-diac-load-more"
                    >
                      Load 100 more ({filteredRows.length - visibleCount} remaining)
                    </button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <Card className="shadow-none border-muted/60" data-testid="card-diac-drilldown">
          <CardHeader className="pb-3 bg-muted/5 border-b">
            <CardTitle className="text-xs font-semibold" data-testid="text-diac-drilldown-title">Slice Frequency Breakdown</CardTitle>
            <CardDescription className="text-[10px]">Frequency by time slice for the selected {diacObject === "candidates" ? "expression" : "family"}.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {selectedRow ? (
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <div className="font-mono text-[10px] font-semibold" data-testid="text-diac-drilldown-key">{selectedRow.key}</div>
                  <div className={`text-[10px] font-semibold ${DIAC_BEHAVIOUR_CLASS[selectedRow.temporalBehaviour] || ""}`}>{selectedRow.temporalBehaviour}</div>
                  <div className="text-[10px] text-muted-foreground">{selectedRow.slicesPresent} of {allSlices.length} slices · Total: {selectedRow.totalFrequency}</div>
                </div>
                <div className="border-t pt-3 space-y-1 overflow-y-auto" style={{ maxHeight: "300px" }}>
                  <div className="grid grid-cols-3 text-[9px] uppercase font-bold text-muted-foreground pb-1">
                    <span>Slice</span><span className="text-right">Freq.</span><span></span>
                  </div>
                  {allSlices.map(slice => {
                    const freq = selectedRow.sliceFreqs[slice] || 0;
                    const maxSliceFreq = Math.max(...allSlices.map(s => selectedRow.sliceFreqs[s] || 0), 1);
                    const pct = Math.round((freq / maxSliceFreq) * 100);
                    return (
                      <div key={slice} className={`grid grid-cols-3 items-center text-[10px] ${freq === 0 ? "opacity-30" : ""}`} data-testid={`row-diac-slice-${slice}`}>
                        <span className="tabular-nums">{slice}</span>
                        <span className="tabular-nums text-right">{freq > 0 ? freq : "—"}</span>
                        <div className="pl-2">
                          {freq > 0 && <div className="h-1.5 rounded-full bg-primary/50" style={{ width: `${Math.max(4, pct)}%` }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-4 text-center" data-testid="text-diac-drilldown-empty">
                Select a row to view its slice frequency breakdown.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedRow && (
        <CorpusEvidencePanel
          speeches={speeches}
          useStoplist={useStoplist}
          useLemmas={useLemmas}
          expressions={evidenceExpressions}
          label={selectedRow.key}
          playDistFilename={evidencePlayFilename}
          exprEvidenceFilename={evidenceExprFilename}
          contextEvidenceFilename={contextEvidenceFilename}
        />
      )}
      <div className="text-[10px] text-muted-foreground px-1" data-testid="text-diac-table-count">
        Showing {visibleRows.length} of {filteredRows.length}{search ? ` (filtered from ${activeRows.length})` : ""} {diacObject === "candidates" ? "candidates" : "families"} · {allSlices.length} time slices · Click a row to view its breakdown
      </div>
    </div>
  );
};

// --- Corpus Evidence Panel ---
const CorpusEvidencePanel = ({
  speeches,
  useStoplist,
  useLemmas,
  expressions,
  label,
  playDistFilename,
  exprEvidenceFilename,
  contextEvidenceFilename,
}: {
  speeches: any[];
  useStoplist: boolean;
  useLemmas: boolean;
  expressions: string[];
  label: string;
  playDistFilename: string;
  exprEvidenceFilename: string;
  contextEvidenceFilename: string;
}) => {
  const [playSearch, setPlaySearch] = useState("");
  const [exprSearch, setExprSearch] = useState("");
  const [playShowLimit, setPlayShowLimit] = useState<"20" | "50" | "all">("20");
  const [selectedEvidenceKey, setSelectedEvidenceKey] = useState<string | null>(null);
  const [contextSearch, setContextSearch] = useState("");
  const [contextShowLimit, setContextShowLimit] = useState<"20" | "50" | "all">("20");

  useEffect(() => { setSelectedEvidenceKey(null); setContextSearch(""); }, [expressions]);

  const evidenceData = useMemo(() => {
    if (!expressions.length || !speeches.length) return null;
    const exprTokenArrays = expressions.map(e => e.split(" "));
    const playMap = new Map<string, { count: number; distinct: Set<string> }>();
    const exprPlayMap = new Map<string, Map<string, number>>();
    speeches.forEach(speech => {
      const tokens = processTokens(speech.text_raw || "", { useStoplist, useLemmas });
      const title = speech.title || speech.play_id || "Unknown";
      exprTokenArrays.forEach((exprTokens, idx) => {
        const expression = expressions[idx];
        const n = exprTokens.length;
        let count = 0;
        for (let i = 0; i + n <= tokens.length; i++) {
          let match = true;
          for (let j = 0; j < n; j++) { if (tokens[i + j] !== exprTokens[j]) { match = false; break; } }
          if (match) count++;
        }
        if (count > 0) {
          if (!playMap.has(title)) playMap.set(title, { count: 0, distinct: new Set() });
          playMap.get(title)!.count += count;
          playMap.get(title)!.distinct.add(expression);
          if (!exprPlayMap.has(expression)) exprPlayMap.set(expression, new Map());
          const pm = exprPlayMap.get(expression)!;
          pm.set(title, (pm.get(title) || 0) + count);
        }
      });
    });
    const totalOccurrences = Array.from(playMap.values()).reduce((s, v) => s + v.count, 0);
    const playRows = Array.from(playMap.entries())
      .map(([play, data]) => ({
        play, occurrences: data.count,
        relativePct: totalOccurrences > 0 ? parseFloat(((data.count / totalOccurrences) * 100).toFixed(1)) : 0,
        distinctExpressions: data.distinct.size,
      }))
      .sort((a, b) => b.occurrences - a.occurrences);
    const expressionRows: { expression: string; play: string; frequency: number; length: number }[] = [];
    exprPlayMap.forEach((pm, expression) => {
      pm.forEach((freq, play) => { expressionRows.push({ expression, play, frequency: freq, length: expression.split(" ").length }); });
    });
    expressionRows.sort((a, b) => b.frequency - a.frequency);
    return {
      playRows, expressionRows,
      playCount: playRows.length,
      mostRepresentedPlay: playRows[0]?.play || "—",
      totalOccurrences,
      distinctExpressionsFound: expressions.filter(e => exprPlayMap.has(e)).length,
    };
  }, [expressions, speeches, useStoplist, useLemmas]);

  const filteredPlayRows = useMemo(() => {
    if (!evidenceData) return [];
    let rows = evidenceData.playRows;
    if (playSearch) { const ls = playSearch.toLowerCase(); rows = rows.filter(r => r.play.toLowerCase().includes(ls)); }
    const limit = playShowLimit === "all" ? rows.length : parseInt(playShowLimit);
    return rows.slice(0, limit);
  }, [evidenceData, playSearch, playShowLimit]);

  const filteredExprRows = useMemo(() => {
    if (!evidenceData) return [];
    if (!exprSearch) return evidenceData.expressionRows;
    const ls = exprSearch.toLowerCase();
    return evidenceData.expressionRows.filter(r => r.expression.toLowerCase().includes(ls) || r.play.toLowerCase().includes(ls));
  }, [evidenceData, exprSearch]);

  const contextData = useMemo((): { expression: string; play: string; speaker: string; act: string; scene: string; time: string; leftContext: string; matchText: string; rightContext: string; fullExcerpt: string; }[] => {
    if (!selectedEvidenceKey) return [];
    const sepIdx = selectedEvidenceKey.indexOf("::");
    if (sepIdx < 0) return [];
    const expression = selectedEvidenceKey.slice(0, sepIdx);
    const playFilter = selectedEvidenceKey.slice(sepIdx + 2);
    const exprTokens = expression.split(" ");
    const n = exprTokens.length;
    if (!n) return [];
    const speechesToScan = speeches.filter(s => (s.title || s.play_id || "Unknown") === playFilter);
    const results: { expression: string; play: string; speaker: string; act: string; scene: string; time: string; leftContext: string; matchText: string; rightContext: string; fullExcerpt: string; }[] = [];
    for (const speech of speechesToScan) {
      const rawText = speech.text_raw || "";
      if (!rawText) continue;
      const rawWords = rawText.split(/\s+/).filter((w: string) => w.length > 0);
      const noStopTokens = processTokens(rawText, { useStoplist: false, useLemmas });
      const fullTokens = processTokens(rawText, { useStoplist, useLemmas });
      const posMap: number[] = [];
      let fi = 0;
      for (let ni = 0; ni < noStopTokens.length && fi < fullTokens.length; ni++) {
        if (noStopTokens[ni] === fullTokens[fi]) { posMap.push(ni); fi++; }
      }
      for (let i = 0; i + n <= fullTokens.length; i++) {
        let match = true;
        for (let j = 0; j < n; j++) { if (fullTokens[i + j] !== exprTokens[j]) { match = false; break; } }
        if (match) {
          const rawStart = posMap[i] !== undefined ? posMap[i] : i;
          const rawEnd = posMap[i + n - 1] !== undefined ? posMap[i + n - 1] : (i + n - 1);
          const leftStart = Math.max(0, rawStart - 10);
          const rightEnd = Math.min(rawWords.length, rawEnd + 1 + 10);
          const time = speech.year_est || speech.year_mid || speech.decade || speech.year_min;
          results.push({
            expression,
            play: speech.title || speech.play_id || "Unknown",
            speaker: speech.speaker || "—",
            act: speech.act != null ? String(speech.act) : "—",
            scene: speech.scene != null ? String(speech.scene) : "—",
            time: time != null ? String(time) : "—",
            leftContext: rawWords.slice(leftStart, rawStart).join(" "),
            matchText: rawWords.slice(rawStart, rawEnd + 1).join(" "),
            rightContext: rawWords.slice(rawEnd + 1, rightEnd).join(" "),
            fullExcerpt: rawWords.slice(leftStart, rightEnd).join(" "),
          });
        }
      }
    }
    return results;
  }, [selectedEvidenceKey, speeches, useStoplist, useLemmas]);

  const filteredContextRows = useMemo(() => {
    let rows = contextData;
    if (contextSearch) {
      const ls = contextSearch.toLowerCase();
      rows = rows.filter(r => r.fullExcerpt.toLowerCase().includes(ls) || r.speaker.toLowerCase().includes(ls) || r.play.toLowerCase().includes(ls) || r.expression.toLowerCase().includes(ls));
    }
    const limit = contextShowLimit === "all" ? rows.length : parseInt(contextShowLimit);
    return rows.slice(0, limit);
  }, [contextData, contextSearch, contextShowLimit]);

  if (!expressions.length) return null;

  if (!evidenceData || !evidenceData.playCount) {
    return (
      <Card className="shadow-none border-muted/60 border-dashed">
        <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-evidence-empty">
          No corpus evidence found for the selected item.
        </CardContent>
      </Card>
    );
  }

  const handlePlayExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportToCsv(`${playDistFilename.replace(".csv", "")}_${timestamp}.csv`, evidenceData.playRows.map(r => ({
      play: r.play, occurrences: r.occurrences, relative_pct: r.relativePct, distinct_expressions: r.distinctExpressions,
    })));
  };

  const handleExprExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportToCsv(`${exprEvidenceFilename.replace(".csv", "")}_${timestamp}.csv`, evidenceData.expressionRows.map(r => ({
      expression: r.expression, play: r.play, frequency: r.frequency, length: r.length,
    })));
  };

  const handleContextExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    exportToCsv(`${contextEvidenceFilename.replace(".csv", "")}_${timestamp}.csv`, contextData.map(r => ({
      expression: r.expression, play: r.play, speaker: r.speaker, act: r.act, scene: r.scene,
      time: r.time, left_context: r.leftContext, match: r.matchText, right_context: r.rightContext, full_excerpt: r.fullExcerpt,
    })));
  };

  const maxOccurrences = evidenceData.playRows[0]?.occurrences || 1;

  return (
    <div className="space-y-4" data-testid="section-corpus-evidence">
      <div className="text-[10px] uppercase font-bold text-muted-foreground">
        Source Summary — <span className="font-mono normal-case font-normal">{label}</span>
      </div>
      <Card className="shadow-none border-muted/60">
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Play Count</div>
            <div className="font-semibold" data-testid="text-evidence-play-count">{evidenceData.playCount}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Most Represented Play</div>
            <div className="font-semibold truncate" data-testid="text-evidence-top-play" title={evidenceData.mostRepresentedPlay}>{evidenceData.mostRepresentedPlay}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Occurrences</div>
            <div className="font-semibold" data-testid="text-evidence-total-occ">{evidenceData.totalOccurrences}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Distinct Expressions</div>
            <div className="font-semibold" data-testid="text-evidence-distinct">{evidenceData.distinctExpressionsFound}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Play Distribution</div>
            <div className="flex items-center gap-2">
              <Select value={playShowLimit} onValueChange={v => setPlayShowLimit(v as typeof playShowLimit)}>
                <SelectTrigger className="h-7 text-xs w-24" data-testid="select-evidence-play-limit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="20" className="text-xs">Top 20</SelectItem>
                  <SelectItem value="50" className="text-xs">Top 50</SelectItem>
                  <SelectItem value="all" className="text-xs">All</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={handlePlayExport} className="h-7 w-7" title="Export Play Distribution CSV" data-testid="button-export-evidence-play"><Download className="h-3 w-3" /></Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search plays..." value={playSearch} onChange={e => setPlaySearch(e.target.value)} className="h-8 text-xs pl-8" data-testid="input-evidence-play-search" />
          </div>
          <div className="rounded-md border bg-background overflow-y-auto" style={{ maxHeight: "280px" }}>
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">Play</TableHead>
                  <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">Occurrences</TableHead>
                  <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">Relative %</TableHead>
                  <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">Distinct Expressions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayRows.map((r, i) => {
                  const barPct = maxOccurrences > 0 ? Math.max(4, Math.round((r.occurrences / maxOccurrences) * 100)) : 0;
                  return (
                    <TableRow key={r.play} className="h-8" data-testid={`row-evidence-play-${i}`}>
                      <TableCell className="py-1 text-[10px]" data-testid={`text-evidence-play-${i}`}>{r.play}</TableCell>
                      <TableCell className="py-1 text-[10px]" data-testid={`text-evidence-occ-${i}`}>
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[50px]">
                            <div className="h-full bg-primary/60 rounded-full" style={{ width: `${barPct}%` }} />
                          </div>
                          <span className="tabular-nums w-8 text-right">{r.occurrences}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1 text-[10px] text-right tabular-nums" data-testid={`text-evidence-pct-${i}`}>{r.relativePct}%</TableCell>
                      <TableCell className="py-1 text-[10px] text-right" data-testid={`text-evidence-distinct-${i}`}>{r.distinctExpressions}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="text-[10px] text-muted-foreground px-1">
            Showing {filteredPlayRows.length}{playSearch ? ` of ${evidenceData.playRows.length}` : ""} plays
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Expression Evidence</div>
            <Button variant="outline" size="icon" onClick={handleExprExport} className="h-7 w-7" title="Export Expression Evidence CSV" data-testid="button-export-evidence-expr"><Download className="h-3 w-3" /></Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search expressions or plays..." value={exprSearch} onChange={e => setExprSearch(e.target.value)} className="h-8 text-xs pl-8" data-testid="input-evidence-expr-search" />
          </div>
          <div className="rounded-md border bg-background overflow-y-auto" style={{ maxHeight: "280px" }}>
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">Expression</TableHead>
                  <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">Play</TableHead>
                  <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">Frequency</TableHead>
                  <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur text-right">Length</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExprRows.map((r, i) => {
                  const rowKey = `${r.expression}::${r.play}`;
                  return (
                    <TableRow key={rowKey} className={`h-8 cursor-pointer ${selectedEvidenceKey === rowKey ? "bg-muted/60" : ""}`} onClick={() => setSelectedEvidenceKey(selectedEvidenceKey === rowKey ? null : rowKey)} data-testid={`row-evidence-expr-${i}`}>
                      <TableCell className="py-1 text-[10px] font-mono" data-testid={`text-evidence-expr-${i}`}>{r.expression}</TableCell>
                      <TableCell className="py-1 text-[10px]" data-testid={`text-evidence-expr-play-${i}`}>{r.play}</TableCell>
                      <TableCell className="py-1 text-[10px] text-right tabular-nums" data-testid={`text-evidence-expr-freq-${i}`}>{r.frequency}</TableCell>
                      <TableCell className="py-1 text-[10px] text-right" data-testid={`text-evidence-expr-len-${i}`}>{r.length}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="text-[10px] text-muted-foreground px-1">
            Showing {filteredExprRows.length}{exprSearch ? ` of ${evidenceData.expressionRows.length}` : ""} expression occurrences · click a row to inspect contexts
          </div>
        </div>
      </div>

      <div className="space-y-2" data-testid="section-context-evidence">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[10px] uppercase font-bold text-muted-foreground">Context Evidence</div>
          <div className="flex items-center gap-2">
            <Select value={contextShowLimit} onValueChange={v => setContextShowLimit(v as typeof contextShowLimit)}>
              <SelectTrigger className="h-7 text-xs w-24" data-testid="select-context-limit"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="20" className="text-xs">Top 20</SelectItem>
                <SelectItem value="50" className="text-xs">Top 50</SelectItem>
                <SelectItem value="all" className="text-xs">All</SelectItem>
              </SelectContent>
            </Select>
            {contextData.length > 0 && (
              <Button variant="outline" size="icon" onClick={handleContextExport} className="h-7 w-7" title="Export Context Evidence CSV" data-testid="button-export-context"><Download className="h-3 w-3" /></Button>
            )}
          </div>
        </div>
        {!selectedEvidenceKey ? (
          <Card className="shadow-none border-muted/60 border-dashed">
            <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-context-prompt">
              Select an expression to inspect its source contexts.
            </CardContent>
          </Card>
        ) : contextData.length === 0 ? (
          <Card className="shadow-none border-muted/60 border-dashed">
            <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-context-empty">
              No source contexts are available for the current selection.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search contexts, speakers, plays..." value={contextSearch} onChange={e => setContextSearch(e.target.value)} className="h-8 text-xs pl-8" data-testid="input-context-search" />
            </div>
            <div className="rounded-md border bg-background overflow-y-auto" style={{ maxHeight: "480px" }}>
              <Table>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur w-28">Speaker</TableHead>
                    <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur w-10">Act</TableHead>
                    <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur w-12">Scene</TableHead>
                    <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur w-14">Time</TableHead>
                    <TableHead className="h-8 text-[10px] bg-muted/95 backdrop-blur">Context</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContextRows.map((r, i) => (
                    <TableRow key={i} className="h-auto align-top" data-testid={`row-context-${i}`}>
                      <TableCell className="py-2 text-[10px] font-semibold align-top" data-testid={`text-context-speaker-${i}`}>{r.speaker}</TableCell>
                      <TableCell className="py-2 text-[10px] tabular-nums align-top" data-testid={`text-context-act-${i}`}>{r.act}</TableCell>
                      <TableCell className="py-2 text-[10px] tabular-nums align-top" data-testid={`text-context-scene-${i}`}>{r.scene}</TableCell>
                      <TableCell className="py-2 text-[10px] tabular-nums align-top" data-testid={`text-context-time-${i}`}>{r.time}</TableCell>
                      <TableCell className="py-2 text-[10px] align-top leading-relaxed" data-testid={`text-context-excerpt-${i}`}>
                        <span className="text-muted-foreground">{r.leftContext} </span>
                        <mark className="bg-yellow-200 dark:bg-yellow-800 font-bold px-0.5 rounded-sm not-italic">{r.matchText}</mark>
                        <span className="text-muted-foreground"> {r.rightContext}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="text-[10px] text-muted-foreground px-1" data-testid="text-context-count">
              Showing {filteredContextRows.length}{contextSearch ? ` of ${contextData.length}` : ""} contexts
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const SemanticTab = () => {
  const ui = useUI();
  const { corpusScope, selectedPlayTitle, timeMode, selectedSpeeches: speeches, playwrightKey } = ui;
  const [nodeLemma, setNodeLemma] = useState("");
  const [useStoplist, setUseStoplist] = useState(true);
  const [useLemmas, setUseLemmas] = useState(true);

  const [expressionScope, setExpressionScope] = useState<"node" | "corpus">("node");
  const [scopePending, startScopeTransition] = useTransition();
  const [ngramLengthSetting, setNgramLengthSetting] = useState<"2-5" | "2" | "3" | "4" | "5">("2-5");
  const [minExpressionFreq, setMinExpressionFreq] = useState(2);
  const [expressionLengthFilter, setExpressionLengthFilter] = useState<"all" | "2" | "3" | "4" | "5">("all");
  const [showLimit, setShowLimit] = useState<"20" | "50" | "100" | "all">("50");
  const [selectedExpression, setSelectedExpression] = useState<string | null>(null);
  const expressionCache = useRef<Map<string, any>>(new Map());

  const filteredSpeeches = useMemo(() => {
    if (!speeches) return [];
    return speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      return true;
    });
  }, [speeches, corpusScope, selectedPlayTitle]);

  const activeNgramLengths = useMemo(() => {
    return ngramLengthSetting === "2-5" ? EXPRESSION_NGRAM_LENGTHS : [parseInt(ngramLengthSetting)];
  }, [ngramLengthSetting]);

  const expressionResults = useMemo(() => {
    if (!filteredSpeeches.length) return null;

    if (expressionScope === "node" && !nodeLemma.trim()) return { allCandidates: [], noNodeLemma: true, sliceFreqMap: new Map<string, Map<string, number>>(), allSlices: [] as string[] };

    const processedNode = expressionScope === "node"
      ? (processTokens(nodeLemma, { useStoplist: false, useLemmas })[0] || nodeLemma.trim().toLowerCase())
      : "";

    const cacheKey = JSON.stringify({
      pw: playwrightKey,
      corpusScope,
      play: selectedPlayTitle,
      expressionScope,
      node: processedNode,
      stoplist: useStoplist,
      lemmas: useLemmas,
      minFreq: minExpressionFreq,
      ngramLengthSetting,
      timeMode,
    });
    if (expressionCache.current.has(cacheKey)) return expressionCache.current.get(cacheKey);

    const ngramCounts = new Map<string, { n: number; count: number }>();
    const sliceFreqMap = new Map<string, Map<string, number>>();
    const allSlicesSet = new Set<string>();

    filteredSpeeches.forEach(s => {
      const rawSlice = timeMode === "year" ? (s.year_est || s.year_mid || s.year_min) : (s.decade || s.decade_num);
      const slice = rawSlice != null && rawSlice !== "" ? formatTimeValue(rawSlice) : null;
      if (slice) allSlicesSet.add(slice);

      const tokens = processTokens(s.text_raw || "", { useStoplist, useLemmas });
      activeNgramLengths.forEach(n => {
        for (let i = 0; i + n <= tokens.length; i++) {
          const gram = tokens.slice(i, i + n);
          if (expressionScope === "node" && !gram.includes(processedNode)) continue;
          const key = gram.join(" ");
          if (!ngramCounts.has(key)) ngramCounts.set(key, { n, count: 0 });
          ngramCounts.get(key)!.count += 1;
          if (slice) {
            if (!sliceFreqMap.has(key)) sliceFreqMap.set(key, new Map());
            const sliceMap = sliceFreqMap.get(key)!;
            sliceMap.set(slice, (sliceMap.get(slice) || 0) + 1);
          }
        }
      });
    });

    const allSlices = Array.from(allSlicesSet).sort();

    const allCandidates = Array.from(ngramCounts.entries())
      .map(([expression, d]) => ({
        expression,
        n: d.n,
        frequency: d.count,
        scope: expressionScope === "node" ? "Node-centred" : "Corpus-wide",
      }))
      .filter(c => c.frequency >= minExpressionFreq)
      .sort((a, b) => b.frequency - a.frequency);

    const output = { allCandidates, noNodeLemma: false, sliceFreqMap, allSlices };
    expressionCache.current.set(cacheKey, output);
    return output;
  }, [filteredSpeeches, corpusScope, selectedPlayTitle, expressionScope, nodeLemma, useStoplist, useLemmas, minExpressionFreq, activeNgramLengths, ngramLengthSetting, timeMode]);

  const matchingCandidates = useMemo(() => {
    const all = expressionResults?.allCandidates || [];
    if (expressionLengthFilter === "all") return all;
    const n = parseInt(expressionLengthFilter);
    return all.filter((c: ExpressionCandidate) => c.n === n);
  }, [expressionResults, expressionLengthFilter]);

  const displayedCandidates = useMemo(() => {
    if (showLimit === "all") return matchingCandidates;
    return matchingCandidates.slice(0, parseInt(showLimit));
  }, [matchingCandidates, showLimit]);

  const expressionSummary = useMemo(() => {
    if (!expressionResults?.allCandidates?.length) return null;
    const top = matchingCandidates[0];
    const lengthCounts: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0 };
    expressionResults.allCandidates.forEach((c: ExpressionCandidate) => {
      if (lengthCounts[c.n] !== undefined) lengthCounts[c.n] += 1;
    });
    const lengthLabel = expressionLengthFilter === "all" ? "candidates" : `${expressionLengthFilter}-gram candidates`;
    const showing = showLimit === "all"
      ? `All ${matchingCandidates.length} ${lengthLabel}`
      : `Top ${displayedCandidates.length} of ${matchingCandidates.length} ${lengthLabel}`;
    return {
      scope: expressionScope === "node" ? "Node-centred" : "Corpus-wide",
      showing,
      topExpression: top ? `"${top.expression}" (freq: ${top.frequency})` : "—",
      candidateDistribution: `2-grams: ${lengthCounts[2]} · 3-grams: ${lengthCounts[3]} · 4-grams: ${lengthCounts[4]} · 5-grams: ${lengthCounts[5]}`,
    };
  }, [expressionResults, expressionScope, expressionLengthFilter, showLimit, matchingCandidates, displayedCandidates]);

  const expressionExportFilename = `semantic_expression_snapshot_${expressionScope}_${expressionScope === "node" ? (nodeLemma.trim().toLowerCase() || "unspecified") : "corpus"}.csv`;

  const expressionFamilies = useMemo(() => {
    if (!expressionResults?.allCandidates?.length) return [];
    return buildExpressionFamilies(expressionResults.allCandidates);
  }, [expressionResults]);

  const familySummary = useMemo(() => {
    if (!expressionFamilies.length) return null;
    const totalFamilies = expressionFamilies.length;
    const avgSize = expressionFamilies.reduce((sum, f) => sum + f.memberCount, 0) / totalFamilies;
    const largest = [...expressionFamilies].sort((a, b) => b.memberCount - a.memberCount)[0];
    const mostFrequent = expressionFamilies[0];
    return {
      totalFamilies,
      avgSize: avgSize.toFixed(1),
      largestFamily: `${largest.pattern} (${largest.memberCount} members)`,
      mostFrequentFamily: `${mostFrequent.pattern} (freq: ${mostFrequent.totalFrequency})`,
    };
  }, [expressionFamilies]);

  const expressionFamilyExportFilename = `semantic_expression_families_${expressionScope}_${expressionScope === "node" ? (nodeLemma.trim().toLowerCase() || "unspecified") : "corpus"}.csv`;

  const diacCandidateRows = useMemo((): DiacRow[] => {
    if (!expressionResults?.allCandidates?.length) return [];
    const sliceFreqMap = expressionResults.sliceFreqMap as Map<string, Map<string, number>>;
    const allSlices = expressionResults.allSlices as string[];
    const allCandidates = expressionResults.allCandidates as ExpressionCandidate[];
    if (!sliceFreqMap || !allSlices) return [];

    const total = allSlices.length;
    // Pre-build O(1) index so getDiacBehaviour never calls indexOf in a loop
    const sliceIndex = new Map<string, number>(allSlices.map((s, i) => [s, i] as [string, number]));

    const rows: DiacRow[] = [];
    allCandidates.forEach((c: ExpressionCandidate) => {
      const slices = sliceFreqMap.get(c.expression);
      if (!slices) return;
      const presentSlices: string[] = Array.from(slices.keys()).sort();
      const sliceFreqs: Record<string, number> = {};
      slices.forEach((v: number, k: string) => { sliceFreqs[k] = v; });

      const n = presentSlices.length;
      let temporalBehaviour: TemporalBehaviour = "Transient";
      if (total > 0 && n > 1) {
        // Resolve indices once — O(1) per slice via pre-built map
        const idxArr = presentSlices.map(s => sliceIndex.get(s) ?? 0);
        const firstIdx = idxArr[0];
        const lastIdx = idxArr[n - 1];
        const span = lastIdx - firstIdx;
        const isContiguous = idxArr.every((idx, i) => i === 0 || idx === idxArr[i - 1] + 1);
        if (n >= 3 && span >= total / 2) temporalBehaviour = "Persistent";
        else if (firstIdx > total / 3 && lastIdx >= (total * 2) / 3) temporalBehaviour = "Emerging";
        else if (firstIdx <= total / 3 && lastIdx < (total * 2) / 3) temporalBehaviour = "Declining";
        else if (!isContiguous) temporalBehaviour = "Intermittent";
        else temporalBehaviour = "Intermittent";
      }

      rows.push({
        key: c.expression, n: c.n, totalFrequency: c.frequency,
        firstSeen: presentSlices[0] || "—",
        lastSeen: presentSlices[n - 1] || "—",
        slicesPresent: n,
        temporalBehaviour,
        sliceFreqs,
      });
    });
    return rows.sort((a, b) => b.totalFrequency - a.totalFrequency);
  }, [expressionResults]);

  const diacAllSlices = useMemo(() => expressionResults?.allSlices || [], [expressionResults]);

  const conventionalisationExportFilename = `semantic_conventionalisation_${expressionScope}_${expressionScope === "node" ? (nodeLemma.trim().toLowerCase() || "unspecified") : "corpus"}.csv`;

  const diacCandidateFilename = `semantic_expression_change_candidates_${expressionScope}_${expressionScope === "node" ? (nodeLemma.trim().toLowerCase() || "unspecified") : "corpus"}.csv`;
  const diacFamilyFilename = `semantic_expression_change_families_${expressionScope}_${expressionScope === "node" ? (nodeLemma.trim().toLowerCase() || "unspecified") : "corpus"}.csv`;
  const nodeKey = expressionScope === "node" ? (nodeLemma.trim().toLowerCase() || "unspecified") : "corpus";
  const evidencePlayFilename = `semantic_evidence_play_distribution_${expressionScope}_${nodeKey}.csv`;
  const evidenceExprFilename = `semantic_evidence_expression_occurrences_${expressionScope}_${nodeKey}.csv`;
  const contextEvidenceFilename = `semantic_context_evidence_${expressionScope}_${nodeKey}.csv`;

  useEffect(() => { setSelectedExpression(null); }, [expressionResults]);

  const selectedExpressions = useMemo(() => selectedExpression ? [selectedExpression] : [], [selectedExpression]);

  return (
    <div className="space-y-6">
      <DetailsPanel dataset="SPEECHES ONLY" tokenCol="text_raw (norm)" settings={{ stoplist: useStoplist, lemmas: useLemmas }} ui={ui} playwrights={ui.selectedPlaywrights} />

      <Card className="shadow-none border-muted/60">
        <CardHeader className="pb-3 bg-muted/5 border-b">
          <CardTitle className="text-sm font-semibold">Expression Controls</CardTitle>
          <CardDescription className="text-xs">Expression Layer — controls shared across semantic sections.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold">Expression Scope</Label>
            <div className="flex rounded-md border overflow-hidden h-8">
              <button
                type="button"
                onClick={() => startScopeTransition(() => setExpressionScope("node"))}
                className={`flex-1 text-xs font-medium transition-colors ${expressionScope === "node" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                data-testid="button-scope-node"
              >
                Node-centred
              </button>
              <button
                type="button"
                onClick={() => startScopeTransition(() => setExpressionScope("corpus"))}
                className={`flex-1 text-xs font-medium border-l transition-colors ${expressionScope === "corpus" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                data-testid="button-scope-corpus"
              >
                {scopePending ? "Computing…" : "Corpus-wide"}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sem-node-lemma" className={`text-[10px] uppercase font-bold ${expressionScope === "corpus" ? "opacity-50" : ""}`}>
              Node Lemma {expressionScope === "corpus" && "(not required)"}
            </Label>
            <Input id="sem-node-lemma" placeholder="e.g. love" value={nodeLemma} onChange={e => setNodeLemma(e.target.value)} className={`h-8 text-xs ${expressionScope === "corpus" ? "opacity-50" : ""}`} data-testid="input-semantic-node-lemma" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sem-ngram-length" className="text-[10px] uppercase font-bold">N-gram Length</Label>
            <Select value={ngramLengthSetting} onValueChange={v => setNgramLengthSetting(v as typeof ngramLengthSetting)}>
              <SelectTrigger id="sem-ngram-length" className="h-8 text-xs" data-testid="select-ngram-length">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPRESSION_NGRAM_LENGTH_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold">Min Expression Freq: {minExpressionFreq}</Label>
            <Input type="range" min="1" max="10" value={minExpressionFreq} onChange={e => setMinExpressionFreq(parseInt(e.target.value))} className="h-4" data-testid="input-semantic-min-expression-freq" />
          </div>
          <div className="flex flex-col gap-2 justify-center">
            <div className="flex items-center space-x-2">
              <Checkbox id="sem-stoplist" checked={useStoplist} onCheckedChange={v => setUseStoplist(!!v)} data-testid="checkbox-semantic-stoplist" />
              <Label htmlFor="sem-stoplist" className="text-xs">Stoplist</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="sem-lemmas" checked={useLemmas} onCheckedChange={v => setUseLemmas(!!v)} data-testid="checkbox-semantic-lemmas" />
              <Label htmlFor="sem-lemmas" className="text-xs">Lemmas</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3" data-testid="section-expression-snapshot">
        <div>
          <h3 className="text-sm font-bold">A. Expression Snapshot</h3>
          <p className="text-xs text-muted-foreground">Overview of recurrent expression candidates associated with the selected scope.</p>
        </div>

        {expressionScope === "node" && !nodeLemma.trim() ? (
          <Card className="shadow-none border-muted/60 border-dashed">
            <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-expression-empty-no-node">
              Enter a node lemma to view node-centred expression candidates.
            </CardContent>
          </Card>
        ) : !expressionResults?.allCandidates?.length ? (
          <Card className="shadow-none border-muted/60 border-dashed">
            <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-expression-empty-no-candidates">
              No sufficient expression evidence is available for the current selection.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="shadow-none border-muted/60">
              <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Active Scope</div>
                  <div className="font-semibold" data-testid="text-expression-summary-scope">{expressionSummary?.scope}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Showing</div>
                  <div className="font-semibold" data-testid="text-expression-summary-showing">{expressionSummary?.showing}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Most Frequent Expression</div>
                  <div className="font-semibold" data-testid="text-expression-summary-top">{expressionSummary?.topExpression}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Candidate Distribution</div>
                  <div className="font-semibold" data-testid="text-expression-summary-lengths">{expressionSummary?.candidateDistribution}</div>
                </div>
              </CardContent>
            </Card>
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sem-expression-length-filter" className="text-[10px] uppercase font-bold">Expression Length</Label>
                <Select value={expressionLengthFilter} onValueChange={v => setExpressionLengthFilter(v as typeof expressionLengthFilter)}>
                  <SelectTrigger id="sem-expression-length-filter" className="h-8 text-xs w-40" data-testid="select-expression-length-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All lengths</SelectItem>
                    <SelectItem value="2" className="text-xs">2-grams</SelectItem>
                    <SelectItem value="3" className="text-xs">3-grams</SelectItem>
                    <SelectItem value="4" className="text-xs">4-grams</SelectItem>
                    <SelectItem value="5" className="text-xs">5-grams</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sem-show-limit" className="text-[10px] uppercase font-bold">Show</Label>
                <Select value={showLimit} onValueChange={v => setShowLimit(v as typeof showLimit)}>
                  <SelectTrigger id="sem-show-limit" className="h-8 text-xs w-32" data-testid="select-show-limit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20" className="text-xs">Top 20</SelectItem>
                    <SelectItem value="50" className="text-xs">Top 50</SelectItem>
                    <SelectItem value="100" className="text-xs">Top 100</SelectItem>
                    <SelectItem value="all" className="text-xs">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ExpressionSnapshotTable
              data={displayedCandidates}
              filename={expressionExportFilename}
              selectedExpression={selectedExpression}
              onSelect={setSelectedExpression}
            />
            {selectedExpression && (
              <CorpusEvidencePanel
                speeches={filteredSpeeches}
                useStoplist={useStoplist}
                useLemmas={useLemmas}
                expressions={selectedExpressions}
                label={selectedExpression}
                playDistFilename={evidencePlayFilename}
                exprEvidenceFilename={evidenceExprFilename}
                contextEvidenceFilename={contextEvidenceFilename}
              />
            )}
          </>
        )}
      </section>

      <section className="space-y-3" data-testid="section-expression-patterning">
        <div>
          <h3 className="text-sm font-bold">B. Expression Patterning</h3>
          <p className="text-xs text-muted-foreground">Examines how recurrent expressions are structured, varied, and grouped.</p>
        </div>
        <Collapsible defaultOpen={false}>
          <Card className="shadow-none border-muted/60 overflow-hidden">
            <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Expression Families</CardTitle>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" data-testid="button-toggle-expression-patterning"><ChevronDown className="h-3 w-3" /></Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-4 space-y-3">
                {expressionScope === "node" && !nodeLemma.trim() ? (
                  <Card className="shadow-none border-muted/60 border-dashed">
                    <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-family-empty-no-node">
                      Enter a node lemma to view node-centred expression families.
                    </CardContent>
                  </Card>
                ) : !expressionFamilies.length ? (
                  <Card className="shadow-none border-muted/60 border-dashed">
                    <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-family-empty">
                      No recurring expression families were identified for the current selection.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card className="shadow-none border-muted/60">
                      <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Families</div>
                          <div className="font-semibold" data-testid="text-family-summary-total">{familySummary?.totalFamilies}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">Average Family Size</div>
                          <div className="font-semibold" data-testid="text-family-summary-avg-size">{familySummary?.avgSize}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">Largest Family</div>
                          <div className="font-semibold" data-testid="text-family-summary-largest">{familySummary?.largestFamily}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground">Most Frequent Family</div>
                          <div className="font-semibold" data-testid="text-family-summary-top">{familySummary?.mostFrequentFamily}</div>
                        </div>
                      </CardContent>
                    </Card>
                    <ExpressionFamilyPanel
                      families={expressionFamilies}
                      filename={expressionFamilyExportFilename}
                      speeches={filteredSpeeches}
                      useStoplist={useStoplist}
                      useLemmas={useLemmas}
                      evidencePlayFilename={evidencePlayFilename}
                      evidenceExprFilename={evidenceExprFilename}
                      contextEvidenceFilename={contextEvidenceFilename}
                    />
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </section>

      <section className="space-y-3" data-testid="section-conventionalisation">
        <div>
          <h3 className="text-sm font-bold">C. Conventionalisation Indicators</h3>
          <p className="text-xs text-muted-foreground">Assesses observable indicators of structural stability in expression families.</p>
        </div>
        <Collapsible defaultOpen={false}>
          <Card className="shadow-none border-muted/60 overflow-hidden">
            <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Indicator Table</CardTitle>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" data-testid="button-toggle-conventionalisation"><ChevronDown className="h-3 w-3" /></Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-4 space-y-4">
                <Alert className="border-muted/60 bg-muted/10">
                  <Info className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs">
                    The Conventionalisation Indicator combines several observable characteristics of an expression family to identify candidates exhibiting stronger evidence of structural stability. It is intended as an exploratory aid rather than a definitive measure of formulaicity.
                  </AlertDescription>
                </Alert>

                {expressionScope === "node" && !nodeLemma.trim() ? (
                  <Card className="shadow-none border-muted/60 border-dashed">
                    <CardContent className="pt-6 text-xs text-muted-foreground" data-testid="text-conv-empty-no-node">
                      Enter a node lemma to view conventionalisation indicators.
                    </CardContent>
                  </Card>
                ) : (
                  <ConventionalisationPanel
                    families={expressionFamilies}
                    filename={conventionalisationExportFilename}
                    speeches={filteredSpeeches}
                    useStoplist={useStoplist}
                    useLemmas={useLemmas}
                    evidencePlayFilename={evidencePlayFilename}
                    evidenceExprFilename={evidenceExprFilename}
                    contextEvidenceFilename={contextEvidenceFilename}
                  />
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </section>

      <section className="space-y-3" data-testid="section-diachronic-expression-change">
        <div>
          <h3 className="text-sm font-bold">D. Diachronic Expression Change</h3>
          <p className="text-xs text-muted-foreground">Tracks how expressions emerge, persist, diversify, or disappear across time.</p>
        </div>
        <Collapsible defaultOpen={false}>
          <Card className="shadow-none border-muted/60 overflow-hidden">
            <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Temporal Tracking</CardTitle>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" data-testid="button-toggle-diachronic"><ChevronDown className="h-3 w-3" /></Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-4 space-y-4">
                <DiachronicExpressionPanel
                  speeches={filteredSpeeches}
                  expressionScope={expressionScope}
                  nodeLemma={nodeLemma}
                  useStoplist={useStoplist}
                  useLemmas={useLemmas}
                  activeNgramLengths={activeNgramLengths}
                  minExpressionFreq={minExpressionFreq}
                  expressionFamilies={expressionFamilies}
                  timeMode={timeMode}
                  candidateFilename={diacCandidateFilename}
                  familyFilename={diacFamilyFilename}
                  evidencePlayFilename={evidencePlayFilename}
                  evidenceExprFilename={evidenceExprFilename}
                  contextEvidenceFilename={contextEvidenceFilename}
                  precomputedCandidateRows={diacCandidateRows}
                  precomputedAllSlices={diacAllSlices}
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </section>
    </div>
  );
};

// --- Discursive Tab ---
const DiscursiveTab = () => {
  const ui = useUI();
  const { corpusScope, selectedPlayTitle, topN, timeMode, selectedSpeeches: speeches, playwrightKey } = ui;
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

  // Comparison node state
  const [comparisonNodeLemma, setComparisonNodeLemma] = useState("love");

  // Similarity matrix state
  const [matrixNodeLimit, setMatrixNodeLimit] = useState<5 | 10 | 20>(10);

  // Clustering state
  const [clusteringThreshold, setClusteringThreshold] = useState<0.01 | 0.02 | 0.05>(0.02);

  // Core vs Peripheral table limit
  const [coreTableLimit, setCoreTableLimit] = useState<20 | 50 | 100 | null>(20);

  // Core vs Peripheral status filter
  const [coreStatusFilter, setCoreStatusFilter] = useState<"All" | "Core" | "Mid-zone" | "Peripheral">("All");

  // Core vs Peripheral expanded quad for example
  const [expandedQuad, setExpandedQuad] = useState<string | null>(null);

  // Core vs Peripheral sorting
  const [coreSortBy, setCoreSortBy] = useState<"frequency" | "dispersion" | "status">("frequency");
  const [coreSortDir, setCoreSortDir] = useState<"asc" | "desc">("desc");

  // Constellation Subclusters display controls
  const [subclusterShowLimit, setSubclusterShowLimit] = useState<10 | 5 | 20 | null>(10);
  const [subclusterSortBy, setSubclusterSortBy] = useState<"quad-count" | "term-count" | "anchor-strength">("quad-count");

  // Recurring co-terms limit
  const [coTermLimit, setCoTermLimit] = useState<10 | 20 | null>(10);

  // Quad Subcluster Participation controls
  const [participationFilter, setParticipationFilter] = useState<"All" | "Boundary" | "Cross-subcluster" | "Fringe">("All");
  const [participationRowLimit, setParticipationRowLimit] = useState<20 | 50 | null>(20);

  // Recurring co-terms filter (All vs Core only)
  const [coTermFilter, setCoTermFilter] = useState<"All" | "Core">("All");

  // Analysis word mode (All vs Content only)

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

    // include playwright key so cache invalidates on corpus selection change
    const cacheKey = JSON.stringify({
      pw: playwrightKey,
      scope: corpusScope,
      play: selectedPlayTitle,
      node: nodeLemma,
      stop: useStoplist,
      lem: useLemmas,
      time: timeMode,
      topN,
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

    let instances =
      sankeyAnalysisMode === "all-time"
        ? results.quadInstancesAll
        : results.quadInstancesAll.filter(q => q.slice === selectedSankeySlice);

    console.log("[Sankey] instances before filtering:", instances.length, "mode:", sankeyAnalysisMode, "slice:", selectedSankeySlice);

    // Filter quad instances BEFORE Sankey construction when contentWordOnly is enabled
    if (contentWordOnly) {
      instances = instances.filter(q => {
        return q.co.every(lemma => isContentWord(lemma));
      });
    }

    console.log("[Sankey] instances after filtering:", instances.length);
    console.log("[Sankey] sample instance:", instances[0]);

    const out = buildSankeyData(instances, { minWeight: minSankeyWeight, maxNodesPerLayer });

    console.log("[Sankey] out nodes:", out.nodes.length, "out links:", out.links.length);
    console.log("[Sankey] out link sample:", out.links.slice(0, 5));

    return out;
  }, [results, sankeyAnalysisMode, selectedSankeySlice, minSankeyWeight, maxNodesPerLayer, contentWordOnly]);

  const temporalFlowData = useMemo(() => {
    if (!results?.quadFreqBySliceObj || !results?.sortedSlices) return null;
    
    const quadTotals = new Map<string, { total: number; first: string; last: string }>();
    const quadBySlice = new Map<string, Map<string, number>>();
    
    results.sortedSlices.forEach(slice => {
      quadBySlice.set(slice, new Map());
      (results.quadFreqBySliceObj[slice] || []).forEach(q => {
        const total = quadTotals.get(q.quadKey)?.total || 0;
        const first = quadTotals.get(q.quadKey)?.first || slice;
        const last = slice;
        quadTotals.set(q.quadKey, { total: total + q.count, first, last });
        quadBySlice.get(slice)!.set(q.quadKey, q.count);
      });
    });
    
    const topQuads = Array.from(quadTotals.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20)
      .map(([quadKey, data]) => {
        const row: any = {
          quadKey,
          total: data.total,
          first_seen: data.first,
          last_seen: data.last
        };
        results.sortedSlices.forEach(slice => {
          row[slice] = quadBySlice.get(slice)?.get(quadKey) || 0;
        });
        return row;
      });
    
    return topQuads;
  }, [results]);

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

  const comparisonResults = useMemo(() => {
    if (!comparisonNodeLemma || !speeches || speeches.length === 0) return null;
    const compareNode = comparisonNodeLemma.trim().toLowerCase();
    const filtered = speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      return true;
    });
    const quadFreqBySlice = new Map<string, Map<string, number>>();
    const allSlices = new Set<string>();
    const lemmaFreqs = new Map<string, number>();
    filtered.forEach(s => {
      const tokens = processTokens(s.text_raw || "", { useStoplist, useLemmas });
      const nodeIndices = tokens.reduce((acc: number[], t, i) => { if (t === compareNode) acc.push(i); return acc; }, []);
      if (nodeIndices.length === 0) return;
      const slice = formatTimeValue(getTimeSlice(s));
      if (slice === "Unknown") return;
      allSlices.add(slice);
      if (!quadFreqBySlice.has(slice)) quadFreqBySlice.set(slice, new Map());
      nodeIndices.forEach(idx => {
        const start = Math.max(0, idx - 50);
        const end = Math.min(tokens.length, idx + 51);
        const winTokens = tokens.slice(start, end);
        const winCounts = new Map<string, number>();
        winTokens.forEach(t => { if (t === compareNode) return; winCounts.set(t, (winCounts.get(t) || 0) + 1); lemmaFreqs.set(t, (lemmaFreqs.get(t) || 0) + 1); });
        const sortedWin = Array.from(winCounts.entries()).sort((a, b) => b[1] - a[1]);
        if (sortedWin.length >= 3) {
          const co = sortedWin.slice(0, 3);
          const quadArray = [compareNode, ...co.map(p => p[0])].sort();
          const quadKey = quadArray.join("|");
          const sliceFreq = quadFreqBySlice.get(slice)!;
          sliceFreq.set(quadKey, (sliceFreq.get(quadKey) || 0) + 1);
        }
      });
    });
    const sortedSlices = Array.from(allSlices).sort();
    const quadFreqBySliceObj = Object.fromEntries(sortedSlices.map(s => [s, Array.from(quadFreqBySlice.get(s) || new Map()).map(([k, c]) => ({ quadKey: k, count: c }))]));
    return { quadFreqBySliceObj, sortedSlices, lemmaFreqs };
  }, [comparisonNodeLemma, speeches, corpusScope, selectedPlayTitle, useStoplist, useLemmas, timeMode, getTimeSlice]);

  const matrixData = useMemo(() => {
    if (!results || topNodeRows.length < 2) return null;
    const topNodes = topNodeRows.slice(0, matrixNodeLimit).map((n: any) => n.lemma);
    const matrixResult = computeSimilarityMatrix(topNodes, speeches, corpusScope, selectedPlayTitle, useStoplist, useLemmas, timeMode, getTimeSlice);
    return matrixResult;
  }, [results, topNodeRows, matrixNodeLimit, speeches, corpusScope, selectedPlayTitle, useStoplist, useLemmas, timeMode, getTimeSlice]);

  const clusteringData = useMemo(() => {
    if (!matrixData || !matrixData.matrix || matrixData.matrix.length < 2) return null;
    return computeClusters(matrixData.matrix, matrixData.nodes, clusteringThreshold);
  }, [matrixData, clusteringThreshold]);

  const similarityData = useMemo(() => {
    if (!results || !comparisonResults || nodeLemma === comparisonNodeLemma) return null;
    const primaryQuads = new Set<string>();
    const compQuads = new Set<string>();
    const primaryColemmas = new Set<string>();
    const compColemmas = new Set<string>();
    Object.values(results.quadFreqBySliceObj).forEach((quads: any) => {
      quads.forEach((q: any) => {
        primaryQuads.add(q.quadKey);
        q.quadKey.split("|").forEach((l: string) => { if (l !== nodeLemma) primaryColemmas.add(l); });
      });
    });
    Object.values(comparisonResults.quadFreqBySliceObj).forEach((quads: any) => {
      quads.forEach((q: any) => {
        compQuads.add(q.quadKey);
        q.quadKey.split("|").forEach((l: string) => { if (l !== comparisonNodeLemma) compColemmas.add(l); });
      });
    });
    const sharedQuads = new Set([...primaryQuads].filter(x => compQuads.has(x)));
    const sharedColemmas = new Set([...primaryColemmas].filter(x => compColemmas.has(x)));
    const jaccard_quad = (sharedQuads.size / (primaryQuads.size + compQuads.size - sharedQuads.size)) || 0;
    const jaccard_colemma = (sharedColemmas.size / (primaryColemmas.size + compColemmas.size - sharedColemmas.size)) || 0;
    const sharedQuadData = [...sharedQuads].slice(0, 10).map(q => ({ quadKey: q, primary: results.quadFreqBySliceObj[results.sortedSlices[0]]?.find((x: any) => x.quadKey === q)?.count || 0 }));
    const sharedColemmaData = [...sharedColemmas].slice(0, 10).map(c => ({ colemma: c, primary: comparisonResults.lemmaFreqs.get(c) || 0 }));
    return {
      primaryNode: nodeLemma,
      comparisonNode: comparisonNodeLemma,
      primaryQuads: primaryQuads.size,
      comparisonQuads: compQuads.size,
      sharedQuads: sharedQuads.size,
      primaryColemmas: primaryColemmas.size,
      comparisonColemmas: compColemmas.size,
      sharedColemmas: sharedColemmas.size,
      jaccard_quad: (jaccard_quad * 100).toFixed(1),
      jaccard_colemma: (jaccard_colemma * 100).toFixed(1),
      sharedQuadData,
      sharedColemmaData
    };
  }, [results, comparisonResults, nodeLemma, comparisonNodeLemma]);

  const corePeripheralData = useMemo(() => {
    if (!results?.quadFreqBySliceObj || !results?.sortedSlices) return null;
    
    const quadStats = new Map<string, { total: number; slices: Set<string>; first: string; last: string }>();
    
    results.sortedSlices.forEach(slice => {
      (results.quadFreqBySliceObj[slice] || []).forEach(q => {
        if (!quadStats.has(q.quadKey)) {
          quadStats.set(q.quadKey, { total: 0, slices: new Set(), first: slice, last: slice });
        }
        const stat = quadStats.get(q.quadKey)!;
        stat.total += q.count;
        stat.slices.add(slice);
        stat.last = slice;
      });
    });
    
    const sortedQuads = Array.from(quadStats.entries()).sort((a, b) => b[1].total - a[1].total);
    
    // Compute corpus timeline bounds
    const slices = results.sortedSlices;
    const sliceYears = slices.map(s => parseInt(s, 10)).filter(y => !isNaN(y));
    const corpusStart = sliceYears.length > 0 ? Math.min(...sliceYears) : 0;
    const corpusEnd = sliceYears.length > 0 ? Math.max(...sliceYears) : 0;
    const corpusSpan = corpusEnd - corpusStart;
    const earlyBoundary = corpusStart + corpusSpan / 3;
    const lateBoundary = corpusStart + (2 * corpusSpan) / 3;
    
    // Helper function to classify temporal behavior
    const getTemporalBehaviour = (firstSeen: string, lastSeen: string, slicesPresent: number): string => {
      const firstYear = parseInt(firstSeen, 10);
      const lastYear = parseInt(lastSeen, 10);
      const spanYears = lastYear - firstYear;
      const relativeSpan = corpusSpan > 0 ? spanYears / corpusSpan : 0;
      
      // Transient: 1 slice OR (<=2 slices spanning <25% of corpus)
      if (slicesPresent === 1 || (slicesPresent <= 2 && relativeSpan < 0.25)) {
        return "Transient";
      }
      
      // Persistent: widely distributed over >= 50% of corpus
      if (slicesPresent >= 3 && relativeSpan >= 0.5) {
        return "Persistent";
      }
      
      // Sporadic: two slices spanning >= 40% of corpus
      if (slicesPresent === 2 && relativeSpan >= 0.4) {
        return "Sporadic";
      }
      
      // Early-bound: multi-slice, starts early, doesn't extend to late period
      if (slicesPresent >= 2 && firstYear <= earlyBoundary && lastYear < lateBoundary) {
        return "Early-bound";
      }
      
      // Emergent: multi-slice, ends late, doesn't start early
      if (slicesPresent >= 2 && lastYear >= lateBoundary && firstYear > earlyBoundary) {
        return "Emergent";
      }
      
      return "Transient";
    };
    
    const corePeripheralRows = sortedQuads.map(([quadKey, stat]) => {
      const isCore = stat.total > 1 && stat.slices.size >= 2;
      const isPeripheral = stat.total === 1 && stat.slices.size === 1;
      const status = isCore ? "Core" : isPeripheral ? "Peripheral" : "Mid-zone";
      const temporal_behaviour = getTemporalBehaviour(stat.first, stat.last, stat.slices.size);
      
      return {
        quadKey,
        total_frequency: stat.total,
        slices_present: stat.slices.size,
        first_seen: stat.first,
        last_seen: stat.last,
        status,
        temporal_behaviour
      };
    });
    
    return corePeripheralRows;
  }, [results]);

  const recurringCoTerms = useMemo(() => {
    if (!corePeripheralData || corePeripheralData.length === 0) return [];
    const filtered = coTermFilter === "Core" ? corePeripheralData.filter(q => q.status === "Core") : corePeripheralData;
    const coTermMap = new Map<string, number>();
    filtered.forEach(row => {
      const parts = row.quadKey.split("|");
      if (parts.length >= 4) {
        const allTerms = parts;
        const coTerms = allTerms.filter(t => t !== nodeLemma);
        const filteredCoTerms = coTerms.filter(t => !contentWordOnly || !FUNCTION_WORDS.has(t));
        filteredCoTerms.forEach(term => {
          coTermMap.set(term, (coTermMap.get(term) || 0) + 1);
        });
      }
    });
    const sorted = Array.from(coTermMap.entries()).sort((a, b) => b[1] - a[1]);
    const limit = coTermLimit === 10 ? 10 : coTermLimit === 20 ? 20 : sorted.length;
    return sorted.slice(0, limit);
  }, [corePeripheralData, coTermFilter, coTermLimit, contentWordOnly, nodeLemma]);

  const coTermPairs = useMemo(() => {
    if (!corePeripheralData || corePeripheralData.length === 0) return [];
    const filtered = coTermFilter === "Core" ? corePeripheralData.filter(q => q.status === "Core") : corePeripheralData;
    const pairMap = new Map<string, number>();
    filtered.forEach(row => {
      const parts = row.quadKey.split("|");
      if (parts.length >= 4) {
        const filteredCoTerms = parts.filter(t => t !== nodeLemma && (!contentWordOnly || !FUNCTION_WORDS.has(t)));
        for (let i = 0; i < filteredCoTerms.length; i++) {
          for (let j = i + 1; j < filteredCoTerms.length; j++) {
            const pair = [filteredCoTerms[i], filteredCoTerms[j]].sort().join("|");
            pairMap.set(pair, (pairMap.get(pair) || 0) + 1);
          }
        }
      }
    });
    const sorted = Array.from(pairMap.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 15);
  }, [corePeripheralData, coTermFilter, contentWordOnly, nodeLemma]);

  const coTermSubclusters = useMemo(() => {
    if (!corePeripheralData || corePeripheralData.length === 0) return [];
    const filtered = coTermFilter === "Core" ? corePeripheralData.filter(q => q.status === "Core") : corePeripheralData;
    const pairMap = new Map<string, number>();
    const graph = new Map<string, Set<string>>();
    
    filtered.forEach(row => {
      const parts = row.quadKey.split("|");
      if (parts.length >= 4) {
        const filteredCoTerms = parts.filter(t => t !== nodeLemma && (!contentWordOnly || !FUNCTION_WORDS.has(t)));
        for (let i = 0; i < filteredCoTerms.length; i++) {
          for (let j = i + 1; j < filteredCoTerms.length; j++) {
            const pair = [filteredCoTerms[i], filteredCoTerms[j]].sort().join("|");
            pairMap.set(pair, (pairMap.get(pair) || 0) + 1);
          }
        }
      }
    });
    
    pairMap.forEach((count, pair) => {
      if (count >= 3) {
        const [t1, t2] = pair.split("|");
        if (!graph.has(t1)) graph.set(t1, new Set());
        if (!graph.has(t2)) graph.set(t2, new Set());
        graph.get(t1)!.add(t2);
        graph.get(t2)!.add(t1);
      }
    });
    
    const visited = new Set<string>();
    const clusters: Array<{ terms: string[]; edges: number }> = [];
    
    const dfs = (node: string, cluster: Set<string>) => {
      visited.add(node);
      cluster.add(node);
      (graph.get(node) || new Set()).forEach(neighbor => {
        if (!visited.has(neighbor)) dfs(neighbor, cluster);
      });
    };
    
    graph.forEach((_, node) => {
      if (!visited.has(node)) {
        const cluster = new Set<string>();
        dfs(node, cluster);
        const terms = Array.from(cluster).sort();
        let edges = 0;
        pairMap.forEach((count, pair) => {
          if (count >= 3) {
            const [t1, t2] = pair.split("|");
            if (cluster.has(t1) && cluster.has(t2)) edges += 1;
          }
        });
        clusters.push({ terms, edges });
      }
    });
    
    // DIAGNOSTIC: log top 10 highest-degree co-terms
    const graphDegrees = Array.from(graph.entries())
      .map(([term, neighbors]) => ({ term, degree: neighbors.size }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 10);
    console.log("[Diagnostic] Top 10 highest-degree co-terms in subcluster graph (threshold: count>=3):", graphDegrees);
    
    clusters.sort((a, b) => b.terms.length - a.terms.length || b.edges - a.edges);
    return clusters;
  }, [corePeripheralData, coTermFilter, contentWordOnly, nodeLemma]);

  const clusterAnchorsData = useMemo(() => {
    if (!corePeripheralData || corePeripheralData.length === 0 || coTermSubclusters.length === 0) return [];
    
    const filtered = coTermFilter === "Core" ? corePeripheralData.filter(q => q.status === "Core") : corePeripheralData;
    const displayedClusters = coTermSubclusters.filter(cluster => cluster.terms.length >= 3);
    
    return displayedClusters.map(cluster => {
      const clusterTermsSet = new Set(cluster.terms);
      const anchorScores = new Map<string, number>();
      const quadsInCluster = new Set<string>();
      
      // Count quads and anchor scores
      filtered.forEach(quad => {
        const parts = quad.quadKey.split("|");
        if (parts.length >= 4) {
          const coTerms = parts.filter(t => t !== nodeLemma && (!contentWordOnly || !FUNCTION_WORDS.has(t)));
          
          let hasClusterTerm = false;
          coTerms.forEach(term => {
            if (clusterTermsSet.has(term)) {
              hasClusterTerm = true;
              anchorScores.set(term, (anchorScores.get(term) || 0) + 1);
            }
          });
          if (hasClusterTerm) quadsInCluster.add(quad.quadKey);
        }
      });
      
      // Get top 5 anchor terms
      const topAnchors = Array.from(anchorScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([term, score]) => ({ term, score }));
      
      return {
        terms: cluster.terms,
        edges: cluster.edges,
        topAnchors,
        quadCount: quadsInCluster.size,
        termCount: cluster.terms.length
      };
    });
  }, [corePeripheralData, coTermSubclusters, coTermFilter, contentWordOnly, nodeLemma]);

  const quadStructuralCentrality = useMemo(() => {
    if (!corePeripheralData || corePeripheralData.length === 0) return new Map<string, number>();
    const centralityMap = new Map<string, number>();
    corePeripheralData.forEach((quad, idx) => {
      const parts = quad.quadKey.split("|");
      if (parts.length >= 4) {
        const coTerms = parts.filter(t => t !== nodeLemma);
        const sharedTerms = new Set(coTerms);
        let linkCount = 0;
        corePeripheralData.forEach((other, otherIdx) => {
          if (idx === otherIdx) return;
          const otherParts = other.quadKey.split("|");
          if (otherParts.length >= 4) {
            const otherCoTerms = otherParts.filter(t => t !== nodeLemma);
            if (otherCoTerms.some(t => sharedTerms.has(t))) {
              linkCount += 1;
            }
          }
        });
        centralityMap.set(quad.quadKey, linkCount);
      }
    });
    return centralityMap;
  }, [corePeripheralData, nodeLemma]);

  const quadStructuralBackbone = useMemo(() => {
    if (!corePeripheralData || corePeripheralData.length === 0) return new Map<string, boolean>();
    const links = Array.from(quadStructuralCentrality.values());
    const meanLinks = links.length > 0 ? links.reduce((a, b) => a + b, 0) / links.length : 0;
    const backboneMap = new Map<string, boolean>();
    corePeripheralData.forEach(quad => {
      const linkCount = quadStructuralCentrality.get(quad.quadKey) ?? 0;
      backboneMap.set(quad.quadKey, linkCount >= meanLinks);
    });
    return backboneMap;
  }, [corePeripheralData, quadStructuralCentrality]);

  const constellationStructuralDensity = useMemo(() => {
    if (!corePeripheralData || corePeripheralData.length === 0) return 0;
    const totalStructuralLinks = Array.from(quadStructuralCentrality.values()).reduce((a, b) => a + b, 0);
    const quadCount = corePeripheralData.length;
    return quadCount > 0 ? totalStructuralLinks / quadCount : 0;
  }, [corePeripheralData, quadStructuralCentrality]);

  const quadSubclusterParticipationData = useMemo(() => {
    if (!corePeripheralData || corePeripheralData.length === 0) return [];
    if (coTermSubclusters.length === 0) {
      return corePeripheralData.map(quad => ({
        quadKey: quad.quadKey,
        participationType: "Unclassified",
        subclustersTouched: 0,
        unmappedCoTerms: 0,
        frequency: quad.total_frequency
      }));
    }
    
    // Build a map of term -> subcluster indices
    // Use >= 2 term subclusters for participation mapping (keeps display panel at >= 3 separately)
    const validSubclusters = coTermSubclusters.filter(c => c.terms.length >= 2);
    const termToSubclusters = new Map<string, Set<number>>();
    validSubclusters.forEach((cluster, idx) => {
      cluster.terms.forEach(term => {
        if (!termToSubclusters.has(term)) termToSubclusters.set(term, new Set());
        termToSubclusters.get(term)!.add(idx);
      });
    });
    
    // Classify all quads by participation type
    const quadFreqMap = new Map<string, number>();
    const participationList: Array<{ quadKey: string; participationType: string; subclustersTouched: number; unmappedCoTerms: number; mappedCoTerms: string[]; unmappedCoTermsList: string[]; frequency: number }> = [];
    
    corePeripheralData.forEach(quad => {
      const parts = quad.quadKey.split("|");
      if (parts.length >= 4) {
        const coTerms = parts.filter(t => t !== nodeLemma && (!contentWordOnly || !FUNCTION_WORDS.has(t)));
        
        const subclustersTouched = new Set<number>();
        const mappedTerms: string[] = [];
        const unmappedTerms: string[] = [];
        
        coTerms.forEach(term => {
          const subclusters = termToSubclusters.get(term);
          if (subclusters && subclusters.size > 0) {
            subclusters.forEach(idx => subclustersTouched.add(idx));
            mappedTerms.push(term);
          } else {
            unmappedTerms.push(term);
          }
        });
        
        let participationType = "Intra-subcluster";
        if (subclustersTouched.size === 1 && unmappedTerms.length > 0) {
          participationType = "Fringe";
        } else if (subclustersTouched.size >= 2) {
          participationType = "Cross-subcluster";
        }
        
        participationList.push({
          quadKey: quad.quadKey,
          participationType,
          subclustersTouched: subclustersTouched.size,
          unmappedCoTerms: unmappedTerms.length,
          mappedCoTerms: mappedTerms.sort(),
          unmappedCoTermsList: unmappedTerms.sort(),
          frequency: quad.total_frequency
        });
      }
    });
    
    // Sort: Cross-subcluster, Fringe, Intra-subcluster; then by frequency desc
    const typeOrder = { "Cross-subcluster": 0, "Fringe": 1, "Intra-subcluster": 2, "Unclassified": 3 };
    participationList.sort((a, b) => {
      const typeA = typeOrder[a.participationType as keyof typeof typeOrder] ?? 999;
      const typeB = typeOrder[b.participationType as keyof typeof typeOrder] ?? 999;
      if (typeA !== typeB) return typeA - typeB;
      return b.frequency - a.frequency;
    });
    
    return participationList;
  }, [corePeripheralData, coTermSubclusters, contentWordOnly, nodeLemma]);

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

  const constellationSnapshotSummary = useMemo(() => {
    const topCoLemmas = recurringCoTerms.slice(0, 5).map(([term]) => term);
    const n = sankeyData?.nodes.length || 0;
    const l = sankeyData?.links.length || 0;
    const density = l > n ? "dense" : l === n ? "moderate" : "sparse";
    return {
      node_lemma: nodeLemma,
      top_co_lemmas: topCoLemmas.join("; ") || "(none)",
      total_nodes: n,
      total_links: l,
      density_pattern: density,
      total_quads: corePeripheralData?.length || 0
    };
  }, [recurringCoTerms, sankeyData, nodeLemma, corePeripheralData]);

  const configurationProfileSummary = useMemo(() => {
    const n = clusterAnchorsData.length;
    const largest = clusterAnchorsData[0]?.termCount || 0;
    const total = clusterAnchorsData.reduce((s, c) => s + c.termCount, 0);
    const config = total > 0 && largest / total > 0.5 ? "centralised" : "distributed";
    const anchors = clusterAnchorsData.slice(0, 3).map(c => c.topAnchors[0]?.term || "").filter(Boolean);
    return {
      node_lemma: nodeLemma,
      cluster_count: n,
      largest_cluster_size: largest,
      total_clustered_terms: total,
      configuration_type: n > 0 ? config : "(no clusters)",
      top_cluster_anchors: anchors.join("; ") || "(none)"
    };
  }, [clusterAnchorsData, nodeLemma]);

  const behaviourSummary = useMemo(() => {
    const total = quadSubclusterParticipationData.length;
    if (total === 0) return null;
    const intra = quadSubclusterParticipationData.filter(r => r.participationType === "Intra-subcluster").length;
    const cross = quadSubclusterParticipationData.filter(r => r.participationType === "Cross-subcluster").length;
    const fringe = quadSubclusterParticipationData.filter(r => r.participationType === "Fringe").length;
    const fringePct = fringe / total;
    const dominant = fringePct > 0.6 ? "fringe-dominated" : fringePct > 0.3 ? "expanding" : "stable";
    return {
      node_lemma: nodeLemma,
      total_quads: total,
      intra_subcluster_count: intra,
      intra_ratio: (intra / total).toFixed(2),
      cross_subcluster_count: cross,
      cross_ratio: (cross / total).toFixed(2),
      fringe_count: fringe,
      fringe_ratio: fringePct.toFixed(2),
      dominant_behaviour: dominant
    };
  }, [quadSubclusterParticipationData, nodeLemma]);

  const diachronicChangeSummary = useMemo(() => {
    if (!temporalFlowData || !results?.sortedSlices) return null;
    const slices = results.sortedSlices;
    const total = slices.length;
    const activeSlices = slices.filter(s => temporalFlowData.some(row => (row[s] || 0) > 0)).length;
    const halfIdx = Math.floor(total / 2);
    const firstHalfActive = slices.slice(0, halfIdx).some(s => temporalFlowData.some(row => (row[s] || 0) > 0));
    const presenceType = activeSlices === total ? "continuous" : (!firstHalfActive && activeSlices > 0) ? "emerging" : "intermittent";
    const changeSuggestion = presenceType === "continuous" ? "stability" : presenceType === "emerging" ? "expansion" : "fluctuation";
    const firstSlice = slices.find(s => temporalFlowData.some(row => (row[s] || 0) > 0)) || "";
    const lastSlice = [...slices].reverse().find(s => temporalFlowData.some(row => (row[s] || 0) > 0)) || "";
    return {
      node_lemma: nodeLemma,
      total_slices: total,
      active_slices: activeSlices,
      coverage_ratio: (activeSlices / total).toFixed(2),
      first_active_slice: firstSlice,
      last_active_slice: lastSlice,
      presence_type: presenceType,
      change_suggestion: changeSuggestion
    };
  }, [temporalFlowData, results, nodeLemma]);

  const exportCombinedSummaryTxt = () => {
    const lines = [
      `DISCURSIVE ANALYSIS SUMMARY`,
      `Node: ${nodeLemma}`,
      `Generated: ${new Date().toISOString().slice(0, 10)}`,
      ``,
      `--- A. CONSTELLATION SNAPSHOT ---`,
      `Top co-lemmas: ${constellationSnapshotSummary.top_co_lemmas}`,
      `Structure: ${constellationSnapshotSummary.total_nodes} nodes, ${constellationSnapshotSummary.total_links} links (${constellationSnapshotSummary.density_pattern})`,
      `Total quads: ${constellationSnapshotSummary.total_quads}`,
      ``,
      `--- B. CLUSTER / CONFIGURATION PROFILE ---`,
      `Cluster count: ${configurationProfileSummary.cluster_count}`,
      `Configuration type: ${configurationProfileSummary.configuration_type}`,
      `Largest cluster: ${configurationProfileSummary.largest_cluster_size} terms`,
      `Top cluster anchors: ${configurationProfileSummary.top_cluster_anchors}`,
      ``,
      `--- C. CONCEPT BEHAVIOUR SUMMARY ---`,
      ...(behaviourSummary ? [
        `Intra-subcluster: ${behaviourSummary.intra_subcluster_count} quads (${(parseFloat(behaviourSummary.intra_ratio) * 100).toFixed(0)}%)`,
        `Cross-subcluster: ${behaviourSummary.cross_subcluster_count} quads (${(parseFloat(behaviourSummary.cross_ratio) * 100).toFixed(0)}%)`,
        `Fringe: ${behaviourSummary.fringe_count} quads (${(parseFloat(behaviourSummary.fringe_ratio) * 100).toFixed(0)}%)`,
        `Dominant behaviour: ${behaviourSummary.dominant_behaviour}`,
      ] : [`(no participation data)`]),
      ``,
      `--- D. DIACHRONIC CHANGE VIEW ---`,
      ...(diachronicChangeSummary ? [
        `Active slices: ${diachronicChangeSummary.active_slices} of ${diachronicChangeSummary.total_slices}`,
        `First active: ${diachronicChangeSummary.first_active_slice}`,
        `Last active: ${diachronicChangeSummary.last_active_slice}`,
        `Presence type: ${diachronicChangeSummary.presence_type}`,
        `Change suggestion: ${diachronicChangeSummary.change_suggestion}`,
      ] : [`(no temporal data)`]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `discursive_summary_${nodeLemma}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      <DetailsPanel dataset="SPEECHES ONLY" tokenCol="text_raw" settings={{ stoplist: useStoplist, lemmas: useLemmas }} ui={ui} playwrights={ui.selectedPlaywrights} />
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
            <div className="space-y-1"><span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">TOP QUAD</span><p className="text-[10px] font-bold text-primary truncate" title={topQuadsFiltered[0]?.quadKey || activeSliceData?.top3[0]}>{(topQuadsFiltered[0]?.quadKey || activeSliceData?.top3[0])?.replace(/\|/g, ', ') || '-'}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="pt-4 pb-1 border-b border-muted/30 mb-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">A · Constellation Snapshot</h2>
        <p className="text-[9px] text-muted-foreground/70 mt-0.5">Cross-sectional view of the node lemma's current constellation structure.</p>
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
              No sufficient quad evidence is available for the current time slice.
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
              {contentWordOnly ? "No sufficient quad evidence is available for the current selection. Try switching to All Words." : "No sufficient quad evidence is available at this Sankey threshold."}
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
                scrollable
              />
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {sankeyData && (
        <div className="rounded-md border border-muted/40 bg-muted/5 px-3 py-2 text-[10px] text-muted-foreground flex items-start justify-between gap-2">
          <span>
            <span className="font-semibold text-foreground/80">Interpretation: </span>
            {(() => {
              const n = sankeyData.nodes.length;
              const l = sankeyData.links.length;
              const density = l > n ? "dense" : l === n ? "moderate" : "sparse";
              return `The constellation shows ${n} nodes connected by ${l} links, indicating a ${density} structure.`;
            })()}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-6 text-[8px] px-2" onClick={() => exportToCsv(`constellation_snapshot_${nodeLemma}.csv`, [constellationSnapshotSummary])} title="Export Constellation Snapshot CSV"><Download className="h-2.5 w-2.5 mr-1" />CSV</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[8px] px-2" onClick={() => navigator.clipboard.writeText(Object.entries(constellationSnapshotSummary).map(([k,v]) => `${k}: ${v}`).join("\n"))} title="Copy summary"><Clipboard className="h-2.5 w-2.5 mr-1" />Copy</Button>
          </div>
        </div>
      )}

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
            scrollable
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
                <ResultsTable data={topQuadsFiltered} columns={[{ key: "quadKey", label: "Quad" }, { key: "count", label: "Freq", sortable: true, align: "right" }]} onPin={(item) => setPinned(p => [...p, { label: item.quadKey, metric: item.count }])} filename="slice_quads.csv" scrollable />
              )
            ) : (
              <div className="text-[10px] text-muted-foreground italic">No sufficient quad evidence is available for the current selection. Try switching to All Words.</div>
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

      <div className="pt-4 pb-1 border-b border-muted/30 mb-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">B · Cluster / Configuration Profile</h2>
        <p className="text-[9px] text-muted-foreground/70 mt-0.5">Configuration of recurring co-lemmas and thematic grouping within the constellation.</p>
      </div>

      {clusterAnchorsData.length > 0 && (
        <div className="rounded-md border border-muted/40 bg-muted/5 px-3 py-2 text-[10px] text-muted-foreground flex items-start justify-between gap-2">
          <span>
            <span className="font-semibold text-foreground/80">Configuration Summary: </span>
            {(() => {
              const n = clusterAnchorsData.length;
              const largest = clusterAnchorsData[0]?.termCount || 0;
              const total = clusterAnchorsData.reduce((s, c) => s + c.termCount, 0);
              const config = total > 0 && largest / total > 0.5 ? "centralised" : "distributed";
              return `The constellation contains ${n} cluster${n !== 1 ? "s" : ""}, with the largest comprising ${largest} item${largest !== 1 ? "s" : ""}, suggesting a ${config} configuration.`;
            })()}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-6 text-[8px] px-2" onClick={() => exportToCsv(`configuration_profile_${nodeLemma}.csv`, [configurationProfileSummary])} title="Export Configuration Profile CSV"><Download className="h-2.5 w-2.5 mr-1" />CSV</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[8px] px-2" onClick={() => navigator.clipboard.writeText(Object.entries(configurationProfileSummary).map(([k,v]) => `${k}: ${v}`).join("\n"))} title="Copy summary"><Clipboard className="h-2.5 w-2.5 mr-1" />Copy</Button>
          </div>
        </div>
      )}

      <Card className="shadow-none border-muted/60 overflow-hidden">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Constellation Subclusters</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-muted p-0.5 rounded-md border shadow-inner">
              <Button variant={subclusterSortBy === "quad-count" ? "default" : "ghost"} size="sm" onClick={() => setSubclusterSortBy("quad-count")} className="h-6 text-[9px] px-2">Quad Count</Button>
              <Button variant={subclusterSortBy === "term-count" ? "default" : "ghost"} size="sm" onClick={() => setSubclusterSortBy("term-count")} className="h-6 text-[9px] px-2">Term Count</Button>
              <Button variant={subclusterSortBy === "anchor-strength" ? "default" : "ghost"} size="sm" onClick={() => setSubclusterSortBy("anchor-strength")} className="h-6 text-[9px] px-2">Anchor Strength</Button>
            </div>
            <Select value={subclusterShowLimit === null ? "all" : subclusterShowLimit.toString()} onValueChange={(v) => setSubclusterShowLimit(v === "all" ? null : Number(v) as 5 | 10 | 20)}>
              <SelectTrigger className="h-6 text-[9px] w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {clusterAnchorsData.length > 0 ? (
            <div className="space-y-3">
              {(() => {
                let sorted = [...clusterAnchorsData];
                if (subclusterSortBy === "quad-count") {
                  sorted.sort((a, b) => b.quadCount - a.quadCount);
                } else if (subclusterSortBy === "term-count") {
                  sorted.sort((a, b) => b.termCount - a.termCount);
                } else if (subclusterSortBy === "anchor-strength") {
                  sorted.sort((a, b) => (b.topAnchors[0]?.score || 0) - (a.topAnchors[0]?.score || 0));
                }
                const displayed = subclusterShowLimit ? sorted.slice(0, subclusterShowLimit) : sorted;
                return displayed.map((cluster, displayIdx) => (
                <div key={displayIdx} className="border-b border-muted/30 pb-2 last:border-b-0">
                  <div className="text-[10px] font-bold text-foreground/80 mb-1">Cluster {displayIdx + 1}</div>
                  <div className="text-[9px] font-mono mb-1">{cluster.terms.join(", ")}</div>
                  <div className="text-[9px] text-muted-foreground mb-1">{cluster.termCount} terms · {cluster.edges} links · {cluster.quadCount} quads</div>
                  <div className="text-[9px] mb-1">
                    <span className="font-bold text-foreground/70">Anchors: </span>
                    <span className="font-mono text-[8px]">{cluster.topAnchors.map(a => `${a.term}(${a.score})`).join(", ")}</span>
                  </div>
                </div>
              ));
              })()}
              <div className="text-[8px] text-muted-foreground italic pt-2 border-t">Only subclusters with 3+ co-lemmas are displayed. Anchor scores show quads containing each term.</div>
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground italic">No sufficient subcluster evidence is available for the current selection.</div>
          )}
        </CardContent>
      </Card>

      <Collapsible defaultOpen={false}>
      <Card className="shadow-none border-muted/60 overflow-hidden">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Recurring Co-Lemmas</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-muted p-0.5 rounded-md border shadow-inner">
              <Button variant={!contentWordOnly ? "default" : "ghost"} size="sm" onClick={() => setContentWordOnly(false)} className="h-7 text-[9px] px-3">All Words</Button>
              <Button variant={contentWordOnly ? "default" : "ghost"} size="sm" onClick={() => setContentWordOnly(true)} className="h-7 text-[9px] px-3">Content Only</Button>
            </div>
            <div className="flex bg-muted p-0.5 rounded-md border shadow-inner">
              <Button variant={coTermFilter === "All" ? "default" : "ghost"} size="sm" onClick={() => setCoTermFilter("All")} className="h-7 text-[9px] px-3">All</Button>
              <Button variant={coTermFilter === "Core" ? "default" : "ghost"} size="sm" onClick={() => setCoTermFilter("Core")} className="h-7 text-[9px] px-3">Core only</Button>
            </div>
            <Select value={coTermLimit === null ? "all" : coTermLimit.toString()} onValueChange={(v) => setCoTermLimit(v === "all" ? null : Number(v) as 10 | 20)}>
              <SelectTrigger className="h-7 text-[9px] w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><ChevronDown className="h-3 w-3" /></Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="p-4">
          {recurringCoTerms.length > 0 ? (
            <div className="space-y-1">
              {recurringCoTerms.map(([term, count]) => (
                <div key={term} className="flex justify-between items-center text-[10px] py-1 border-b border-muted/30">
                  <span className="font-mono">{term}</span>
                  <span className="text-muted-foreground font-bold">{count} quads</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground italic">No sufficient co-lemma evidence is available for the current selection.</div>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <Collapsible defaultOpen={false}>
      <Card className="shadow-none border-muted/60 overflow-hidden">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Top Co-Lemma Pairings</CardTitle>
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><ChevronDown className="h-3 w-3" /></Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="p-4">
          {coTermPairs.length > 0 ? (
            <div className="space-y-1">
              {coTermPairs.map(([pair, count]) => {
                const [term1, term2] = pair.split("|");
                return (
                  <div key={pair} className="flex justify-between items-center text-[10px] py-1 border-b border-muted/30">
                    <span className="font-mono">{term1} • {term2}</span>
                    <span className="text-muted-foreground font-bold">{count} quads</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground italic">No sufficient co-lemma pairing evidence is available for the current selection.</div>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <div className="pt-4 pb-1 border-b border-muted/30 mb-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">C · Concept Behaviour Summary</h2>
        <p className="text-[9px] text-muted-foreground/70 mt-0.5">How the concept behaves structurally across clusters, cores, and peripheral zones.</p>
      </div>

      {quadSubclusterParticipationData.length > 0 && (
        <div className="rounded-md border border-muted/40 bg-muted/5 px-3 py-2 text-[10px] text-muted-foreground flex items-start justify-between gap-2">
          <span>
            <span className="font-semibold text-foreground/80">Behaviour Summary: </span>
            {(() => {
              const total = quadSubclusterParticipationData.length;
              const fringe = quadSubclusterParticipationData.filter(r => r.participationType === "Fringe").length;
              const fringePct = total > 0 ? fringe / total : 0;
              const level = fringePct > 0.6 ? "high" : fringePct > 0.3 ? "moderate" : "low";
              const behaviour = fringePct > 0.6 ? "diffuse" : fringePct > 0.3 ? "expanding" : "stable";
              return `The concept displays ${level} peripheral activity, indicating a ${behaviour} behaviour.`;
            })()}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-6 text-[8px] px-2" onClick={() => behaviourSummary && exportToCsv(`concept_behaviour_${nodeLemma}.csv`, [behaviourSummary])} title="Export Behaviour Summary CSV"><Download className="h-2.5 w-2.5 mr-1" />CSV</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[8px] px-2" onClick={() => behaviourSummary && navigator.clipboard.writeText(Object.entries(behaviourSummary).map(([k,v]) => `${k}: ${v}`).join("\n"))} title="Copy summary"><Clipboard className="h-2.5 w-2.5 mr-1" />Copy</Button>
          </div>
        </div>
      )}

      <Card className="shadow-none border-muted/60 overflow-hidden">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-bold">Quad Subcluster Participation</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-muted p-0.5 rounded-md border shadow-inner">
              <Button variant={participationFilter === "All" ? "default" : "ghost"} size="sm" onClick={() => setParticipationFilter("All")} className="h-6 text-[9px] px-2">All</Button>
              <Button variant={participationFilter === "Boundary" ? "default" : "ghost"} size="sm" onClick={() => setParticipationFilter("Boundary")} className="h-6 text-[9px] px-2">Boundary</Button>
              <Button variant={participationFilter === "Cross-subcluster" ? "default" : "ghost"} size="sm" onClick={() => setParticipationFilter("Cross-subcluster")} className="h-6 text-[9px] px-2">Cross</Button>
              <Button variant={participationFilter === "Fringe" ? "default" : "ghost"} size="sm" onClick={() => setParticipationFilter("Fringe")} className="h-6 text-[9px] px-2">Fringe</Button>
            </div>
            <Select value={participationRowLimit === null ? "all" : participationRowLimit.toString()} onValueChange={(v) => setParticipationRowLimit(v === "all" ? null : Number(v) as 20 | 50)}>
              <SelectTrigger className="h-6 text-[9px] w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="50">Top 50</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto custom-scrollbar">
          {(() => {
            const filteredRows = quadSubclusterParticipationData.filter(row => {
              if (participationFilter === "All") return true;
              if (participationFilter === "Boundary") return row.participationType === "Cross-subcluster" || row.participationType === "Fringe";
              return row.participationType === participationFilter;
            });
            const displayedRows = participationRowLimit ? filteredRows.slice(0, participationRowLimit) : filteredRows;
            if (filteredRows.length === 0) {
              return <div className="p-4 text-[10px] text-muted-foreground italic">No sufficient participation evidence is available for the current filter selection.</div>;
            }
            const total = displayedRows.length;
            const intraCount = displayedRows.filter(r => r.participationType === "Intra-subcluster").length;
            const crossCount = displayedRows.filter(r => r.participationType === "Cross-subcluster").length;
            const fringeCount = displayedRows.filter(r => r.participationType === "Fringe").length;
            const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "—";
            const handleExport = () => exportToCsv(
              `quad_subcluster_participation_${nodeLemma}_${participationFilter.toLowerCase().replace(/[^a-z0-9]/g, "_")}.csv`,
              displayedRows.map(r => ({
                quadKey: r.quadKey,
                participationType: r.participationType,
                subclustersTouched: r.subclustersTouched,
                mappedCoTerms: r.mappedCoTerms.join(", "),
                unmappedCoTermsList: r.unmappedCoTermsList.join(", "),
                frequency: r.frequency
              }))
            );
            return (
              <>
                <div className="flex items-center gap-4 px-3 py-2 bg-muted/10 border-b text-[9px] flex-wrap">
                  <span className="font-bold text-foreground/70">Showing {total} quads</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-gray-300 mr-0.5" />Intra: <strong>{intraCount}</strong> <span className="text-muted-foreground">({pct(intraCount)})</span></span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-purple-300 mr-0.5" />Cross: <strong>{crossCount}</strong> <span className="text-muted-foreground">({pct(crossCount)})</span></span>
                  <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-blue-300 mr-0.5" />Fringe: <strong>{fringeCount}</strong> <span className="text-muted-foreground">({pct(fringeCount)})</span></span>
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] ml-auto" onClick={handleExport}><Download className="h-3 w-3 mr-1" />Export CSV</Button>
                </div>
              <div className="overflow-y-auto max-h-[450px]">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-muted/20 border-b sticky top-0 z-10">
                    <th className="p-2 text-left font-bold border-r bg-muted/20">Quad</th>
                    <th className="p-2 text-center font-bold border-r bg-muted/20">Participation Type</th>
                    <th className="p-2 text-center font-bold border-r bg-muted/20">Subclusters Touched</th>
                    <th className="p-2 text-left font-bold border-r bg-muted/20">Mapped Co-lemmas</th>
                    <th className="p-2 text-left font-bold bg-muted/20">Unmapped Co-lemmas</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/10">
                      <td className="p-2 text-left font-mono text-[9px]">{row.quadKey}</td>
                      <td className="p-2 text-center border-r text-[9px]">
                        <span className={`px-2 py-0.5 rounded font-medium text-[8px] inline-block ${
                          row.participationType === "Cross-subcluster" ? "bg-purple-100 text-purple-800" :
                          row.participationType === "Fringe" ? "bg-blue-100 text-blue-800" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {row.participationType}
                        </span>
                      </td>
                      <td className="p-2 text-center border-r text-[9px]">{row.subclustersTouched}</td>
                      <td className="p-2 text-left border-r text-[9px] font-mono">{row.mappedCoTerms.join(", ") || "—"}</td>
                      <td className="p-2 text-left text-[9px] font-mono">{row.unmappedCoTermsList.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      <Card className="shadow-none border-muted/60 overflow-hidden">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Core vs Peripheral Quads</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-muted p-0.5 rounded-md border shadow-inner">
              <Button variant={coreStatusFilter === "All" ? "default" : "ghost"} size="sm" onClick={() => setCoreStatusFilter("All")} className="h-7 text-[9px] px-3">All</Button>
              <Button variant={coreStatusFilter === "Core" ? "default" : "ghost"} size="sm" onClick={() => setCoreStatusFilter("Core")} className="h-7 text-[9px] px-3">Core</Button>
              <Button variant={coreStatusFilter === "Mid-zone" ? "default" : "ghost"} size="sm" onClick={() => setCoreStatusFilter("Mid-zone")} className="h-7 text-[9px] px-3">Mid-zone</Button>
              <Button variant={coreStatusFilter === "Peripheral" ? "default" : "ghost"} size="sm" onClick={() => setCoreStatusFilter("Peripheral")} className="h-7 text-[9px] px-3">Peripheral</Button>
            </div>
            <Label className="text-[9px] font-bold opacity-60">SHOW</Label>
            <Select value={coreTableLimit === null ? "all" : coreTableLimit.toString()} onValueChange={(v) => setCoreTableLimit(v === "all" ? null : Number(v) as 20 | 50 | 100)}>
              <SelectTrigger className="h-7 text-[9px] w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="50">Top 50</SelectItem>
                <SelectItem value="100">Top 100</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-7 text-[9px]" onClick={() => {
              if (corePeripheralData) exportToCsv(`core_peripheral_${nodeLemma}_${corpusScope}.csv`, corePeripheralData);
            }}>
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto custom-scrollbar">
          {corePeripheralData && corePeripheralData.length > 0 ? (
            <>
              <div className="px-4 py-3 border-b bg-blue-50/30 text-[10px]">
                <div className="space-y-1">
                  <span className="font-bold text-muted-foreground uppercase tracking-tight text-[9px]">Constellation Structural Density</span>
                  <p className="text-sm font-bold text-blue-900">{constellationStructuralDensity.toFixed(2)}</p>
                </div>
              </div>
              <div className="px-4 py-3 flex gap-6 border-b bg-muted/5 flex-wrap text-[10px]">
                {(() => {
                  const coreCnt = corePeripheralData.filter(q => q.status === "Core").length;
                  const midzoneCnt = corePeripheralData.filter(q => q.status === "Mid-zone").length;
                  const peripheralCnt = corePeripheralData.filter(q => q.status === "Peripheral").length;
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded font-medium">Core</span>
                        <span className="font-mono font-bold">{coreCnt}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">Mid-zone</span>
                        <span className="font-mono font-bold">{midzoneCnt}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">Peripheral</span>
                        <span className="font-mono font-bold">{peripheralCnt}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="overflow-y-auto max-h-[450px]">
              <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-muted/20 border-b sticky top-0 z-10">
                  <th className="sticky left-0 bg-muted/20 z-20 p-2 text-left font-bold border-r">Quad</th>
                  <th className="p-2 text-right font-bold border-r cursor-pointer hover:bg-muted/30 select-none" onClick={() => { setCoreSortBy("frequency"); setCoreSortDir(coreSortBy === "frequency" && coreSortDir === "desc" ? "asc" : "desc"); }}>Total Freq {coreSortBy === "frequency" && (coreSortDir === "desc" ? "↓" : "↑")}</th>
                  <th className="p-2 text-center font-bold border-r cursor-pointer hover:bg-muted/30 select-none" onClick={() => { setCoreSortBy("dispersion"); setCoreSortDir(coreSortBy === "dispersion" && coreSortDir === "desc" ? "asc" : "desc"); }}>Dispersion {coreSortBy === "dispersion" && (coreSortDir === "desc" ? "↓" : "↑")}</th>
                  <th className="p-2 text-center font-bold border-r">First Seen</th>
                  <th className="p-2 text-center font-bold border-r">Last Seen</th>
                  <th className="p-2 text-center font-bold border-r">Temporal Behaviour</th>
                  <th className="p-2 text-center font-bold border-r">Structural links</th>
                  <th className="p-2 text-center font-bold border-r">Backbone</th>
                  <th className="p-2 text-center font-bold cursor-pointer hover:bg-muted/30 select-none" onClick={() => { setCoreSortBy("status"); setCoreSortDir(coreSortBy === "status" && coreSortDir === "asc" ? "desc" : "asc"); }}>Status {coreSortBy === "status" && (coreSortDir === "asc" ? "↑" : "↓")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const statusOrder = { "Core": 0, "Mid-zone": 1, "Peripheral": 2 };
                  const sorted = [...corePeripheralData].sort((a, b) => {
                    if (coreSortBy === "frequency") {
                      return coreSortDir === "desc" ? b.total_frequency - a.total_frequency : a.total_frequency - b.total_frequency;
                    } else if (coreSortBy === "dispersion") {
                      const diff = b.slices_present - a.slices_present;
                      return coreSortDir === "desc" ? diff : -diff;
                    } else if (coreSortBy === "status") {
                      const aOrd = statusOrder[a.status as keyof typeof statusOrder] ?? 999;
                      const bOrd = statusOrder[b.status as keyof typeof statusOrder] ?? 999;
                      return coreSortDir === "asc" ? aOrd - bOrd : bOrd - aOrd;
                    }
                    return 0;
                  });
                  const filtered = coreStatusFilter === "All" ? sorted : sorted.filter(q => q.status === coreStatusFilter);
                  const displayed = coreTableLimit ? filtered.slice(0, coreTableLimit) : filtered;
                  return displayed.flatMap(row => [
                    <tr 
                      key={row.quadKey}
                      className={`border-b hover:bg-muted/10 transition-colors ${selectedQuadKey === row.quadKey ? 'bg-muted/20' : ''}`}
                    >
                      <td className="sticky left-0 bg-background z-10 p-2 border-r font-medium cursor-pointer" onClick={() => setSelectedQuadKey(row.quadKey)}>
                        {(() => {
                          const parts = row.quadKey.split("|");
                          return (
                            <span className="font-mono text-[9px]">
                              {parts[0]}
                              {parts.slice(1).map((part, idx) => (
                                <span key={idx}> | {part}</span>
                              ))}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-2 text-right border-r font-mono">{row.total_frequency}</td>
                      <td className="p-2 text-center border-r font-mono text-[9px]">{row.slices_present === 1 ? "1 slice" : `${row.slices_present} slices`}</td>
                      <td className="p-2 text-center border-r text-[9px]">{row.first_seen}</td>
                      <td className="p-2 text-center border-r text-[9px]">{row.last_seen}</td>
                      <td className="p-2 text-center border-r text-[9px]">{row.temporal_behaviour}</td>
                      <td className="p-2 text-center border-r text-[9px] font-mono">{quadStructuralCentrality.get(row.quadKey) ?? 0}</td>
                      <td className="p-2 text-center border-r text-[9px]">{quadStructuralBackbone.get(row.quadKey) ? <span className="bg-gray-900 text-white px-2 py-0.5 rounded font-medium text-[8px]">Yes</span> : <span className="bg-gray-100 text-gray-900 px-2 py-0.5 rounded font-medium text-[8px]">No</span>}</td>
                      <td className="p-2 text-center space-x-1">
                        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[8px]" onClick={() => setExpandedQuad(expandedQuad === row.quadKey ? null : row.quadKey)}>
                          {expandedQuad === row.quadKey ? "−" : "+"}
                        </Button>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-medium inline-block ${
                          row.status === "Core" ? "bg-green-100 text-green-800" :
                          row.status === "Mid-zone" ? "bg-amber-100 text-amber-800" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>,
                    expandedQuad === row.quadKey && results?.quadExamplesObj?.[row.quadKey]?.[0] ? (
                      <tr key={`${row.quadKey}-example`} className="bg-muted/5 border-b">
                        <td colSpan={9} className="p-3 text-[9px]">
                          <div className="space-y-1">
                            <div className="font-bold text-[9px] text-foreground/80">{results.quadExamplesObj[row.quadKey][0].source.title} | {results.quadExamplesObj[row.quadKey][0].source.act}:{results.quadExamplesObj[row.quadKey][0].source.scene} | {results.quadExamplesObj[row.quadKey][0].source.speaker}</div>
                            <div className="italic text-foreground/70 max-w-2xl">"{results.quadExamplesObj[row.quadKey][0].source.excerpt}"</div>
                          </div>
                        </td>
                      </tr>
                    ) : null
                  ]);
                })()}
              </tbody>
            </table>
            </div>
            </>
          ) : (
            <div className="p-8 text-center text-[10px] text-muted-foreground italic">No sufficient core/peripheral quad evidence is available for the current selection.</div>
          )}
        </CardContent>
      </Card>

      <div className="pt-4 pb-1 border-b border-muted/30 mb-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">D · Diachronic Change View</h2>
        <p className="text-[9px] text-muted-foreground/70 mt-0.5">How the concept's structure and prominence vary across time slices.</p>
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

      {temporalFlowData && results?.sortedSlices && (
        <div className="rounded-md border border-muted/40 bg-muted/5 px-3 py-2 text-[10px] text-muted-foreground flex items-start justify-between gap-2">
          <span>
            <span className="font-semibold text-foreground/80">Change Summary: </span>
            {(() => {
              const slices = results.sortedSlices;
              const total = slices.length;
              const activeSlices = slices.filter(s => temporalFlowData.some(row => (row[s] || 0) > 0)).length;
              const halfIdx = Math.floor(total / 2);
              const firstHalfActive = slices.slice(0, halfIdx).some(s => temporalFlowData.some(row => (row[s] || 0) > 0));
              const type = activeSlices === total ? "continuous" : !firstHalfActive && activeSlices > 0 ? "emerging" : "intermittent";
              const interp = type === "continuous" ? "stability" : type === "emerging" ? "expansion" : "fluctuation";
              return `The concept shows ${type} presence across time, suggesting ${interp}.`;
            })()}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-6 text-[8px] px-2" onClick={() => diachronicChangeSummary && exportToCsv(`diachronic_change_${nodeLemma}.csv`, [diachronicChangeSummary])} title="Export Diachronic Change CSV"><Download className="h-2.5 w-2.5 mr-1" />CSV</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[8px] px-2" onClick={() => diachronicChangeSummary && navigator.clipboard.writeText(Object.entries(diachronicChangeSummary).map(([k,v]) => `${k}: ${v}`).join("\n"))} title="Copy summary"><Clipboard className="h-2.5 w-2.5 mr-1" />Copy</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[8px] px-2" onClick={exportCombinedSummaryTxt} title="Download all four summaries as .txt"><Download className="h-2.5 w-2.5 mr-1" />.txt</Button>
          </div>
        </div>
      )}

      <Card className="shadow-none border-muted/60 overflow-hidden">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Temporal Concept Flow</CardTitle>
          <Button variant="outline" size="sm" className="h-7 text-[9px]" onClick={() => {
            if (temporalFlowData) exportToCsv(`temporal_flow_${nodeLemma}_${corpusScope}.csv`, temporalFlowData);
          }}>
            <Download className="h-3 w-3 mr-1" /> Export Flow
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {temporalFlowData && temporalFlowData.length > 0 ? (
            <div className="overflow-y-auto overflow-x-auto max-h-[450px] custom-scrollbar">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-muted/20 border-b sticky top-0 z-10">
                  <th className="sticky left-0 bg-muted/20 z-20 p-2 text-left font-bold border-r">Quad</th>
                  {results?.sortedSlices.map(s => (
                    <th key={s} className="p-2 text-center font-bold border-r bg-muted/20">{s}</th>
                  ))}
                  <th className="p-2 text-right font-bold border-r bg-muted/20">Total</th>
                  <th className="p-2 text-center font-bold border-r bg-muted/20">First Seen</th>
                  <th className="p-2 text-center font-bold bg-muted/20">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {temporalFlowData.map(row => (
                  <tr 
                    key={row.quadKey}
                    className={`border-b hover:bg-muted/10 cursor-pointer transition-colors ${selectedQuadKey === row.quadKey ? 'bg-muted/20' : ''}`}
                    onClick={() => setSelectedQuadKey(row.quadKey)}
                  >
                    <td className="sticky left-0 bg-background z-10 p-2 border-r font-medium">{row.quadKey}</td>
                    {results?.sortedSlices.map(s => (
                      <td key={s} className="p-2 text-center border-r">{row[s] || 0}</td>
                    ))}
                    <td className="p-2 text-right border-r font-mono">{row.total}</td>
                    <td className="p-2 text-center border-r text-[9px]">{row.first_seen}</td>
                    <td className="p-2 text-center">{row.last_seen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="p-8 text-center text-[10px] text-muted-foreground italic">No sufficient temporal flow evidence is available for the current selection.</div>
          )}
        </CardContent>
      </Card>

      <Collapsible defaultOpen={false}>
      <Card className="shadow-none border-muted/60 overflow-hidden">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Constellation Similarity / Distance</CardTitle>
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-[9px]" onClick={() => {
            if (similarityData) {
              const exportData = [
                { metric: "Primary Node", value: similarityData.primaryNode },
                { metric: "Comparison Node", value: similarityData.comparisonNode },
                { metric: "Shared Quads", value: similarityData.sharedQuads },
                { metric: "Shared Co-lemmas", value: similarityData.sharedColemmas },
                { metric: "Quad Jaccard %", value: similarityData.jaccard_quad },
                { metric: "Co-lemma Jaccard %", value: similarityData.jaccard_colemma }
              ];
              exportToCsv(`constellation_similarity_${nodeLemma}_vs_${comparisonNodeLemma}.csv`, exportData);
            }
          }}>
            <Download className="h-3 w-3 mr-1" /> Export
          </Button>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><ChevronDown className="h-3 w-3" /></Button>
          </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="pt-4 space-y-4">
          {similarityData ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-[10px]">
                <div className="p-3 border rounded-lg bg-muted/5">
                  <span className="font-bold opacity-60">PRIMARY NODE</span>
                  <p className="font-mono mt-1">{similarityData.primaryNode}</p>
                </div>
                <div className="p-3 border rounded-lg bg-muted/5">
                  <span className="font-bold opacity-60">COMPARISON NODE</span>
                  <Input type="text" value={comparisonNodeLemma} onChange={(e) => setComparisonNodeLemma(e.target.value)} className="h-6 text-[9px] mt-1" />
                </div>
                <div className="p-3 border rounded-lg bg-muted/5">
                  <span className="font-bold opacity-60">SHARED QUADS</span>
                  <p className="font-mono mt-1">{similarityData.sharedQuads} / {Math.min(similarityData.primaryQuads, similarityData.comparisonQuads)}</p>
                </div>
                <div className="p-3 border rounded-lg bg-muted/5">
                  <span className="font-bold opacity-60">SHARED CO-LEMMAS</span>
                  <p className="font-mono mt-1">{similarityData.sharedColemmas} / {Math.min(similarityData.primaryColemmas, similarityData.comparisonColemmas)}</p>
                </div>
                <div className="p-3 border rounded-lg bg-primary/10">
                  <span className="font-bold opacity-60">QUAD JACCARD</span>
                  <p className="font-mono mt-1 text-sm font-bold">{similarityData.jaccard_quad}%</p>
                </div>
                <div className="p-3 border rounded-lg bg-primary/10">
                  <span className="font-bold opacity-60">CO-LEMMA JACCARD</span>
                  <p className="font-mono mt-1 text-sm font-bold">{similarityData.jaccard_colemma}%</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-bold mb-2">Top Shared Quads</p>
                  <div className="space-y-1 max-h-[240px] overflow-y-auto">
                    {similarityData.sharedQuadData.map((q: any) => (
                      <div key={q.quadKey} className="p-2 border rounded text-[9px] cursor-pointer hover:bg-muted/10" onClick={() => setSelectedQuadKey(q.quadKey)}>
                        {q.quadKey}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-bold mb-2">Top Shared Co-lemmas</p>
                  <div className="space-y-1 max-h-[240px] overflow-y-auto">
                    {similarityData.sharedColemmaData.map((c: any) => (
                      <div key={c.colemma} className="p-2 border rounded text-[9px]">
                        {c.colemma}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-[10px] text-muted-foreground italic">No sufficient comparison constellation evidence is available for the current selection.</div>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <Collapsible defaultOpen={false}>
      <Card className="shadow-none border-muted/60 overflow-x-auto">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-sm font-bold">Constellation Similarity Matrix</CardTitle>
            <p className="text-[9px] text-muted-foreground">Quad Jaccard similarity between node lemmas</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[9px] font-bold opacity-60">Top N</Label>
            <Select value={matrixNodeLimit.toString()} onValueChange={(v) => setMatrixNodeLimit(Number(v) as 5 | 10 | 20)}>
              <SelectTrigger className="h-7 text-[9px] w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-7 text-[9px]" onClick={() => {
              if (matrixData) {
                const csvData = [
                  ["", ...matrixData.nodes],
                  ...matrixData.nodes.map((n, i) => [n, ...matrixData.matrix[i].map(v => v.toFixed(1))])
                ];
                const csv = csvData.map(r => r.join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `constellation_matrix_${nodeLemma}.csv`;
                a.click();
              }
            }}>
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><ChevronDown className="h-3 w-3" /></Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="pt-4">
          {matrixData && matrixData.valid.length >= 2 ? (
            <div className="overflow-y-auto overflow-x-auto max-h-[450px]">
              <table className="w-full border-collapse text-[9px]">
                <thead>
                  <tr className="sticky top-0 z-10">
                    <th className="sticky left-0 top-0 bg-background z-20 p-2 text-left font-bold border-r border-b">&nbsp;</th>
                    {matrixData.nodes.map(n => (
                      <th key={n} className="p-2 text-center font-bold border-r border-b h-16 bg-background">
                        <div className="transform -rotate-45 origin-center whitespace-nowrap text-[8px]">{n}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.nodes.map((rowNode, i) => (
                    <tr key={rowNode}>
                      <td className="sticky left-0 bg-background z-10 p-2 font-bold border-r border-b">{rowNode}</td>
                      {matrixData.matrix[i].map((val, j) => (
                        <td 
                          key={j} 
                          className={`p-2 text-center border-r border-b cursor-pointer transition-colors ${val === 100 ? 'bg-primary/20' : 'hover:bg-muted/30'}`}
                          onClick={() => { setComparisonNodeLemma(matrixData.nodes[j]); setNodeLemma(rowNode); }}
                        >
                          {val.toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-[10px] text-muted-foreground italic">No sufficient constellation matrix evidence is available for the current selection.</div>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <Collapsible defaultOpen={false}>
      <Card className="shadow-none border-muted/60">
        <CardHeader className="bg-muted/5 border-b flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-sm font-bold">Constellation Clusters</CardTitle>
            <p className="text-[9px] text-muted-foreground">Groups of similar constellations</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[9px] font-bold opacity-60">Threshold</Label>
            <Select value={clusteringThreshold.toString()} onValueChange={(v) => setClusteringThreshold(Number(v) as 0.01 | 0.02 | 0.05)}>
              <SelectTrigger className="h-7 text-[9px] w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.01">1%</SelectItem>
                <SelectItem value="0.02">2%</SelectItem>
                <SelectItem value="0.05">5%</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-7 text-[9px]" onClick={() => {
              if (clusteringData?.clusterStats) {
                const csvData = clusteringData.clusterStats.map(c => ({
                  cluster: c.id,
                  members: c.members.join("; "),
                  size: c.size,
                  avg_similarity: c.avgSimilarity.toFixed(1)
                }));
                exportToCsv(`constellation_clusters_${nodeLemma}.csv`, csvData);
              }
            }}>
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><ChevronDown className="h-3 w-3" /></Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="pt-4 space-y-4">
          {clusteringData && clusteringData.clusterStats.length > 0 ? (
            <div className="space-y-4">
              {clusteringData.clusterStats.map((cluster, idx) => (
                <div key={idx} className="p-3 border rounded-lg bg-muted/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-[10px]">{cluster.id}</p>
                    <div className="flex gap-4 text-[9px]">
                      <span className="opacity-70">Size: {cluster.size}</span>
                      <span className="opacity-70">Avg Similarity: {cluster.avgSimilarity.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cluster.members.map(member => (
                      <Badge 
                        key={member} 
                        variant="outline" 
                        className="cursor-pointer hover:bg-primary/20 transition-colors text-[9px]"
                        onClick={() => setNodeLemma(member)}
                      >
                        {member}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-[10px] text-muted-foreground italic">No sufficient cluster evidence is available for the current selection.</div>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

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
            <div className="text-[10px] text-muted-foreground italic">No sufficient node lemma evidence is available for the current selection. Try switching to All Words.</div>
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
