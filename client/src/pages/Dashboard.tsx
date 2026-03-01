import { MainLayout } from "@/components/MainLayout";

export default function Dashboard() {
  return (
    <MainLayout title="Dashboard">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 rounded-lg border bg-card text-card-foreground shadow-sm flex items-center justify-center italic text-muted-foreground">
          Dashboard metrics placeholder
        </div>
        <div className="h-32 rounded-lg border bg-card text-card-foreground shadow-sm flex items-center justify-center italic text-muted-foreground">
          Recent activity placeholder
        </div>
        <div className="h-32 rounded-lg border bg-card text-card-foreground shadow-sm flex items-center justify-center italic text-muted-foreground">
          Overview placeholder
        </div>
      </div>
    </MainLayout>
  );
}
