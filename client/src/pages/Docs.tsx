import { MainLayout } from "@/components/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoplist } from "@/utils/linguistics";
import { FileText, Cpu, Layers, Database, Clock, BookOpen } from "lucide-react";

export default function Docs() {
  const stoplist = Array.from(getStoplist()).sort().join(", ");

  return (
    <MainLayout title="Documentation & Methods">
      <div className="max-w-4xl space-y-8 pb-12">
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Database className="h-5 w-5" />
            <h2 className="text-xl font-bold">1. Corpus & Scope</h2>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed space-y-3">
              <p>DramaScope v1.1 covers an early modern drama corpus of <strong>8 playwrights</strong> and <strong>116 plays</strong> spanning the period <strong>1585–1638</strong>.</p>
              <div className="flex flex-wrap gap-2 py-2">
                {["William Shakespeare", "Christopher Marlowe", "Thomas Kyd", "Ben Jonson", "Thomas Middleton", "John Webster", "Philip Massinger", "John Ford"].map(pw => (
                  <span key={pw} className="px-2 py-1 bg-muted rounded text-xs font-medium">{pw}</span>
                ))}
              </div>
              <p>The corpus is represented at two analytical granularities:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Line-level data (280,546 lines):</strong> Used for Lexical Analysis to ensure that counts and n-grams respect dramatic and structural line boundaries.</li>
                <li><strong>Speech-level data (96,514 speeches):</strong> Used for Semantic and Discursive Analysis to track conceptual development and co-occurrence across continuous blocks of dialogue.</li>
              </ul>
              <p className="text-xs text-muted-foreground pt-2">The Corpus Browser is available as an evidence and exploration interface, displaying raw text as stored in the underlying datasets.</p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Cpu className="h-5 w-5" />
            <h2 className="text-xl font-bold">2. Linguistic Processing</h2>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed space-y-4">
              <p>All analytical models share a foundational linguistic pipeline consisting of case normalisation, tokenisation, historical spelling normalisation, length/numeric filtering, and optional function-word filtering or lightweight lemmatisation.</p>
              <p className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground">Note: The exact data path differs by analytical model. Lexical Analysis tokenises from the <code>text_norm</code> field, whereas Semantic and Discursive Analysis tokenise from the <code>text_raw</code> field.</p>
              
              <div className="space-y-2 pt-2">
                <h3 className="font-bold text-primary">Historical Spelling Normalisation</h3>
                <p>DramaScope deterministically normalises historically variant forms only where the mapping to an analytical form is context-independent and sufficiently secure. Ambiguous forms are retained rather than forcibly modernised. Frequency informs priority and analytical impact, but does not determine whether an otherwise certain mapping is valid.</p>
                <p>Representative examples include:</p>
                <ul className="list-disc pl-5 space-y-1 text-xs opacity-80">
                  <li><code className="bg-muted px-1 rounded">haue → have</code></li>
                  <li><code className="bg-muted px-1 rounded">loue → love</code></li>
                  <li><code className="bg-muted px-1 rounded">vpon → upon</code></li>
                  <li><code className="bg-muted px-1 rounded">hee → he</code></li>
                  <li><code className="bg-muted px-1 rounded">speake → speak</code></li>
                </ul>
                <p>Ambiguous forms such as <em>bee</em> are deliberately retained where automatic normalisation would risk conflating distinct lexical meanings. This is analytical normalisation and does not rewrite the underlying corpus.</p>
              </div>
              
              <div className="space-y-2 pt-2">
                <h3 className="font-bold text-primary">Lightweight Lemmatisation</h3>
                <p>When enabled, DramaScope uses a deliberately lightweight and conservative lemmatiser rather than a comprehensive morphological engine. It handles generic suffix reductions for <code>-ies</code>, final <code>-s</code>, <code>-ing</code>, and <code>-ed</code>, but explicit safeguards prevent known false reductions.</p>
                <p>Representative safeguards include:</p>
                <ul className="list-disc pl-5 space-y-1 text-xs opacity-80">
                  <li><em>nothing</em> remains <em>nothing</em> rather than becoming <em>noth</em></li>
                  <li><em>news</em> remains <em>news</em> rather than becoming <em>new</em></li>
                  <li><em>dies → die</em> rather than <em>dy</em></li>
                </ul>
                <p>When a lightweight rule cannot safely reduce a known form, DramaScope favours preserving or explicitly correcting the token rather than manufacturing a malformed lemma.</p>
              </div>

              <div className="space-y-2 pt-2">
                <h3 className="font-bold text-primary">Stoplist (Optional)</h3>
                <p>High-frequency function words are removed if the toggle is enabled.</p>
                <div className="bg-muted p-3 rounded-md font-mono text-[11px] overflow-auto max-h-24 border">
                  {stoplist}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Layers className="h-5 w-5" />
            <h2 className="text-xl font-bold">3. Analysis Models</h2>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 bg-muted/5 border-b">
                <CardTitle className="text-base">Lexical Analysis</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-sm leading-relaxed space-y-3">
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Analytical unit:</strong> Line</li>
                  <li><strong>Source field:</strong> <code>text_norm</code></li>
                </ul>
                <p>Lexical Analysis computes absolute token frequencies and relative frequencies. The denominator dynamically reflects the active Lexical corpus selection.</p>
                <div className="bg-muted/30 p-3 rounded border font-mono text-xs text-center overflow-x-auto">
                  Relative frequency = (token count / total processed tokens) × 10,000
                </div>
                <p>The main analytical outputs include frequency lists, Word Explorer (lemma/surface-form exploration and distribution by play), KWIC concordance, n-grams, collocates, and Playwright Comparison.</p>
                <p><strong>Collocation:</strong> Computed using a symmetric ±5-token window and the LogDice association metric:</p>
                <div className="bg-muted/30 p-3 rounded border font-mono text-xs text-center overflow-x-auto">
                  LogDice = 14 + log2(2 × co-occurrence frequency / (node frequency + collocate frequency))
                </div>
                <p className="text-xs text-muted-foreground mt-2">Playwright Comparison uses the same per-10,000-token normalisation separately for each playwright. "Content Words Only" and "All Words" modes are available to control whether grammatical function words are included in the counts.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 bg-muted/5 border-b">
                <CardTitle className="text-base">Semantic Analysis</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-sm leading-relaxed space-y-4">
                <p><strong>A. Expression Snapshot</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Analytical unit:</strong> Speech</li>
                  <li>Extracts n-grams of lengths 2–5 with a minimum observed frequency of 2.</li>
                  <li>Candidates are ranked by absolute corpus frequency.</li>
                </ul>
                
                <p><strong>B. Expression Families</strong></p>
                <p>Recurring expressions are grouped into families by replacing one token position with a variable slot <code>[X]</code>. Conceptually, expressions like <em>the love of</em>, <em>the death of</em>, and <em>the nature of</em> may contribute to a template such as <code>the [X] of</code> (illustrative example). A family requires at least two unique expressions sharing a pattern, and the most frequent member is designated as the representative expression.</p>
                
                <p><strong>C. Conventionalisation Indicator</strong></p>
                <p>A score ranging from 0 to 100 combining three equally weighted components: relative family frequency, top-member dominance, and average member frequency.</p>
                <div className="bg-muted/30 p-3 rounded border font-mono text-xs text-center overflow-x-auto">
                  Conventionalisation = (frequency component + dominance component + average-frequency component) / 3
                </div>
                <p className="text-xs text-muted-foreground mt-2">The frequency components are normalised relative to maxima in the active dataset. Dominance represents the proportion of the family's total frequency contributed by its most frequent member.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 bg-muted/5 border-b">
                <CardTitle className="text-base">Discursive Analysis</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-sm leading-relaxed space-y-3">
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Analytical unit:</strong> Speech</li>
                  <li><strong>Windowing:</strong> Node-centred symmetric window of ±50 tokens. Repeated occurrences of the node generate independently counted windows.</li>
                  <li><strong>Quads:</strong> Consist of the node lemma plus the three most frequent co-occurring lemmas within the window, ordered deterministically.</li>
                </ul>
                <p>The main analytical outputs include the constellation network, quad inventory, contextual evidence, Core/Peripheral structure, temporal drift, Sankey flow, and quad clustering.</p>
                <p><strong>Core vs Peripheral Status:</strong> Core quads are defined as having a frequency &gt; 1 AND being present in at least 2 temporal slices. Peripheral quads have a frequency of 1 AND are present in only 1 temporal slice.</p>
                <p><strong>Temporal Stability (Drift):</strong> Adjacent chronological slices are compared using their top-N quad sets via the Jaccard similarity index:</p>
                <div className="bg-muted/30 p-3 rounded border font-mono text-xs text-center overflow-x-auto">
                  J(A,B) = |A ∩ B| / |A ∪ B|
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Clock className="h-5 w-5" />
            <h2 className="text-xl font-bold">4. Temporal Analysis & Filtering</h2>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed space-y-4">
              <p>DramaScope distinguishes between <strong>Temporal Range Filtering</strong> and <strong>Chronological Slicing</strong>.</p>
              <p>Global controls for Playwright selection, Play selection, and Temporal Range affect the analytical corpus dynamically across Lexical, Semantic, and Discursive analyses.</p>
              <p>Semantic and Discursive analyses explicitly construct chronological year/decade slices for longitudinal analysis (e.g. drift and stability trajectories). Lexical Analysis respects the temporal range selection but is not inherently time-sliced.</p>
              <p className="border-l-4 border-muted pl-4 italic text-xs text-muted-foreground">Note: Genre, Speaker, and Stage-direction exclusion controls are Lexical-specific in the v1.1 implementation. "Content Words Only" and "All Words" controls apply only where designated.</p>
              <div className="mt-4">
                <h3 className="font-bold mb-2">Chronological Fallback Logic</h3>
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
                  Rows with missing values are categorised as "Unknown" and are explicitly excluded from chronological trajectories.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <BookOpen className="h-5 w-5" />
            <h2 className="text-xl font-bold">5. Corpus Composition & Interpretation</h2>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed space-y-3">
              <p>The eight playwright corpora within DramaScope are unequal in size. While raw token counts are useful when exploring within a single selected corpus or play, any cross-playwright comparison must rely on normalised frequency.</p>
              <p>DramaScope reports relative frequencies per 10,000 processed tokens for Playwright Comparison to account for these proportional differences.</p>
              <div className="space-y-2 pt-2 border-t mt-4">
                <h3 className="font-bold text-primary">Source Evidence vs Analytical Representation</h3>
                <p>DramaScope maintains a clear methodological boundary between textual evidence and analytical representations.</p>
                <p>Historical spelling normalisation operates exclusively on the analytical token representations—the underlying corpus text is not rewritten. Textual evidence remains available in its corpus-derived form for inspection. While analytical counts may consolidate secure historical variants under a shared form, evidence interfaces (such as the KWIC concordance) present the original textual form for matched nodes in context.</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </MainLayout>
  );
}
