import React, { useState } from "react";
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
import { Info, Download, Settings2, BarChart3, Table as TableIcon } from "lucide-react";

// --- Sub-components for Guardrails ---

const LexicalTab = () => {
  const { lines } = useData(); // LINES ONLY
  const [lexSettings, setLexSettings] = useState({
    stoplist: true,
    lemmatization: false,
    ngramSize: "1",
    collocQuery: "",
    collocWindow: 5,
    excludeStage: true
  });

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-500/10 border-blue-500/20">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertTitle className="text-blue-700 dark:text-blue-400">Dataset: LINES ONLY</AlertTitle>
        <AlertDescription className="text-blue-600 dark:text-blue-300/80">
          Using <code className="text-[10px] bg-blue-500/10 px-1 rounded">corpus_lines_real.csv</code>. Tokenisation uses <code className="text-[10px] bg-blue-500/10 px-1 rounded">text_norm</code>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Lexical Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox id="stoplist" checked={lexSettings.stoplist} onCheckedChange={(v) => setLexSettings(s => ({...s, stoplist: !!v}))} />
              <Label htmlFor="stoplist" className="text-xs cursor-pointer">Apply stoplist</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="lemma" checked={lexSettings.lemmatization} onCheckedChange={(v) => setLexSettings(s => ({...s, lemmatization: !!v}))} />
              <Label htmlFor="lemma" className="text-xs cursor-pointer">Light lemmatisation</Label>
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">N-gram Size</Label>
              <Select value={lexSettings.ngramSize} onValueChange={(v) => setLexSettings(s => ({...s, ngramSize: v}))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Unigrams (1)</SelectItem>
                  <SelectItem value="2">Bigrams (2)</SelectItem>
                  <SelectItem value="3">Trigrams (3)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Collocation Query</Label>
              <Input 
                placeholder="e.g. love" 
                value={lexSettings.collocQuery} 
                onChange={(e) => setLexSettings(s => ({...s, collocQuery: e.target.value}))}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="min-h-[300px] flex flex-col items-center justify-center border-dashed bg-muted/5">
          <BarChart3 className="w-8 h-8 text-muted-foreground/20 mb-2" />
          <p className="text-xs text-muted-foreground italic">Lexical chart will appear here (Step 6)</p>
        </Card>
        <Card className="min-h-[300px] flex flex-col items-center justify-center border-dashed bg-muted/5">
          <TableIcon className="w-8 h-8 text-muted-foreground/20 mb-2" />
          <p className="text-xs text-muted-foreground italic">Frequency table will appear here (Step 6)</p>
        </Card>
      </div>
      
      <div className="flex justify-end">
        <Button disabled size="sm" className="text-xs gap-2">
          <Download className="w-3.5 h-3.5" />
          Download CSV (Step 6)
        </Button>
      </div>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Semantic Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Target Term</Label>
            <Input 
              placeholder="e.g. honor" 
              value={semSettings.targetTerm}
              onChange={(e) => setSemSettings(s => ({...s, targetTerm: e.target.value}))}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Association Measure</Label>
            <Select value={semSettings.measure} onValueChange={(v) => setSemSettings(s => ({...s, measure: v}))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pmi">PMI (Pointwise Mutual Info)</SelectItem>
                <SelectItem value="log-likelihood">Log-Likelihood</SelectItem>
                <SelectItem value="count">Raw Co-occurrence Count</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Compare Slices</Label>
            <Select value={semSettings.compareSlices} onValueChange={(v) => setSemSettings(s => ({...s, compareSlices: v}))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Comparison</SelectItem>
                <SelectItem value="early-late">Early vs Late Career</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[400px] flex flex-col items-center justify-center border-dashed bg-muted/5">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Discursive Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Node Lemmas</Label>
            <Input 
              value={discSettings.nodeLemmas}
              onChange={(e) => setDiscSettings(s => ({...s, nodeLemmas: e.target.value}))}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Token Span</Label>
            <Input 
              type="number"
              value={discSettings.tokenSpan}
              onChange={(e) => setDiscSettings(s => ({...s, tokenSpan: parseInt(e.target.value) || 0}))}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5 flex flex-col justify-end">
             <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">Time Slider</Label>
             <div className="h-8 flex items-center px-2 bg-muted rounded border text-[10px] text-muted-foreground italic">
                (Will activate in Step 8)
             </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[400px] flex flex-col items-center justify-center border-dashed bg-muted/5">
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
  const { corpusScope, selectedPlayTitle, timeMode, topN, selectedGenre, selectedSpeaker, excludeStageDirections } = useUI();

  return (
    <MainLayout title="Linguistic Analysis">
      <div className="space-y-6">
        {/* Parameters Summary Box */}
        <Card className="bg-muted/30 border-dashed shadow-none">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Parameters Summary</CardTitle>
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
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="lexical">Lexical</TabsTrigger>
            <TabsTrigger value="semantic">Semantic</TabsTrigger>
            <TabsTrigger value="discursive">Discursive Concepts</TabsTrigger>
          </TabsList>

          <TabsContent value="lexical">
            <LexicalTab />
          </TabsContent>
          
          <TabsContent value="semantic">
            <SemanticTab />
          </TabsContent>

          <TabsContent value="discursive">
            <DiscursiveTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
