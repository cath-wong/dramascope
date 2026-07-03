# Method.md — Discursive Dashboard v1.0

## Version Lock

**Discursive Dashboard v1.0**
**Status: Methodologically frozen after completion of Phase IIA.**

This document describes the final, implemented methodology of the Discursive Dashboard as it exists at the end of Phase IIA. All thresholds, window sizes, and classification rules described below are the exact values used by the application; none are illustrative or provisional.

Future work on this project must **not** alter the analytical methodology described here. Permitted future changes are limited to:

- bug fixes that restore conformance with this document,
- UI/UX improvements that do not change computed values,
- support for additional corpora (using the same methodology).

Any change to windowing, thresholds, classification rules, or formulas constitutes a new analytical version and must be documented as such (e.g. v1.1, v2.0), with this document updated accordingly and the prior version preserved for reproducibility of earlier results.

This document, together with `Formula.md`, is sufficient to reproduce every number shown in the Discursive tab of the dashboard without consulting the application source code.

---

## 1. Corpus Preprocessing

The Discursive tab operates on the **Speeches dataset** (one row per speech, with a raw text field, and metadata: play title, act, scene, speaker, and a chronological indicator).

### 1.1 Tokenisation

Each speech's raw text is tokenised as follows:

1. Convert to lowercase.
2. Replace every character that is not a word character or an apostrophe with a space (this strips punctuation while preserving contractions/possessives such as `thou'lt`).
3. Collapse repeated whitespace and trim.
4. Split on whitespace to obtain a token list.
5. Discard empty strings and any token shorter than 2 characters.

### 1.2 Lemmatisation (optional, user-toggleable)

When lemmatisation is enabled, a lightweight, rule-based lemmatiser is applied to every token longer than 3 characters, in this order:

1. If the token ends in `ies`, replace with `y` (e.g. *flies* → *fly*).
2. Else, if the token ends in `s` but not `ss` or `us`, strip the trailing `s` (plural stripping).
3. Else, if the token ends in `ing` and the token is longer than 5 characters, strip `ing`.
4. Else, if the token ends in `ed` and the token is longer than 4 characters, strip `ed`.

Tokens of length ≤ 3 are left unchanged. This is a pilot-level, regex-based lemmatiser — it is not a full morphological analyser and does not use a lexicon or part-of-speech information.

### 1.3 Stopword Handling (optional, user-toggleable)

An independent "stoplist" toggle removes a fixed set of 30 high-frequency function words from the token stream before any further analysis:

`and, the, to, of, i, a, it, is, in, that, you, not, for, with, be, me, thou, thee, thy, thine, hath, doth, shall, art, hast, come, do, go, st, re`

This stoplist is applied uniformly across Lexical, Semantic, and Discursive analyses when enabled, and is independent of the discursive stoplist described below.

### 1.4 Discursive Stoplist ("Function Words")

Independently of the general stopword toggle, the Discursive tab maintains its own fixed function-word set (approximately 80 items), used specifically for the **Content Words Only** filter (§1.5). It includes:

- pronouns (e.g. `he`, `she`, `they`, `we`),
- determiners (e.g. `this`, `that`, `these`, `those`),
- prepositions (e.g. `into`, `onto`, `upon`, `unto`),
- forms of address and stage/dramaturgical terms specific to the corpus (e.g. `sir`, `madam`, `enter`, `exit`, `exeunt`, `aside`, `tis`),
- and other closed-class function words.

This list is fixed for v1.0 and is not user-editable.

### 1.5 Content Words Only Filtering

When the "Content Words Only" toggle is enabled, any quad (see §2) is excluded from a given display or export if **any** of its constituent lemmas (node lemma and all co-lemmas) appears in the discursive stoplist (§1.4). Formally, a quad is retained only if every one of its member lemmas is absent from the function-word set. This filter is applied consistently across: the Top Quads panel, the Sankey/temporal-flow construction, the Quad Inventory, and all downstream Configuration and Concept Behaviour computations that consume the filtered quad set.

---

## 2. Quad Extraction

### 2.1 Node Lemma

The **node lemma** is the single term selected by the user as the anchor of analysis (after the same tokenisation/lemmatisation/stopword pipeline as the corpus, and case-normalised to lowercase). All quad extraction is centred on this term.

### 2.2 Contextual Window

