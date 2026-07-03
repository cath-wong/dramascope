# Formula.md — Discursive Dashboard v1.0

**Version: Discursive Dashboard v1.0 — Methodologically frozen after completion of Phase IIA.**

This document is the consolidated mathematical reference for every implemented metric in the Discursive Dashboard. Notation is kept consistent with `Method.md`, which provides the narrative explanation for each formula. All symbols denote quantities exactly as computed by the application; no formula here is aspirational or partially implemented.

---

## Notation

- `L` — a lemma (token after tokenisation and, if enabled, lemmatisation).
- `N` — the node lemma selected by the user.
- `W(i)` — the contextual window around the *i*-th occurrence of `N` in a speech's token sequence: `W(i) = tokens[max(0, i−50) .. min(len, i+51))`, i.e. ±50 tokens.
- `C(W)` — the multiset of co-lemma frequencies within window `W`, excluding `N` itself.
- `Top3(W)` — the 3 lemmas with the highest frequency in `C(W)` (undefined / no quad produced if `|C(W)| < 3`).
- `Q` — a quad, identified by its **quad key**: `key(Q) = sort([N, c1, c2, c3]).join("|")` where `{c1, c2, c3} = Top3(W)`.
- `S` — a time slice (year or decade, per the active time mode).
- `freq(Q, S)` — number of window instances in slice `S` whose window produced quad key `key(Q)`.
- `freq(Q) = Σ_S freq(Q, S)` — total frequency of quad `Q` across all slices in scope.
- `slices(Q) = { S : freq(Q, S) > 0 }` — set of time slices in which `Q` occurs.

---

## 1. Quad Definition

For each occurrence index `i` of `N` in a speech:

```
Top3(W(i)) = top 3 lemmas of C(W(i)) by descending frequency,  requires |C(W(i))| ≥ 3
key(Q_i) = sort([N, Top3(W(i))[0], Top3(W(i))[1], Top3(W(i))[2]]).join("|")
```

Each occurrence contributes exactly one increment to `freq(Q_i, S)` for the slice `S` of the current speech (or none, if the window has fewer than 3 distinct co-occurring lemmas).

---

## 2. Constellation

For node lemma `N`, scoped to the corpus or a single play:

```
Quads(N)    = { key(Q) : Q produced by any window of N in scope }         (set of distinct quad keys)
Colemmas(N) = { l : l ∈ C(W(i)) for some occurrence i of N in scope }      (set of distinct co-lemmas)
```

The constellation of `N` is the pair `(Quads(N), Colemmas(N))`. It is a set-based (presence/absence) structure — it does not itself retain frequency; frequency-weighted analysis is performed separately using `freq(Q, S)`.

---

## 3. Co-lemma Pair Graph

Let `terms(Q)` be the co-lemma members of quad `Q` (i.e. `key(Q)` split on `|`, minus `N`), after optionally excluding function words when Content-Words-Only filtering is active.

Pairing count for two co-lemmas `a`, `b`:

```
pair(a,b) = |{ Q ∈ QuadSet : a ∈ terms(Q) ∧ b ∈ terms(Q) }|
```
where `QuadSet` is the current filtered quad set (optionally restricted to Core quads, see §7).

**Graph construction:**

```
Edge(a,b) exists  ⟺  pair(a,b) ≥ 3
```

---

## 4. Subcluster Construction

Let `G = (V, E)` be the undirected graph with `V` = all co-lemmas appearing in `QuadSet`, and `E` as defined in §3.

A **subcluster** is a connected component `K ⊆ V` of `G`, found by depth-first search:

```
Subclusters(QuadSet) = ConnectedComponents(G)
```

For each subcluster `K`:

```
edges(K) = |{ (a,b) ∈ E : a ∈ K ∧ b ∈ K }|
```

Subclusters are ranked by `(|K| desc, edges(K) desc)`. Two thresholds on `|K|` are used downstream:

- `|K| ≥ 3` → eligible for display as a "Cluster" panel.
- `|K| ≥ 2` → eligible as a "valid subcluster" for quad-participation mapping (§6).

**Configuration classification:**

```
largest = max{ |K| : K a displayed subcluster (|K| ≥ 3) }
total   = Σ |K|  over all displayed subclusters
Configuration =  Centralised   if total > 0 and largest / total > 0.5
              =  Distributed   otherwise
              =  "(no clusters)" if no subclusters exist
```

---

## 5. Structural Density and Backbone Score

Let `QuadSet = {Q_1, …, Q_n}` be the current (Core/Peripheral-classified) quad list. Define a link between two quads if they share at least one co-lemma:

```
Linked(Q_i, Q_j)  ⟺  terms(Q_i) ∩ terms(Q_j) ≠ ∅       (i ≠ j)
linkCount(Q_i) = |{ j ≠ i : Linked(Q_i, Q_j) }|
```

**Structural Density** of the constellation:

```
StructuralDensity = ( Σ_{i=1}^{n} linkCount(Q_i) ) / n
```

**Backbone Score** (per-quad boolean flag):

```
meanLinks = ( Σ_{i=1}^{n} linkCount(Q_i) ) / n
Backbone(Q_i) = true   if linkCount(Q_i) ≥ meanLinks
              = false  otherwise
```

---

## 6. Quad Participation (Configuration ↔ Concept Behaviour link)

Let `ValidSubclusters = { K : K ∈ Subclusters, |K| ≥ 2 }`, and for a co-lemma `t`, let `subclusters(t) = { idx(K) : t ∈ K, K ∈ ValidSubclusters }`.

For quad `Q` with co-lemma terms `terms(Q)` (after optional Content-Words-Only filtering):

