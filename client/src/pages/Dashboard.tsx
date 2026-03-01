import { useMemo, useRef } from "react";
import { MainLayout } from "@/components/MainLayout";
import { useData } from "@/contexts/DataContext";
import { useUI } from "@/contexts/UIContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, 
  FileText, 
  MessageSquare, 
  Type, 
  Hash,
  BarChart as BarChartIcon
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

export default function Dashboard() {
  const { lines, speeches } = useData();
  const { 
    corpusScope, selectedPlayTitle, timeMode, 
    selectedGenre, excludeStageDirections 
  } = useUI();

  // Cache for stats computation
  const statsCache = useRef<Map<string, any>>(new Map());

  const dashboardData = useMemo(() => {
    const cacheKey = `${corpusScope}-${selectedPlayTitle}-${timeMode}-${selectedGenre}-${excludeStageDirections}`;
    if (statsCache.current.has(cacheKey)) {
      return statsCache.current.get(cacheKey);
    }

    // 1. Filter data based on scope and genre
    const filterFn = (item: any) => {
      if (corpusScope === "play" && (item.title || item.play_title) !== selectedPlayTitle) return false;
      if (selectedGenre && item.genre !== selectedGenre) return false;
      return true;
    };

    const filteredLines = lines.filter(l => {
      if (!filterFn(l)) return false;
      if (excludeStageDirections && l.unit === "stage") return false;
      return true;
    });
    
    const filteredSpeeches = speeches.filter(filterFn);

    // 2. Compute KPIs
    const uniquePlays = new Set(filteredLines.map(l => l.title || l.play_title).filter(Boolean));
    
    // Tokenization helper
    const tokenize = (text: string) => {
      if (!text) return [];
      return text.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
    };

    let lineTokens = 0;
    let lineTypesSet = new Set<string>();
    filteredLines.forEach(l => {
      const tokens = tokenize(l.text_norm || l.text_raw || "");
      lineTokens += tokens.length;
      tokens.forEach(t => lineTypesSet.add(t));
    });

    let speechTokens = 0;
    let speechTypesSet = new Set<string>();
    filteredSpeeches.forEach(s => {
      const tokens = tokenize(s.text_raw || s.text_norm || "");
      speechTokens += tokens.length;
      tokens.forEach(t => speechTypesSet.add(t));
    });

    const lineTTR = lineTokens > 0 ? (lineTypesSet.size / lineTokens).toFixed(3) : "0.000";
    const speechTTR = speechTokens > 0 ? (speechTypesSet.size / speechTokens).toFixed(3) : "0.000";

    // 3. Chart Data: Plays by time slice
    const timeMap = new Map<string, Set<string>>();
    filteredLines.forEach(l => {
      let timeValue = "Unknown";
      if (timeMode === "year") {
        timeValue = String(l.year_est || l.year_mid || l.year_min || "Unknown");
      } else {
        timeValue = String(l.decade || l.decade_num || "Unknown");
      }
      
      if (!timeMap.has(timeValue)) timeMap.set(timeValue, new Set());
      timeMap.get(timeValue)?.add(l.title || l.play_title);
    });

    const chartData = Array.from(timeMap.entries())
      .map(([time, plays]) => ({
        time,
        count: plays.size
      }))
      .sort((a, b) => {
        if (a.time === "Unknown") return 1;
        if (b.time === "Unknown") return -1;
        return a.time.localeCompare(b.time, undefined, { numeric: true });
      });

    const result = {
      kpis: [
        { label: "Plays Included", value: uniquePlays.size, icon: Users },
        { label: "Total Lines", value: filteredLines.length.toLocaleString(), icon: FileText },
        { label: "Total Speeches", value: filteredSpeeches.length.toLocaleString(), icon: MessageSquare },
        { label: "Tokens (Lines)", value: lineTokens.toLocaleString(), icon: Hash },
        { label: "TTR (Lines)", value: lineTTR, icon: Type },
        { label: "TTR (Speeches)", value: speechTTR, icon: Type },
      ],
      chartData
    };

    statsCache.current.set(cacheKey, result);
    return result;
  }, [lines, speeches, corpusScope, selectedPlayTitle, timeMode, selectedGenre, excludeStageDirections]);

  return (
    <MainLayout title="Dashboard">
      <div className="space-y-6">
        {/* KPI Grid */}
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

        {/* Visualisation Section */}
        <Card className="col-span-4 shadow-sm">
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
                <XAxis 
                  dataKey="time" 
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  contentStyle={{ 
                    borderRadius: '8px', 
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'hsl(var(--card))',
                    fontSize: '12px'
                  }}
                  itemStyle={{ color: 'hsl(var(--primary))' }}
                />
                <Bar 
                  dataKey="count" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]} 
                  name="Unique Plays"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
