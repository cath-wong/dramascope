import React, { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, Clipboard, Download, Pin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToCsv } from "@/utils/exportCsv";

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right";
}

interface ResultsTableProps {
  data: any[];
  columns: Column[];
  filename?: string;
  onPin?: (item: any) => void;
  metadata?: any;
  scrollable?: boolean;
}

export function ResultsTable({ data, columns, filename = "results.csv", onPin, metadata, scrollable }: ResultsTableProps) {
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const { toast } = useToast();

  const filteredData = useMemo(() => {
    let processed = [...data];
    if (search) {
      const lowerSearch = search.toLowerCase();
      processed = processed.filter(row => 
        Object.values(row).some(val => String(val).toLowerCase().includes(lowerSearch))
      );
    }
    if (sortConfig) {
      processed.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal);
        const bStr = String(bVal);
        return sortConfig.direction === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    return processed;
  }, [data, search, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "desc" };
    });
  };

  const copyToClipboard = () => {
    const header = columns.map(c => c.label).join("\t");
    const rows = filteredData.map(row => columns.map(c => row[c.key]).join("\t")).join("\n");
    navigator.clipboard.writeText(`${header}\n${rows}`);
    toast({ title: "Copied to clipboard", description: `Copied ${filteredData.length} rows.` });
  };

  const handleExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportFilename = `${filename.replace(".csv", "")}_${timestamp}.csv`;
    const metaRows = metadata ? Object.entries(metadata).map(([k, v]) => `${k},${v}`).join("\n") + "\n\n" : "";
    exportToCsv(exportFilename, filteredData); // Simple version for now
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input 
            placeholder="Search results..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="h-8 text-xs pl-8"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={copyToClipboard} className="h-8 w-8" title="Copy as TSV"><Clipboard className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon" onClick={handleExport} className="h-8 w-8" title="Export CSV"><Download className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className={`rounded-md border bg-background ${scrollable ? "max-h-[450px] overflow-y-auto overflow-x-auto" : "overflow-hidden"}`}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(col => (
                <TableHead key={col.key} className={`h-8 text-[10px] sticky top-0 z-20 bg-muted/95 backdrop-blur ${col.align === "right" ? "text-right" : ""}`}>
                  {col.sortable ? (
                    <button onClick={() => handleSort(col.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {col.label} <ArrowUpDown className="h-2.5 w-2.5" />
                    </button>
                  ) : col.label}
                </TableHead>
              ))}
              {onPin && <TableHead className="w-8 h-8 sticky top-0 z-20 bg-muted/95 backdrop-blur"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((row, i) => (
              <TableRow key={i} className="h-8 group">
                {columns.map(col => (
                  <TableCell key={col.key} className={`py-1 text-[10px] ${col.align === "right" ? "text-right" : ""}`}>
                    {row[col.key]}
                  </TableCell>
                ))}
                {onPin && (
                  <TableCell className="py-1">
                    <Button variant="ghost" size="icon" onClick={() => onPin(row)} className="h-6 w-6 opacity-0 group-hover:opacity-100"><Pin className="h-3 w-3" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="text-[10px] text-muted-foreground px-1">
        Showing {filteredData.length} of {data.length} results
      </div>
    </div>
  );
}
