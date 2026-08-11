---
name: Multi-playwright corpus architecture
description: How the four-CSV corpus is loaded, merged, and filtered by playwright selection in Step 45.
---

## Rule
Playwright filtering is centralised in UIContext. All analytical consumers (Analysis, Dashboard, Browser) must use `selectedLines`/`selectedSpeeches` from `useUI()`, not raw `lines`/`speeches` from `useData()`.

**Why:** Applying the playwright filter once in UIContext (via useMemo) avoids duplicating filter logic across Lexical, Semantic, Discursive tabs, Dashboard, and Browser. Changing playwright selection automatically invalidates all dependent useMemos through React's dependency graph — no manual cache key management required.

**How to apply:**
- `DataContext` loads all four CSVs in parallel and exposes merged `lines` (shakespeare + early modern) and `speeches`.
- `UIContext` exposes `selectedLines` and `selectedSpeeches` filtered by `state.selectedPlaywrights`.
- `UIContext` also exposes `availablePlaywrights`, `playwrightKey` (for display/debug), and guard against zero-playwright selection.
- When playwright selection changes and `selectedPlayTitle` is no longer in `availablePlays`, a `useEffect` in UIContext clears `selectedPlayTitle` and `selectedSpeaker`.
- `Sidebar` owns the playwright checkbox UI; uses the canonical `PLAYWRIGHT_DISPLAY` array (surname → full name mapping) with "All playwrights" toggle.

## Row counts (Step 45 baseline)
- Shakespeare lines: 101,502
- Shakespeare speeches: 31,019
- Early Modern lines: 179,044
- Early Modern speeches: 65,495
- Merged lines: 280,546
- Merged speeches: 96,514

## Default
`selectedPlaywrights: ["William Shakespeare"]` — backward compatible with pre-Step-45 outputs.