```
Touched(Q)  = ⋃_{t ∈ terms(Q)} subclusters(t)
Unmapped(Q) = { t ∈ terms(Q) : subclusters(t) = ∅ }

ParticipationType(Q) =
    Cross-subcluster    if |Touched(Q)| ≥ 2
    Fringe              if |Touched(Q)| = 1  ∧  |Unmapped(Q)| ≥ 1
    Intra-subcluster    otherwise (default)
    Unclassified        if ValidSubclusters = ∅ (no clustering possible at all)
```

---

## 7. Core / Mid-zone / Peripheral (Temporal Persistence)

For quad `Q`:

```
Core        if freq(Q) > 1  ∧  |slices(Q)| ≥ 2
Peripheral  if freq(Q) = 1  ∧  |slices(Q)| = 1
Mid-zone    otherwise
```

---

## 8. Temporal Behaviour Labels (Emergence / Persistence Typology)

Let the corpus's active time slices have numeric values with:

```
corpusStart = min(sliceValues)
corpusEnd   = max(sliceValues)
corpusSpan  = corpusEnd − corpusStart
earlyBoundary = corpusStart + corpusSpan / 3
lateBoundary  = corpusStart + 2·corpusSpan / 3
```

For quad `Q` with `firstYear = min(slices(Q))`, `lastYear = max(slices(Q))`, `spanYears = lastYear − firstYear`, `relativeSpan = spanYears / corpusSpan` (0 if `corpusSpan = 0`), and `n = |slices(Q)|`:

```
TemporalBehaviour(Q) =
    Transient     if n = 1  ∨  (n ≤ 2 ∧ relativeSpan < 0.25)
    Persistent    else if n ≥ 3 ∧ relativeSpan ≥ 0.5
    Sporadic      else if n = 2 ∧ relativeSpan ≥ 0.4
    Early-bound   else if n ≥ 2 ∧ firstYear ≤ earlyBoundary ∧ lastYear < lateBoundary
    Emergent      else if n ≥ 2 ∧ lastYear ≥ lateBoundary ∧ firstYear > earlyBoundary
    Transient     (fallback, all other cases)
```

Rules are evaluated top-to-bottom; the first matching rule applies.

---

## 9. Diachronic Stability (Jaccard, Consecutive Slices)

Let the sorted time slices be `S_1, S_2, …, S_m`. For slice `S_t` (`t > 1`), let `TopN(S_t)` be the set of the `N` most frequent quad keys in slice `S_t` (`N` = user-selected Top-N setting):

```
Jaccard(S_t) = | TopN(S_t) ∩ TopN(S_{t−1}) | / | TopN(S_t) ∪ TopN(S_{t−1}) |
```

`Jaccard(S_1)` is undefined and reported as `0` (no preceding slice exists).

---

## 10. Constellation Similarity (Cross-Node Jaccard)

For two node lemmas `A`, `B`, using their constellation quad-key sets `Quads(A)`, `Quads(B)` (§2):

```
Similarity(A,B) = ( | Quads(A) ∩ Quads(B) | / | Quads(A) ∪ Quads(B) | ) × 100          (A ≠ B)
Similarity(A,A) = 100                                                                   (by convention)
```

The full matrix `Similarity(A_i, A_j)` over all selected node lemmas is the **Constellation Similarity Matrix**, rounded to 1 decimal place.

---

## 11. Diachronic Change / Presence Type

Let `slices = S_1 … S_m` (all corpus time slices, in order), and `active(S)` = true if the node lemma's Temporal Concept Flow data (top-20 quads by total frequency) has non-zero combined frequency in slice `S`. Let `firstHalf = S_1 … S_{⌊m/2⌋}`.

```
PresenceType =
    Continuous    if active(S) for all S ∈ slices
    Emerging      else if ¬(∃ S ∈ firstHalf : active(S))  ∧  (∃ S ∈ slices : active(S))
    Intermittent  otherwise

ChangeSuggestion =
    "stability"    if PresenceType = Continuous
    "expansion"    if PresenceType = Emerging
    "fluctuation"  if PresenceType = Intermittent
```

---

## 12. Structural Density Descriptor (Constellation Snapshot)

For the Sankey graph of a node lemma with `n` = node count, `l` = link count:

```
DensityLabel =
    "dense"      if l > n
    "moderate"   if l = n
    "sparse"     if l < n
```

---

## 13. Dominant Behaviour Descriptor (Concept Behaviour Summary)

Given the participation counts from §6 across all quads of a constellation (`total`, `cross`, `fringe`):

```
fringeRatio = fringe / total
DominantBehaviour =
    "fringe-dominated"  if fringeRatio > 0.6
    "expanding"         if fringeRatio > 0.3
    "stable"            otherwise
```

---

## Cross-Reference to Method.md

| Formula | Method.md section |
|---|---|
| Quad definition (§1) | §2 Quad Extraction |
| Constellation (§2) | §3 Constellation Construction |
| Co-lemma pair graph (§3) | §4.2 Co-lemma Pairings |
| Subcluster construction (§4) | §4.3 Subcluster Detection, §4.4 Configuration Summary |
| Structural density / backbone (§5) | §5.3–5.4 |
| Participation (§6) | §5.1 Quad Participation Types |
| Core/Mid-zone/Peripheral (§7) | §5.2 |
| Temporal persistence/emergence (§8) | §5.5 Temporal Behaviour Labels |
| Diachronic stability / Jaccard (§9) | §6.3 |
| Similarity (§10) | §6.5 Constellation Similarity |
| Presence type / diachronic change (§11) | §6.4 |
| Density descriptor (§12), dominant behaviour (§13) | §7.1 Interpretation Summaries |
