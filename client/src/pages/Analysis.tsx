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
import { Info, Download, Settings2, BarChart3, Table as TableIcon, Search, HelpCircle, TrendingUp, TrendingDown, History, ChevronLeft, ChevronRight, Play, Pause, Network, ChevronDown, ChevronUp, Pin, Trash2, ListFilter, LayoutGrid, FileText, X, Clipboard, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { processTokens, formatTimeValue, getStoplist } from "@/utils/linguistics";
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

const ExpressionSnapshotTable = ({ data, filename }: { data: ExpressionCandidate[]; filename: string }) => {
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
                <TableRow key={i} className="h-8" data-testid={`row-expression-${i}`}>
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
        Showing {filteredData.length} of {data.length} results
      </div>
    </div>
  );
};

const SemanticTab = () => {
  const { speeches } = useData();
  const ui = useUI();
  const { corpusScope, selectedPlayTitle } = ui;
  const [nodeLemma, setNodeLemma] = useState("");
  const [minCooc, setMinCooc] = useState(2);
  const [useStoplist, setUseStoplist] = useState(true);
  const [useLemmas, setUseLemmas] = useState(true);

  const [expressionScope, setExpressionScope] = useState<"node" | "corpus">("node");
  const [ngramLengthSetting, setNgramLengthSetting] = useState<"2-5" | "2" | "3" | "4" | "5">("2-5");
  const [minExpressionFreq, setMinExpressionFreq] = useState(2);
  const [expressionLengthFilter, setExpressionLengthFilter] = useState<"all" | "2" | "3" | "4" | "5">("all");
  const [showLimit, setShowLimit] = useState<"20" | "50" | "100" | "all">("50");
  const expressionCache = useRef<Map<string, any>>(new Map());

  const activeNgramLengths = useMemo(() => {
    return ngramLengthSetting === "2-5" ? EXPRESSION_NGRAM_LENGTHS : [parseInt(ngramLengthSetting)];
  }, [ngramLengthSetting]);

  const expressionResults = useMemo(() => {
    if (!speeches || speeches.length === 0) return null;

    const filtered = speeches.filter(s => {
      if (corpusScope === "play" && (s.title || s.play_id) !== selectedPlayTitle) return false;
      return true;
    });

    const processedNode = expressionScope === "node"
      ? (processTokens(nodeLemma, { useStoplist: false, useLemmas })[0] || nodeLemma.trim().toLowerCase())
      : "";

    if (expressionScope === "node" && !nodeLemma.trim()) return { allCandidates: [], noNodeLemma: true };

    const cacheKey = JSON.stringify({
      scope: corpusScope,
      play: selectedPlayTitle,
      expressionScope,
      node: processedNode,
      stoplist: useStoplist,
      lemmas: useLemmas,
      minFreq: minExpressionFreq,
      ngramLengthSetting,
      speechesLen: speeches.length,
    });
    if (expressionCache.current.has(cacheKey)) return expressionCache.current.get(cacheKey);

    const ngramCounts = new Map<string, { n: number; count: number }>();

    filtered.forEach(s => {
      const tokens = processTokens(s.text_raw || "", { useStoplist, useLemmas });
      activeNgramLengths.forEach(n => {
        for (let i = 0; i + n <= tokens.length; i++) {
          const gram = tokens.slice(i, i + n);
          if (expressionScope === "node" && !gram.includes(processedNode)) continue;
          const key = gram.join(" ");
          if (!ngramCounts.has(key)) ngramCounts.set(key, { n, count: 0 });
          ngramCounts.get(key)!.count += 1;
        }
      });
    });

    const allCandidates = Array.from(ngramCounts.entries())
      .map(([expression, d]) => ({
        expression,
        n: d.n,
        frequency: d.count,
        scope: expressionScope === "node" ? "Node-centred" : "Corpus-wide",
      }))
      .filter(c => c.frequency >= minExpressionFreq)
      .sort((a, b) => b.frequency - a.frequency);

    const output = { allCandidates, noNodeLemma: false };
    expressionCache.current.set(cacheKey, output);
    return output;
  }, [speeches, corpusScope, selectedPlayTitle, expressionScope, nodeLemma, useStoplist, useLemmas, minExpressionFreq, activeNgramLengths, ngramLengthSetting]);

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

  return (
    <div className="space-y-6">
      <DetailsPanel dataset="SPEECHES ONLY" tokenCol="text_raw (norm)" settings={{ stoplist: useStoplist, lemmas: useLemmas }} ui={ui} />

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
                onClick={() => setExpressionScope("node")}
                className={`flex-1 text-xs font-medium transition-colors ${expressionScope === "node" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                data-testid="button-scope-node"
              >
                Node-centred
              </button>
              <button
                type="button"
                onClick={() => setExpressionScope("corpus")}
                className={`flex-1 text-xs font-medium border-l transition-colors ${expressionScope === "corpus" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                data-testid="button-scope-corpus"
              >
                Corpus-wide
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
            />
          </>
        )}
      </section>

      <section className="space-y-3" data-testid="section-expression-patterning">
        <div>
          <h3 className="text-sm font-bold">B. Expression Patterning</h3>
          <p className="text-xs text-muted-foreground">Examines how recurrent expressions are structured, varied, and grouped.</p>
        </div>
        <Card className="shadow-none border-muted/60 border-dashed">
          <CardContent className="pt-6 text-xs text-muted-foreground">
            Collocation and phrase-patterning outputs will appear here.
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" data-testid="section-conventionalisation">
        <div>
          <h3 className="text-sm font-bold">C. Conventionalisation</h3>
          <p className="text-xs text-muted-foreground">Assesses the stability, recurrence, and possible entrenchment of expressions.</p>
        </div>
        <Card className="shadow-none border-muted/60 border-dashed">
          <CardContent className="pt-6 text-xs text-muted-foreground">
            Formulaicity and conventionalisation indicators will appear here.
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" data-testid="section-diachronic-expression-change">
        <div>
          <h3 className="text-sm font-bold">D. Diachronic Expression Change</h3>
          <p className="text-xs text-muted-foreground">Tracks how expressions emerge, persist, diversify, or disappear across time.</p>
        </div>
        <Card className="shadow-none border-muted/60 border-dashed">
          <CardContent className="pt-6 text-xs text-muted-foreground">
            Diachronic expression trends will appear here.
          </CardContent>
        </Card>
      </section>
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
