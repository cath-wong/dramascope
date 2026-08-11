import { useState, useMemo } from "react";
import { MainLayout } from "@/components/MainLayout";
import { useUI } from "@/contexts/UIContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { 
  Users, 
  FileText, 
  MessageSquare, 
  Type, 
  Hash,
  BarChart as BarChartIcon,
  ArrowUpDown,
  Download,
  PieChart,
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { formatTimeValue } from "@/utils/formatTimeValue";
import { exportToCsv } from "@/utils/exportCsv";

type SortKey = "playwright" | "plays" | "lines" | "speeches" | "lineShare" | "speechShare";
type SortDir = "asc" | "desc";

export default function Dashboard() {
  const { 
    corpusScope, selectedPlayTitle, timeMode, 
    selectedGenre, excludeStageDirections,
    selectedLines: lines, selectedSpeeches: speeches,
  } = useUI();

  const [compSort, setCompSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "lines",
    dir: "desc",
  });

  // ── Shared filter predicate (mirrors dashboardData) ──────────────────────
  const filterFn = useMemo(() => (item: any) => {
    if (corpusScope === "play" && (item.title || item.play_title) !== selectedPlayTitle) return false;
    if (selectedGenre && item.genre !== selectedGenre) return false;
    return true;
  }, [corpusScope, selectedPlayTitle, selectedGenre]);

  // ── Existing KPI / chart computation ─────────────────────────────────────
  const dashboardData = useMemo(() => {
    const filteredLines = lines.filter(l => {
      if (!filterFn(l)) return false;
      if (excludeStageDirections && l.unit === "stage") return false;
      return true;
    });
    const filteredSpeeches = speeches.filter(filterFn);

    const uniquePlays = new Set(filteredLines.map(l => l.title || l.play_title).filter(Boolean));
    
    const tokenizeSimple = (text: string) => {
      if (!text) return [];
      return text.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
    };

    let lineTokens = 0;
    let lineTypesSet = new Set<string>();
    filteredLines.forEach(l => {
      const tokens = tokenizeSimple(l.text_norm || l.text_raw || "");
      lineTokens += tokens.length;
      tokens.forEach(t => lineTypesSet.add(t));
    });

    let speechTokens = 0;
    let speechTypesSet = new Set<string>();
    filteredSpeeches.forEach(s => {
      const tokens = tokenizeSimple(s.text_raw || s.text_norm || "");
      speechTokens += tokens.length;
      tokens.forEach(t => speechTypesSet.add(t));
    });

    const lineTTR = lineTokens > 0 ? (lineTypesSet.size / lineTokens).toFixed(3) : "0.000";
    const speechTTR = speechTokens > 0 ? (speechTypesSet.size / speechTokens).toFixed(3) : "0.000";

    const timeMap = new Map<string, Set<string>>();
    filteredLines.forEach(l => {
      const val = timeMode === "year" 
        ? (l.year_est || l.year_mid || l.year_min)
        : (l.decade || l.decade_num);
      const timeValue = formatTimeValue(val);
      if (!timeMap.has(timeValue)) timeMap.set(timeValue, new Set());
      timeMap.get(timeValue)?.add(l.title || l.play_title);
    });

    const chartData = Array.from(timeMap.entries())
      .map(([time, plays]) => ({ time, count: plays.size }))
      .sort((a, b) => {
        if (a.time === "Unknown") return 1;
        if (b.time === "Unknown") return -1;
        return a.time.localeCompare(b.time, undefined, { numeric: true });
      });

    return {
      kpis: [
        { label: "Plays Included", value: uniquePlays.size, icon: Users },
        { label: "Total Lines", value: filteredLines.length.toLocaleString(), icon: FileText },
        { label: "Total Speeches", value: filteredSpeeches.length.toLocaleString(), icon: MessageSquare },
        { label: "Tokens (Lines)", value: lineTokens.toLocaleString(), icon: Hash },
        { label: "TTR (Lines)", value: lineTTR, icon: Type },
        { label: "TTR (Speeches)", value: speechTTR, icon: Type },
      ],
      chartData,
    };
  }, [lines, speeches, filterFn, timeMode, excludeStageDirections]);

  // ── Corpus Composition aggregation ───────────────────────────────────────
  const compositionData = useMemo(() => {
    type Stats = {
      plays: Set<string>;
      lines: number;
      speeches: number;
      minYear: number;
      maxYear: number;
    };

    const byPw = new Map<string, Stats>();
    const ensure = (pw: string) => {
      if (!byPw.has(pw)) byPw.set(pw, { plays: new Set(), lines: 0, speeches: 0, minYear: Infinity, maxYear: -Infinity });
      return byPw.get(pw)!;
    };

    lines.forEach(l => {
      if (!filterFn(l)) return;
      if (excludeStageDirections && l.unit === "stage") return;
      const s = ensure(l.playwright || "Unknown");
      s.lines++;
      if (l.play_id) s.plays.add(l.play_id);
      const y = parseInt(l.year_est);
      if (!isNaN(y)) { if (y < s.minYear) s.minYear = y; if (y > s.maxYear) s.maxYear = y; }
    });

    speeches.forEach(sp => {
      if (!filterFn(sp)) return;
      ensure(sp.playwright || "Unknown").speeches++;
    });

    const totalLines = Array.from(byPw.values()).reduce((a, s) => a + s.lines, 0);
    const totalSpeeches = Array.from(byPw.values()).reduce((a, s) => a + s.speeches, 0);

    const rows = Array.from(byPw.entries()).map(([playwright, s]) => ({
      playwright,
      plays: s.plays.size,
      lines: s.lines,
      speeches: s.speeches,
      lineShare: totalLines > 0 ? (s.lines / totalLines) * 100 : 0,
      speechShare: totalSpeeches > 0 ? (s.speeches / totalSpeeches) * 100 : 0,
      firstYear: isFinite(s.minYear) ? s.minYear : null,
      lastYear: isFinite(s.maxYear) ? s.maxYear : null,
    }));

    return { rows, totalLines, totalSpeeches };
  }, [lines, speeches, filterFn, excludeStageDirections]);

  // ── Sorted composition rows ───────────────────────────────────────────────
  const sortedComposition = useMemo(() => {
    const { key, dir } = compSort;
    return [...compositionData.rows].sort((a, b) => {
      const av = a[key as keyof typeof a] ?? 0;
      const bv = b[key as keyof typeof b] ?? 0;
      if (typeof av === "number" && typeof bv === "number") {
        return dir === "asc" ? av - bv : bv - av;
      }
      return dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [compositionData.rows, compSort]);

  const toggleSort = (key: SortKey) =>
    setCompSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );

  const SortBtn = ({ col }: { col: SortKey }) => (
    <button
      onClick={() => toggleSort(col)}
      className="ml-1 inline-flex items-center opacity-50 hover:opacity-100 transition-opacity"
      aria-label={`Sort by ${col}`}
    >
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  const handleExport = () => {
    exportToCsv(
      "corpus_composition.csv",
      sortedComposition.map(r => ({
        playwright: r.playwright,
        plays: r.plays,
        lines: r.lines,
        speeches: r.speeches,
        line_share_pct: r.lineShare.toFixed(1),
        speech_share_pct: r.speechShare.toFixed(1),
        first_year: r.firstYear ?? "",
        last_year: r.lastYear ?? "",
      }))
    );
  };

  // Proportional bar (capped at 100% of cell width, scaled to max share)
  const maxLineShare = Math.max(...compositionData.rows.map(r => r.lineShare), 1);
  const maxSpeechShare = Math.max(...compositionData.rows.map(r => r.speechShare), 1);

  const ShareBar = ({ value, max }: { value: number; max: number }) => (
    <div className="flex items-center gap-2 justify-end">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden flex-shrink-0">
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      <span className="tabular-nums w-10 text-right">{value.toFixed(1)}%</span>
    </div>
  );

  return (
    <MainLayout title="Dashboard">
      <div className="space-y-6">

        {/* ── KPI cards ── */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dashboardData.kpis.map((kpi, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{kpi.label}</CardTitle>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{kpi.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Corpus Composition ── */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <PieChart className="h-5 w-5 text-primary" />
                Corpus Composition
              </CardTitle>
              <Button variant="outline" size="sm" onClick={handleExport} className="h-7 text-xs gap-1.5">
                <Download className="h-3 w-3" />
                Export CSV
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-2xl">
              Corpus size varies across playwrights. These figures reflect the active playwright and date-range selection.
              Composition should be considered when interpreting raw frequency and distributional results;
              relative-frequency measures are preferable for direct comparison across unequal corpus subsets.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {compositionData.rows.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground">No data for current selection.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="pl-6">
                        Playwright <SortBtn col="playwright" />
                      </TableHead>
                      <TableHead className="text-right">
                        Plays <SortBtn col="plays" />
                      </TableHead>
                      <TableHead className="text-right">
                        Lines <SortBtn col="lines" />
                      </TableHead>
                      <TableHead className="text-right">
                        Speeches <SortBtn col="speeches" />
                      </TableHead>
                      <TableHead className="text-right pr-4">
                        Line&nbsp;Share <SortBtn col="lineShare" />
                      </TableHead>
                      <TableHead className="text-right pr-6">
                        Speech&nbsp;Share <SortBtn col="speechShare" />
                      </TableHead>
                      <TableHead className="text-right pr-6">
                        Period
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedComposition.map((row, i) => (
                      <TableRow key={row.playwright} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                        <TableCell className="pl-6 font-medium text-sm py-2">
                          {row.playwright}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm py-2">
                          {row.plays}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm py-2">
                          {row.lines.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm py-2">
                          {row.speeches.toLocaleString()}
                        </TableCell>
                        <TableCell className="pr-4 py-2">
                          <ShareBar value={row.lineShare} max={maxLineShare} />
                        </TableCell>
                        <TableCell className="pr-6 py-2">
                          <ShareBar value={row.speechShare} max={maxSpeechShare} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground pr-6 py-2">
                          {row.firstYear != null && row.lastYear != null
                            ? row.firstYear === row.lastYear
                              ? String(row.firstYear)
                              : `${row.firstYear}–${row.lastYear}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {/* Totals footer */}
                <div className="border-t px-6 py-2 flex gap-8 text-xs text-muted-foreground">
                  <span><span className="font-medium text-foreground">{compositionData.totalLines.toLocaleString()}</span> total lines</span>
                  <span><span className="font-medium text-foreground">{compositionData.totalSpeeches.toLocaleString()}</span> total speeches</span>
                  <span><span className="font-medium text-foreground">{compositionData.rows.length}</span> playwright{compositionData.rows.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Plays by Time Slice ── */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <BarChartIcon className="h-5 w-5 text-primary" />
              Plays by Time Slice ({timeMode === 'year' ? 'Year' : 'Decade'})
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[400px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboardData.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
                <XAxis dataKey="time" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }} contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', fontSize: '12px' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Unique Plays" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>
    </MainLayout>
  );
}
