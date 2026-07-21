---
name: Semantic tab performance optimisation
description: How corpus-wide tokenisation was deduplicated across Semantic tab sections in Analysis.tsx
---

## Rule
The `expressionResults` useMemo in `SemanticTab` is the single authoritative corpus tokenisation pass. All downstream sections must derive from it — never re-tokenise the corpus independently.

## Why
`DiachronicExpressionPanel` had its own `candidateRows` useMemo that independently called `processTokens()` on every speech with the same parameters as `expressionResults`. Sections B/C/D all had `defaultOpen={true}`, causing `ExpressionFamilyPanel`, `ConventionalisationPanel`, and `DiachronicExpressionPanel` to compute on mount. Each of those panels also had a `useEffect` that auto-selected their first row, triggering `CorpusEvidencePanel.evidenceData` — another full corpus scan per panel. Result: 4+ full corpus scans on switching to corpus-wide scope.

## How to apply
1. `expressionResults` collects `sliceFreqMap` (expression → slice → count) and `allSlices` in the same speech loop. Add `timeMode` to its deps and cache key.
2. `diacCandidateRows` and `diacAllSlices` are derived useMemos in `SemanticTab` from `expressionResults` — passed as `precomputedCandidateRows` / `precomputedAllSlices` props to `DiachronicExpressionPanel`. The panel short-circuits its own computation when these props are provided.
3. Auto-select `useEffect` in `ExpressionFamilyPanel`, `ConventionalisationPanel`, and `DiachronicExpressionPanel`: changed from "auto-select first row" to "only clear if current selection no longer exists". This prevents `CorpusEvidencePanel` from scanning automatically.
4. Sections B, C, D changed to `defaultOpen={false}` to defer computation until opened.
5. `useTransition` wraps `setExpressionScope` so the UI stays responsive during the corpus scan; the button shows "Computing…" while pending.
6. Explicit type casts needed when destructuring from `expressionResults` because the cache (`useRef<Map<string,any>>`) causes TypeScript to lose type info: cast `sliceFreqMap`, `allSlices`, and `allCandidates` explicitly.