For every occurrence of the node lemma within a speech's token sequence, a **symmetric window of ±50 tokens** is taken around that occurrence (50 tokens before, 50 tokens after, clipped to the bounds of the speech). Windows are computed independently for every occurrence of the node lemma; if the node lemma occurs multiple times in the same speech, each occurrence produces its own window, and overlapping windows are permitted and counted independently (no de-duplication across occurrences).

### 2.3 Co-lemma Selection

Within each window, every token other than the node lemma itself is counted by frequency. The co-lemmas are the **top 3 most frequent tokens in that window** (ties are broken by natural map/array iteration order, i.e. first-encountered-highest-frequency). If a window contains fewer than 3 distinct co-occurring tokens, no quad is produced for that occurrence.

### 2.4 Quad Construction

A **quad** is the 4-member set consisting of the node lemma plus its 3 selected co-lemmas for one window instance. Its canonical identifier (the **quad key**) is constructed by:

1. Collecting the 4 lemmas (node + 3 co-lemmas) into an array.
2. Sorting the array alphabetically.
3. Joining with the `|` separator.

Because the key is built from the sorted set, two windows that contain the same 4 lemmas — regardless of which position within the window each co-lemma occupied, or the order of frequency — always resolve to the same quad key. The original node/co-1/co-2/co-3 role assignment (based on frequency rank within the window, i.e. L0 = node, L1/L2/L3 = co-lemmas by descending in-window frequency) is retained separately alongside the key for display and Sankey purposes, but is not part of quad identity.

### 2.5 Frequency Counting

Each time a given quad key is produced by a window instance, its frequency counter for the relevant time slice (see §6) is incremented by 1. A quad's total frequency across the corpus (or the selected play, under play scope) is the sum of its per-slice counts. Windows in speeches whose chronological value is "Unknown" (see §6.1) are excluded from quad extraction entirely.

---

## 3. Constellation Construction

A **constellation** for a given node lemma is the aggregate set of all distinct quads (and, separately, all distinct co-lemmas) produced across every occurrence of that node lemma within the selected scope (whole corpus, or a single play) and, where relevant, across all time slices.

- **Node-centred modelling**: every constellation has exactly one anchor, the node lemma (L0). All quads within the constellation share this same anchor. Co-lemmas (L1–L3, per quad) vary from quad to quad, so the constellation as a whole represents the full range of discursive contexts observed around the node lemma.
- **Quads → constellation relationship**: the constellation does not store quad frequency internally when used for cross-node comparison (§6.3) — it stores the quad key set only, i.e. presence/absence of each unique quad type. Frequency-weighted views (e.g. Top Quads, Quad Inventory, Temporal Flow) are derived separately from the same underlying per-slice quad frequency counts (§2.5) but are reported in Concept Behaviour and Diachronic sections, not folded into the constellation identity itself.
- A constellation is therefore best read as: "the full repertoire of 4-term co-occurrence configurations (quads) in which this node lemma has been attested," independent of how often each configuration recurs.

---

## 4. Configuration Analysis

Configuration analysis characterises the internal structure of a node lemma's constellation — i.e. how its co-lemmas group together.

### 4.1 Recurring Co-lemmas

For the currently filtered quad set (optionally restricted to "Core" quads only, see §5.2, and optionally restricted to content words only, see §1.5), every co-lemma (i.e. every quad member other than the node lemma) is counted once per quad it appears in. The result is a frequency-ranked list of co-lemmas recurring across the constellation, truncated to the user-selected display limit (10, 20, or all).

### 4.2 Co-lemma Pairings

For the same filtered quad set, every unordered pair of co-lemmas that co-occurs within the same quad is counted. A pair is identified by sorting its two members alphabetically and joining with `|`. The output is the frequency-ranked list of the top 15 co-lemma pairs.

### 4.3 Subcluster Detection

Subclusters are detected via graph-based connected-component analysis over the co-lemma pairing counts (§4.2):

1. Build an undirected graph whose nodes are co-lemmas.
2. Draw an edge between two co-lemmas if their pairing count (§4.2) is **≥ 3** (i.e. they co-occur together within the same quad in at least 3 distinct quads).
3. Find all connected components of this graph using depth-first search (DFS).
4. Each connected component is a **subcluster**: a set of co-lemma terms, plus the number of internal edges (pairs with count ≥ 3) among them.
5. Subclusters are sorted by descending term count, then by descending edge count.

For downstream display as a "Cluster" panel, only subclusters with **≥ 3 terms** are shown. For quad-participation classification (§5.1), a looser threshold of **≥ 2 terms** is used to define a "valid" subcluster.

