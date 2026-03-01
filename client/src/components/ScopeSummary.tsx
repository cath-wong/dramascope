import { useUI } from "@/contexts/UIContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Layers, ListOrdered, Filter, Users } from "lucide-react";

export function ScopeSummary() {
  const { 
    corpusScope, selectedPlayTitle, 
    timeMode, topN, 
    selectedGenre, selectedSpeaker, excludeStageDirections 
  } = useUI();

  return (
    <Card className="bg-muted/30 border-dashed shadow-none">
      <CardContent className="p-3 flex flex-wrap gap-x-6 gap-y-2 items-center text-xs">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Scope:</span>
          <Badge variant="outline" className="bg-background text-[10px] h-5 px-1.5">
            {corpusScope === "full" ? "Full Corpus" : `Play: ${selectedPlayTitle || "None"}`}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Time:</span>
          <Badge variant="outline" className="bg-background text-[10px] h-5 px-1.5 capitalize">{timeMode}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <ListOrdered className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Top-N:</span>
          <Badge variant="outline" className="bg-background text-[10px] h-5 px-1.5">{topN}</Badge>
        </div>

        {(selectedGenre || selectedSpeaker || excludeStageDirections) && (
          <div className="flex items-center gap-2 border-l pl-6">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Filters:</span>
            {selectedGenre && <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{selectedGenre}</Badge>}
            {selectedSpeaker && (
              <div className="flex items-center gap-1">
                <Users className="w-3 h-3 text-muted-foreground" />
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{selectedSpeaker}</Badge>
              </div>
            )}
            {excludeStageDirections && <Badge variant="secondary" className="text-[10px] h-5 px-1.5">No Stage Directions</Badge>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
