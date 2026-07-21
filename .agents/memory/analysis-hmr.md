---
name: Analysis.tsx HMR stack overflow
description: Vite HMR hits Maximum call stack size on very large Analysis.tsx after many sequential hot reloads
---

## Rule
If the browser console shows `RangeError: Maximum call stack size exceeded` at `scheduleFibersWithFamiliesRecursively`, this is a Vite HMR artefact caused by the size of Analysis.tsx (~5200+ lines). It is NOT a production bug.

## Why
Vite's React HMR performs recursive fibre scheduling to update components. After many sequential hot reloads (15+), the recursion depth overflows for very large component files.

## How to apply
Restart the "Start application" workflow. The app loads cleanly on a full page load. This does not affect the production build.