### 4.4 Configuration Summary ("Centralised" vs "Distributed")

Let *largest* = the term count of the largest displayed subcluster (≥ 3 terms), and *total* = the sum of term counts across all displayed subclusters. The configuration is classified as:

- **Centralised** if `largest / total > 0.5` (i.e. one subcluster contains more than half of all clustered terms),
- **Distributed** otherwise.

If there are no subclusters, the configuration is reported as "(no clusters)".

---

## 5. Concept Behaviour Analysis

### 5.1 Quad Participation Types

Each quad's co-lemmas are checked against subcluster membership (using the ≥ 2-term subcluster definition from §4.3) to determine how many distinct subclusters the quad's co-lemmas touch, and whether any co-lemma is unmapped (belongs to no subcluster):

- **Cross-subcluster**: the quad's co-lemmas collectively touch **2 or more** distinct subclusters.
- **Fringe**: the quad's co-lemmas touch exactly **1** subcluster, and at least one co-lemma is unmapped (not part of any subcluster).
- **Intra-subcluster**: all of the quad's mapped co-lemmas belong to the same single subcluster (the default classification when neither of the above conditions holds).
- **Unclassified**: assigned only when no subclusters exist at all for the current constellation (no clustering was possible).

Quads are listed sorted first by participation type (Cross-subcluster, then Fringe, then Intra-subcluster, then Unclassified), then by descending frequency.

### 5.2 Core / Mid-zone / Peripheral Classification

Each quad is classified by its aggregate behaviour across time slices:

- **Core**: total frequency > 1 **and** present in ≥ 2 time slices.
- **Peripheral**: total frequency = 1 **and** present in exactly 1 time slice.
- **Mid-zone**: any other combination (e.g. high frequency concentrated in a single slice, or low frequency spread thinly).

### 5.3 Structural Density

For the current quad set, a link is drawn between two quads whenever they share at least one co-lemma. For each quad, its **link count** is the number of other quads it shares at least one co-lemma with. **Structural Density** for the constellation is:

`Structural Density = (sum of all quads' link counts) / (number of quads)`

This is reported as a single summary statistic describing how densely interconnected the constellation's quads are.

### 5.4 Backbone Score

The mean link count across all quads is computed (see §5.3). A quad is flagged as part of the **structural backbone** if its own link count is greater than or equal to this mean. Backbone status is therefore a binary, relative (constellation-specific) measure, not an absolute threshold.

### 5.5 Temporal Behaviour Labels

Temporal behaviour classification uses the corpus's own chronological span. Let `corpusStart`/`corpusEnd` be the minimum/maximum numeric time-slice values observed in the current results, `corpusSpan = corpusEnd − corpusStart`, `earlyBoundary = corpusStart + corpusSpan/3`, and `lateBoundary = corpusStart + 2·corpusSpan/3`. For a given quad with first-seen year `firstYear`, last-seen year `lastYear`, `spanYears = lastYear − firstYear`, `relativeSpan = spanYears / corpusSpan`, and `slicesPresent` slices in which it occurs, the label is assigned in this priority order:

1. **Transient**: `slicesPresent = 1`, OR (`slicesPresent ≤ 2` AND `relativeSpan < 0.25`).
2. **Persistent**: `slicesPresent ≥ 3` AND `relativeSpan ≥ 0.5`.
3. **Sporadic**: `slicesPresent = 2` AND `relativeSpan ≥ 0.4`.
4. **Early-bound**: `slicesPresent ≥ 2` AND `firstYear ≤ earlyBoundary` AND `lastYear < lateBoundary`.
5. **Emergent**: `slicesPresent ≥ 2` AND `lastYear ≥ lateBoundary` AND `firstYear > earlyBoundary`.
6. Otherwise: **Transient** (fallback).

---

## 6. Diachronic Analysis

### 6.1 Time Slices

Each speech is assigned a chronological value using a fallback chain of source columns:

- **Year mode**: `year_est` → `year_mid` → `year_min` (first non-missing value used).
- **Decade mode**: `decade` → `decade_num`.

Speeches for which none of the relevant columns resolve to a usable value are labelled **"Unknown"** and are excluded from all quad extraction and diachronic computations.

### 6.2 Temporal Concept Flow

For the current node lemma, the top 20 quads by total frequency (across all time slices, within scope) are selected. For each of these quads, a row is built recording its total frequency, first-seen slice, last-seen slice, and its per-slice frequency for every time slice in the corpus (0 where absent). This is the "Temporal Concept Flow" table/chart, and also underlies the "Diachronic Change" presence-type summary (§6.4).

