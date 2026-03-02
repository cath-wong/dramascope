import React, { useState, useMemo, useRef } from "react";
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
import { Info, Download, Settings2, BarChart3, Table as TableIcon, Search, HelpCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { processTokens, tokenize, normaliseText } from "@/utils/linguistics";
import { exportToCsv } from "@/utils/exportCsv";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";

// --- Sub-components for Guardrails ---

const LexicalTab = () => {
  const { lines } = useData(); // LINES ONLY
  const { corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker } = useUI();
  
  // Cache for computations
  const computationCache = useRef<Map<string, any>>(new Map());

  // Lexical-specific local settings
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
    // 1. Filter scoped lines
    const scopedLines = lines.filter(l => {
      if (corpusScope === "play" && (l.title || l.play_title) !== selectedPlayTitle) return false;
      if (selectedGenre && l.genre !== selectedGenre) return false;
      if (selectedSpeaker && l.speaker !== selectedSpeaker) return false;
      if (lexSettings.excludeStage && (l.unit === "stage" || l.unit === "stage_direction")) return false;
      return true;
    });

    if (!scopedLines.length) return null;

    const cacheKey = JSON.stringify({
      scope: corpusScope,
      title: selectedPlayTitle,
      genre: selectedGenre,
      speaker: selectedSpeaker,
      topN,
      lex: lexSettings
    });

    if (computationCache.current.has(cacheKey)) {
      return computationCache.current.get(cacheKey);
    }

    // 2. Tokenize and count unigrams
    const unigramCounts = new Map<string, number>();
    let totalTokens = 0;

    const verseCounts = new Map<string, number>();
    const proseCounts = new Map<string, number>();
    let verseTotal = 0;
    let proseTotal = 0;

    scopedLines.forEach(l => {
      const text = l.text_norm || "";
      if (!text) return;

      const processed = processTokens(text, { 
        useStoplist: lexSettings.stoplist, 
        useLemmas: lexSettings.lemmatization 
      });
      
      processed.forEach(t => {
        unigramCounts.set(t, (unigramCounts.get(t) || 0) + 1);
        totalTokens++;

        if (lexSettings.compareVerseProse) {
          if (l.unit === "verse_line" || l.unit === "verse") {
            verseCounts.set(t, (verseCounts.get(t) || 0) + 1);
            verseTotal++;
          } else if (l.unit === "prose_chunk" || l.unit === "prose") {
            proseCounts.set(t, (proseCounts.get(t) || 0) + 1);
            proseTotal++;
          }
        }
      });
    });

    if (totalTokens === 0) return { error: "No tokens found. Adjust filters or check if text_norm is populated in corpus_lines_real.csv." };

    // 3. Word frequency results
    const freqList = Array.from(unigramCounts.entries())
      .map(([token, count]) => ({
        token,
        count,
        per_10k: ((count / totalTokens) * 10000).toFixed(2)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);

    // 4. N-grams
    const nSize = parseInt(lexSettings.ngramSize);
    const ngramCounts = new Map<string, number>();
    
    scopedLines.forEach(l => {
      const tokens = processTokens(l.text_norm || "", { 
        useStoplist: lexSettings.stoplist, 
        useLemmas: lexSettings.lemmatization 
      });
      
      for (let i = 0; i <= tokens.length - nSize; i++) {
        const gram = tokens.slice(i, i + nSize).join(" ");
        ngramCounts.set(gram, (ngramCounts.get(gram) || 0) + 1);
      }
    });

    const ngramList = Array.from(ngramCounts.entries())
      .map(([ngram, count]) => ({
        ngram,
        count,
        per_10k: ((count / totalTokens) * 10000).toFixed(2)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);

    // 5. Collocations
    let collocList: any[] = [];
    let collocExamples: Map<string, any[]> = new Map();
    
    if (lexSettings.collocQuery) {
      const qRaw = lexSettings.collocQuery.trim();
      if (qRaw) {
        // Find normalized query token
        const qProcessed = processTokens(qRaw, { useStoplist: false, useLemmas: lexSettings.lemmatization });
        const q = qProcessed.length > 0 ? qProcessed[0] : qRaw.toLowerCase();
        
        const coocCounts = new Map<string, number>();
        const queryFreq = unigramCounts.get(q) || 0;

        if (queryFreq > 0) {
          scopedLines.forEach(l => {
            const tokens = processTokens(l.text_norm || "", { 
              useStoplist: lexSettings.stoplist, 
              useLemmas: lexSettings.lemmatization 
            });
            
            tokens.forEach((t, i) => {
              if (t === q) {
                const start = Math.max(0, i - lexSettings.collocWindow);
                const end = Math.min(tokens.length, i + lexSettings.collocWindow + 1);
                
                for (let j = start; j < end; j++) {
                  if (i === j) continue;
                  const col = tokens[j];
                  coocCounts.set(col, (coocCounts.get(col) || 0) + 1);
                  
                  if (!collocExamples.has(col)) collocExamples.set(col, []);
                  if (collocExamples.get(col)!.length < 5) {
                    collocExamples.get(col)!.push({
                      title: l.title || l.play_title,
                      act: l.act,
                      scene: l.scene,
                      speaker: l.speaker,
                      line_id: l.line_id,
                      text: l.text_norm
                    });
                  }
                }
              }
            });
          });

          collocList = Array.from(coocCounts.entries())
            .map(([collocate, count]) => {
              // PMI Proxy: score = count (pilot) or simple Observed/Expected
              const colFreq = unigramCounts.get(collocate) || 1;
              const score = (count / (queryFreq * colFreq)) * totalTokens; // simplified ratio
              return { collocate, count, score: score.toFixed(2) };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, topN);
        }
      }
    }

    // 6. Verse/Prose
    let vpData: any = null;
    if (lexSettings.compareVerseProse) {
      const vTop = Array.from(verseCounts.entries())
        .map(([token, count]) => ({ token, count, per_10k: verseTotal > 0 ? (count / verseTotal * 10000).toFixed(2) : "0" }))
        .sort((a, b) => Number(b.per_10k) - Number(a.per_10k))
        .slice(0, 10);
      
      vpData = {
        summary: [
          { type: "Verse", tokens: verseTotal, types: verseCounts.size },
          { type: "Prose", tokens: proseTotal, types: proseCounts.size }
        ],
        chart: vTop.map((v) => ({
          name: v.token,
          verse: parseFloat(v.per_10k),
          prose: parseFloat((proseCounts.get(v.token) || 0) / (proseTotal || 1) * 10000).toFixed(2)
        }))
      };
    }

    const output = { freqList, ngramList, collocList, collocExamples, totalTokens, vpData };
    computationCache.current.set(cacheKey, output);
    return output;
  }, [lines, corpusScope, selectedPlayTitle, topN, selectedGenre, selectedSpeaker, lexSettings]);

  if (results?.error) {
    return (
      <Alert variant="destructive" className="my-4">
        <Info className="h-4 w-4" />
        <AlertTitle>Computation Error</AlertTitle>
        <AlertDescription>{results.error}</AlertDescription>
      </Alert>
    );
  }

  const exportFreq = () => exportToCsv("lexical_frequency.csv", results?.freqList || []);
  const exportNgrams = () => exportToCsv(`lexical_ngrams_${lexSettings.ngramSize}.csv`, results?.ngramList || []);
  const exportCollocs = () => exportToCsv("lexical_collocations.csv", results?.collocList || []);
  const exportVP = () => exportToCsv("lexical_verse_prose.csv", results?.vpData?.summary || []);

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-500/10 border-blue-500/20">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertTitle className="text-blue-700 dark:text-blue-400 font-semibold">Dataset: LINES ONLY</AlertTitle>
        <AlertDescription className="text-blue-600 dark:text-blue-300/80">
          Computed from <code className="text-[10px] bg-blue-500/10 px-1 rounded">corpus_lines_real.csv</code> using <code className="text-[10px] bg-blue-500/10 px-1 rounded">text_norm</code>. No speeches data used.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" /> Lexical Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="stoplist" checked={lexSettings.stoplist} onCheckedChange={(v) => setLexSettings(s => ({...s, stoplist: !!v}))} />
                <Label htmlFor="stoplist" className="text-xs cursor-pointer">Apply stoplist</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="lemma" checked={lexSettings.lemmatization} onCheckedChange={(v) => setLexSettings(s => ({...s, lemmatization: !!v}))} />
                <Label htmlFor="lemma" className="text-xs cursor-pointer">Light lemmatisation</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="excludeStage" checked={lexSettings.excludeStage} onCheckedChange={(v) => setLexSettings(s => ({...s, excludeStage: !!v}))} />
                <Label htmlFor="excludeStage" className="text-xs cursor-pointer">Exclude stage directions</Label>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">N-gram Size</Label>
                <Select value={lexSettings.ngramSize} onValueChange={(v) => setLexSettings(s => ({...s, ngramSize: v}))}>
                  <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">Bigrams (2)</SelectItem>
                    <SelectItem value="3">Trigrams (3)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Collocation Query</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input 
                    placeholder="e.g. love" 
                    value={lexSettings.collocQuery} 
                    onChange={(e) => setLexSettings(s => ({...s, collocQuery: e.target.value}))}
                    className="h-9 w-full text-xs pl-8"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Window Size (±)</Label>
                <Input 
                  type="number"
                  value={lexSettings.collocWindow}
                  onChange={(e) => setLexSettings(s => ({...s, collocWindow: parseInt(e.target.value) || 1}))}
                  className="h-9 w-full text-xs"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-dashed">
            <div className="flex items-center space-x-2">
              <Checkbox id="vp" checked={lexSettings.compareVerseProse} onCheckedChange={(v) => setLexSettings(s => ({...s, compareVerseProse: !!v}))} />
              <Label htmlFor="vp" className="text-xs cursor-pointer font-medium text-primary">Compare Verse vs Prose distribution (unit-based)</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Results Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Word Frequencies */}
        <Card className="shadow-none border-muted/60 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-4 bg-muted/5 border-b">
            <div className="space-y-1">
              <CardTitle className="text-sm font-bold tracking-tight">Word Frequencies</CardTitle>
              <CardDescription className="text-[10px]">Top-{topN} tokens ({results?.totalTokens.toLocaleString()} total)</CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={exportFreq} className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={results?.freqList.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                  <XAxis dataKey="token" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid hsl(var(--border))' }} 
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="max-h-[300px] overflow-auto border rounded-md custom-scrollbar">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-12 h-8 text-[10px] font-bold">Rank</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold">Token</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold text-right">Count</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold text-right">Per 10k</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results?.freqList.map((item, i) => (
                    <TableRow key={i} className="h-8 hover:bg-muted/30 border-muted/40">
                      <TableCell className="py-1 text-[10px] text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="py-1 text-[10px] font-medium">{item.token}</TableCell>
                      <TableCell className="py-1 text-[10px] text-right tabular-nums font-semibold">{item.count.toLocaleString()}</TableCell>
                      <TableCell className="py-1 text-[10px] text-right tabular-nums text-muted-foreground/80">{item.per_10k}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* N-Grams */}
        <Card className="shadow-none border-muted/60 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-4 bg-muted/5 border-b">
            <div className="space-y-1">
              <CardTitle className="text-sm font-bold tracking-tight">{lexSettings.ngramSize}-grams</CardTitle>
              <CardDescription className="text-[10px]">Common sequences in filtered set</CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={exportNgrams} className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="max-h-[540px] overflow-auto border rounded-md custom-scrollbar">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-12 h-8 text-[10px] font-bold">Rank</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold">Sequence</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results?.ngramList.map((item, i) => (
                    <TableRow key={i} className="h-8 hover:bg-muted/30 border-muted/40">
                      <TableCell className="py-1 text-[10px] text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="py-1 text-[10px] font-mono">{item.ngram}</TableCell>
                      <TableCell className="py-1 text-[10px] text-right tabular-nums font-semibold">{item.count.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Collocations Section */}
      <Card className="shadow-none border-dashed bg-muted/5">
        <CardHeader className="pb-4 bg-muted/5 border-b border-dashed">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                Collocations for "{lexSettings.collocQuery || '...'}"
              </CardTitle>
              <CardDescription className="text-[10px]">Context window: ±{lexSettings.collocWindow} tokens</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportCollocs} disabled={!results?.collocList.length} className="h-7 text-[10px] gap-1.5">
              <Download className="h-3 w-3" /> Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {!lexSettings.collocQuery ? (
            <div className="py-16 text-center">
              <Search className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-xs text-muted-foreground italic">Enter a query term above to compute collocations.</p>
            </div>
          ) : results?.collocList.length === 0 ? (
            <div className="py-16 text-center">
              <Info className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-xs text-muted-foreground italic">No collocations found for "{lexSettings.collocQuery}".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="border rounded-md max-h-[450px] overflow-auto bg-background custom-scrollbar">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="h-8 text-[10px] font-bold">Collocate</TableHead>
                      <TableHead className="h-8 text-[10px] font-bold text-right">Co-occ</TableHead>
                      <TableHead className="h-8 text-[10px] font-bold text-right">Association</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results?.collocList.map((item, i) => (
                      <TableRow 
                        key={i} 
                        className={`h-8 cursor-pointer transition-colors border-muted/40 ${selectedCollocate === item.collocate ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-primary/5'}`}
                        onClick={() => setSelectedCollocate(item.collocate)}
                      >
                        <TableCell className="py-1 text-[10px] font-medium">{item.collocate}</TableCell>
                        <TableCell className="py-1 text-[10px] text-right tabular-nums font-semibold">{item.count}</TableCell>
                        <TableCell className="py-1 text-[10px] text-right tabular-nums text-muted-foreground/80">{item.score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest px-1 flex items-center justify-between">
                  <span>Traceability: Line Excerpts</span>
                  {selectedCollocate && <Badge variant="secondary" className="h-4 px-1.5 text-[8px]">{results?.collocExamples.get(selectedCollocate)?.length || 0} found</Badge>}
                </h4>
                {selectedCollocate ? (
                  <div className="space-y-2.5 max-h-[400px] overflow-auto pr-2 custom-scrollbar">
                    {results?.collocExamples.get(selectedCollocate)?.map((ex: any, idx: number) => (
                      <div key={idx} className="p-3.5 rounded-lg border bg-background text-[11px] leading-relaxed shadow-sm border-muted/60">
                        <p className="mb-2.5 text-foreground/90 font-serif italic">"...{ex.text}..."</p>
                        <div className="flex items-center gap-3 text-[9px] text-muted-foreground border-t pt-2 opacity-80">
                          <span className="font-bold text-primary/70 uppercase tracking-tight">{ex.title}</span>
                          <span className="border-l pl-2">A{ex.act}:S{ex.scene}</span>
                          <span className="border-l pl-2 font-semibold">{ex.speaker}</span>
                          {ex.line_id && <span className="ml-auto opacity-50">#{ex.line_id}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center border rounded-xl border-dashed bg-muted/5 text-[10px] text-muted-foreground italic min-h-[300px]">
                    <TableIcon className="w-6 h-6 opacity-10 mb-2" />
                    Select a collocate from the table to view source lines
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verse/Prose Section */}
      {lexSettings.compareVerseProse && (
        <Card className="shadow-none border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-bottom-3 duration-500 overflow-hidden">
          <CardHeader className="pb-4 bg-primary/10 border-b border-primary/10 flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-bold text-primary">Verse vs. Prose Distribution</CardTitle>
              <CardDescription className="text-[10px] text-primary/70">Comparing top tokens by genre unit</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={exportVP} className="h-7 w-7 text-primary hover:bg-primary/20"><Download className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            <div className="grid grid-cols-2 gap-6">
              {results?.vpData.summary.map((s: any) => (
                <div key={s.type} className="p-4 rounded-xl border bg-background shadow-sm border-primary/10">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground/70 mb-1.5 tracking-wider">{s.type} Total</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black text-primary tracking-tighter">{s.tokens.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">tokens</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 font-medium">{s.types.toLocaleString()} unique types</p>
                </div>
              ))}
            </div>
            
            <div className="h-[350px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={results?.vpData.chart} margin={{ bottom: 40, left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                  <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={60} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Freq per 10k', angle: -90, position: 'insideLeft', fontSize: 10, offset: -5 }} />
                  <Tooltip 
                    contentStyle={{ fontSize: '11px', borderRadius: '10px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                    cursor={{ fill: 'hsl(var(--primary))', opacity: 0.05 }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                  <Bar dataKey="verse" fill="hsl(var(--primary))" name="Verse" radius={[3, 3, 0, 0]} animationDuration={1200} />
                  <Bar dataKey="prose" fill="hsl(var(--muted-foreground))" name="Prose" radius={[3, 3, 0, 0]} animationDuration={1500} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const SemanticTab = () => {
  const { speeches } = useData(); // SPEECHES ONLY
  const [semSettings, setSemSettings] = useState({
    targetTerm: "",
    measure: "pmi",
    compareSlices: "none"
  });

  return (
    <div className="space-y-6">
      <Alert className="bg-purple-500/10 border-purple-500/20">
        <Info className="h-4 w-4 text-purple-500" />
        <AlertTitle className="text-purple-700 dark:text-purple-400">Dataset: SPEECHES ONLY</AlertTitle>
        <AlertDescription className="text-purple-600 dark:text-purple-300/80">
          Using <code className="text-[10px] bg-purple-500/10 px-1 rounded">corpus_speeches_real.csv</code>. No embeddings used.
        </AlertDescription>
      </Alert>

      <Card className="shadow-none border-muted/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-purple-500" /> Semantic Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Target Term</Label>
            <Input 
              placeholder="e.g. honor" 
              value={semSettings.targetTerm}
              onChange={(e) => setSemSettings(s => ({...s, targetTerm: e.target.value}))}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Association Measure</Label>
            <Select value={semSettings.measure} onValueChange={(v) => setSemSettings(s => ({...s, measure: v}))}>
              <SelectTrigger className="h-9 text-xs bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pmi">PMI (Pointwise Mutual Info)</SelectItem>
                <SelectItem value="log-likelihood">Log-Likelihood</SelectItem>
                <SelectItem value="count">Raw Co-occurrence Count</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Compare Slices</Label>
            <Select value={semSettings.compareSlices} onValueChange={(v) => setSemSettings(s => ({...s, compareSlices: v}))}>
              <SelectTrigger className="h-9 text-xs bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Comparison</SelectItem>
                <SelectItem value="early-late">Early vs Late Career</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[400px] flex flex-col items-center justify-center border-dashed bg-muted/5 shadow-none">
        <BarChart3 className="w-8 h-8 text-muted-foreground/20 mb-2" />
        <p className="text-xs text-muted-foreground italic">Semantic association graph/chart will appear here (Step 7)</p>
      </Card>
      
      <div className="flex justify-end">
        <Button disabled size="sm" className="text-xs gap-2">
          <Download className="w-3.5 h-3.5" />
          Download CSV (Step 7)
        </Button>
      </div>
    </div>
  );
};

const DiscursiveTab = () => {
  const { speeches } = useData(); // SPEECHES ONLY
  const [discSettings, setDiscSettings] = useState({
    nodeLemmas: "lord, father, king",
    tokenSpan: 100,
    topPairs: 20
  });

  return (
    <div className="space-y-6">
      <Alert className="bg-amber-500/10 border-amber-500/20">
        <Info className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-700 dark:text-amber-400">Dataset: SPEECHES ONLY</AlertTitle>
        <AlertDescription className="text-amber-600 dark:text-amber-300/80">
          Using <code className="text-[10px] bg-amber-500/10 px-1 rounded">corpus_speeches_real.csv</code>. Quad/constellation pilot (counts-based).
        </AlertDescription>
      </Alert>

      <Card className="shadow-none border-muted/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-amber-500" /> Discursive Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Node Lemmas</Label>
            <Input 
              value={discSettings.nodeLemmas}
              onChange={(e) => setDiscSettings(s => ({...s, nodeLemmas: e.target.value}))}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Token Span</Label>
            <Input 
              type="number"
              value={discSettings.tokenSpan}
              onChange={(e) => setDiscSettings(s => ({...s, tokenSpan: parseInt(e.target.value) || 0}))}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5 flex flex-col justify-end">
             <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5 tracking-wider">Time Slider</Label>
             <div className="h-9 flex items-center px-3 bg-muted rounded border text-[10px] text-muted-foreground italic">
                (Will activate in Step 8)
             </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[400px] flex flex-col items-center justify-center border-dashed bg-muted/5 shadow-none">
        <BarChart3 className="w-8 h-8 text-muted-foreground/20 mb-2" />
        <p className="text-xs text-muted-foreground italic">Discursive constellation visualization will appear here (Step 8)</p>
      </Card>
      
      <div className="flex justify-end">
        <Button disabled size="sm" className="text-xs gap-2">
          <Download className="w-3.5 h-3.5" />
          Download CSV (Step 8)
        </Button>
      </div>
    </div>
  );
};

// --- Main Page Component ---

export default function Analysis() {
  const { corpusScope, selectedPlayTitle, timeMode, topN, selectedGenre, selectedSpeaker } = useUI();

  return (
    <MainLayout title="Linguistic Analysis">
      <div className="space-y-6">
        {/* Parameters Summary Box */}
        <Card className="bg-muted/30 border-dashed shadow-none">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-2">
              <HelpCircle className="h-3 w-3" /> Parameters Summary
            </CardTitle>
            <Badge variant="outline" className="text-[9px] h-4 font-normal opacity-60">Step 6 Active</Badge>
          </CardHeader>
          <CardContent className="py-0 px-4 pb-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
              <div className="flex gap-2 items-center">
                <span className="text-muted-foreground">Scope:</span>
                <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px]">{corpusScope === "play" ? `Play: ${selectedPlayTitle}` : "Full Corpus"}</Badge>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-muted-foreground">Time:</span>
                <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px] capitalize">{timeMode}</Badge>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-muted-foreground">Top-N:</span>
                <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px]">{topN}</Badge>
              </div>
              {selectedGenre && (
                <div className="flex gap-2 items-center">
                  <span className="text-muted-foreground">Genre:</span>
                  <Badge variant="outline" className="h-4 px-1.5 py-0 text-[9px]">{selectedGenre}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="lexical" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/50 p-1">
            <TabsTrigger value="lexical" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Lexical</TabsTrigger>
            <TabsTrigger value="semantic" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Semantic</TabsTrigger>
            <TabsTrigger value="discursive" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Discursive Concepts</TabsTrigger>
          </TabsList>

          <TabsContent value="lexical" className="mt-0 focus-visible:outline-none animate-in fade-in duration-300">
            <LexicalTab />
          </TabsContent>
          
          <TabsContent value="semantic" className="mt-0 focus-visible:outline-none animate-in fade-in duration-300">
            <SemanticTab />
          </TabsContent>

          <TabsContent value="discursive" className="mt-0 focus-visible:outline-none animate-in fade-in duration-300">
            <DiscursiveTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
