import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brand, brandExtended } from "@/lib/brand-colors";

export function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

// Brand color palette for charts
export const COLORS = {
  primary: brand.session,
  secondary: brand.decision,
  accent: brandExtended.dark,
  light: brand.unknown,
  chart: [
    brand.session,
    brand.decision,
    brand.pattern,
    brand.rule,
    brandExtended.purple,
    brand.unknown,
    brandExtended.dark,
    brandExtended.error,
  ],
};