### 6.3 Diachronic Stability (Jaccard, consecutive slices)

For each time slice *t* (after the first), the top-N quads by frequency in slice *t* and the top-N quads by frequency in the immediately preceding slice *t−1* are compared (N = the user-selected "Top N" setting). Diachronic stability for slice *t* is the Jaccard index between these two top-N sets:

`Jaccard(t) = |TopN(t) ∩ TopN(t−1)| / |TopN(t) ∪ TopN(t−1)|`

The first slice in the corpus has no defined stability value (there is no preceding slice to compare against) and is reported as 0.

### 6.4 Diachronic Change / Presence Type Summary

Using the Temporal Concept Flow data (§6.2) across all time slices for the node lemma:

- **Continuous**: the node lemma's quads are active (frequency > 0) in every time slice.
- **Emerging**: the node lemma's quads are inactive throughout the first half of the corpus's time slices, but active at some point; i.e. activity is confined to the second half.
- **Intermittent**: any other pattern (activity appears and disappears without matching either of the above).

An accompanying qualitative "change suggestion" is derived directly from presence type: Continuous → "stability", Emerging → "expansion", Intermittent → "fluctuation".

### 6.5 Constellation Similarity (Cross-node comparison)

To compare two or more node lemmas, a constellation (§3, quad-key set only) is computed independently for each. For every pair of node lemmas, similarity is the Jaccard index between their quad-key sets, expressed as a percentage:

`Similarity(A, B) = ( |Quads(A) ∩ Quads(B)| / |Quads(A) ∪ Quads(B)| ) × 100`

A node lemma compared against itself is defined to have similarity 100 by convention (diagonal of the similarity matrix). The full set of pairwise similarities across the selected node lemmas forms the **Constellation Similarity Matrix**.

---

## 7. Paper-Ready Summaries and Export

### 7.1 Interpretation Summaries

Each analytical section (Constellation Snapshot, Configuration Profile, Concept Behaviour, Diachronic Change) generates a rule-based, templated textual summary directly from its own computed statistics (no free-text generation or external model is involved). Examples of the rules applied:

- **Constellation Snapshot**: density label is "dense" if links > nodes, "moderate" if links = nodes, otherwise "sparse" (based on the Sankey graph's node/link counts for the current node lemma).
- **Configuration Profile**: reuses the Centralised/Distributed classification from §4.4, plus the top anchor term (highest-frequency co-lemma) of each of the top 3 subclusters.
- **Concept Behaviour**: reports intra-/cross-/fringe-subcluster ratios (§5.1) and classifies overall dominant behaviour as "fringe-dominated" if the fringe ratio > 0.6, "expanding" if > 0.3, otherwise "stable".
- **Diachronic Change**: reuses the presence type and change suggestion from §6.4.

These summaries are descriptive restatements of already-computed values; they introduce no new calculations of their own.

### 7.2 CSV / Text Export

All tabular analytical outputs (Quad Inventory, Recurring Co-lemmas, Co-lemma Pairings, Subclusters/Cluster Anchors, Quad Participation, Core/Peripheral/Mid-zone classification, Temporal Concept Flow, Constellation Similarity Matrix, Sankey edge list) can be exported as CSV. Export flattens each row object directly into columns (object keys become the header row, in insertion order), with no additional transformation, rounding, or relabelling beyond what is already applied for on-screen display. A combined plain-text summary export concatenates the four rule-based interpretation summaries (§7.1) for the current node lemma into a single downloadable report.

---

## Reproducibility Notes

To reproduce any figure in the Discursive tab from this document alone:

1. Apply preprocessing (§1) to the Speeches dataset with the same toggle settings (stoplist on/off, lemmatisation on/off, content-words-only on/off) as used in the dashboard.
2. Extract quads for the chosen node lemma using the ±50-token window and top-3 co-lemma rule (§2), scoped to either the whole corpus or a single play, and keyed by time slice (§6.1).
3. Aggregate per-slice quad frequencies as needed for the desired view (Top Quads, Quad Inventory, Temporal Flow).
4. Apply the relevant downstream formula from §4–§6 (subcluster detection, structural density, backbone, temporal labels, Jaccard stability, similarity) exactly as specified — see `Formula.md` for the consolidated mathematical notation.

No step in the above requires inspection of the application's source code; all thresholds and rules are fully specified above.
