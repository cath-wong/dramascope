import { MainLayout } from "@/components/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoplist } from "@/utils/linguistics";
import { FileText, Cpu, Layers, Database, Clock } from "lucide-react";

export default function Docs() {
  const stoplist = Array.from(getStoplist()).sort().join(", ");

  return (
    <MainLayout title="Documentation & Methods">
      <div className="max-w-4xl space-y-8 pb-12">
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Database className="h-5 w-5" />
            <h2 className="text-xl font-bold">Data Sources</h2>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed space-y-3">
              <p>The tool operates on a built-in Shakespeare corpus provided as two CSV files:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><code className="bg-muted px-1 rounded">/public/corpus_lines_real.csv</code>: 101,502 rows (Line-level data)</li>
                <li><code className="bg-muted px-1 rounded">/public/corpus_speeches_real.csv</code>: 31,019 rows (Speech-level data)</li>
              </ul>
              <p>
                The <strong>Corpus Browser</strong> displays raw text as stored in the files, while 
                <strong>Linguistic Analysis</strong> operates on processed tokens derived from the text.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Cpu className="h-5 w-5" />
            <h2 className="text-xl font-bold">Token Processing Pipeline</h2>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed space-y-4">
              <div className="space-y-2">
                <h3 className="font-bold">1. Normalisation</h3>
                <p>Text is converted to lowercase and punctuation is replaced with whitespace (preserving internal apostrophes).</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold">2. Tokenisation</h3>
                <p>Normalised text is split on whitespace into individual units (tokens).</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold">3. Filtering</h3>
                <p>Tokens shorter than 2 characters and purely numeric tokens are removed by default.</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold">4. Stoplist (Optional)</h3>
                <p>High-frequency function words are removed if the toggle is enabled.</p>
                <div className="bg-muted p-3 rounded-md font-mono text-[11px] overflow-auto max-h-24 border">
                  {stoplist}
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold">5. Lemmatisation (Optional)</h3>
                <p>Lightweight regex rules are applied to reduce word variants to a shared lemma (pilot-level):</p>
                <ul className="list-disc pl-5 space-y-1 text-xs opacity-80">
                  <li><code className="bg-muted px-1 rounded">ies → y</code> (e.g., flies → fly)</li>
                  <li><code className="bg-muted px-1 rounded">s → ""</code> (plurals, for length {">"} 3)</li>
                  <li><code className="bg-muted px-1 rounded">ing → ""</code> (present participle, for length {">"} 5)</li>
                  <li><code className="bg-muted px-1 rounded">ed → ""</code> (past tense, for length {">"} 4)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Layers className="h-5 w-5" />
            <h2 className="text-xl font-bold">Analysis Models</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lexical Analysis</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <p>Uses <strong>Lines dataset</strong> only. Operates on <code className="bg-muted px-1 rounded">text_norm</code> column.</p>
                <p>N-grams are computed per row (line) to avoid spanning across dramatic units.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Semantic Analysis</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <p>Uses <strong>Speeches dataset</strong> only. Operates on <code className="bg-muted px-1 rounded">text_raw</code> normalised.</p>
                <p>Association uses PMI (Pointwise Mutual Information) around a target term within a ±10 token window.</p>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Discursive Concepts (Step 8.5 Model)</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-3">
                <p>Uses <strong>Speeches dataset</strong> only.</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Windowing:</strong> Node-centred symmetric window of ±50 tokens around every occurrence of the selected node lemma.</li>
                  <li><strong>Overlaps:</strong> Overlapping windows are allowed and counted independently.</li>
                  <li><strong>Quads:</strong> A "quad" is defined as the node lemma plus the Top 3 co-occurring lemmas within the window, computed per time slice.</li>
                  <li><strong>Drift:</strong> Jaccard stability compares the overlap of the Top-N constellation terms between successive time slices.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Clock className="h-5 w-5" />
            <h2 className="text-xl font-bold">Time Slicing</h2>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed space-y-2">
              <p>Chronology is determined using the following fallback chain for column values:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted/30 p-3 rounded border border-dashed">
                  <span className="font-bold block mb-1">Year Mode</span>
                  <code className="text-xs opacity-70">year_est → year_mid → year_min</code>
                </div>
                <div className="bg-muted/30 p-3 rounded border border-dashed">
                  <span className="font-bold block mb-1">Decade Mode</span>
                  <code className="text-xs opacity-70">decade → decade_num</code>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Rows with missing values are categorised as <strong>"Unknown"</strong> and are excluded from stability/drift calculations by default.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </MainLayout>
  );
}
