import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-4 w-96 bg-muted/70 rounded" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="h-5 w-48 bg-muted rounded" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-4 w-full bg-muted/60 rounded" />
            <div className="h-4 w-3/4 bg-muted/40 rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ cols = 6, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted/30 p-3 flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-4 bg-muted rounded flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-3 flex gap-4 border-t">
            {Array.from({ length: cols }).map((_, j) => (
              <div key={j} className="h-4 bg-muted/40 rounded flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-5 w-32 bg-muted rounded" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-4 w-full bg-muted/60 rounded" />
        <div className="h-4 w-2/3 bg-muted/40 rounded" />
        <div className="flex justify-between mt-4">
          <div className="h-6 w-20 bg-muted/50 rounded-full" />
          <div className="h-4 w-16 bg-muted/30 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-4 bg-muted rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-7 w-12 bg-muted rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
