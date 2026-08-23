import Link from "next/link";
import { cn } from "@/lib/utils";

interface BrandBadgeProps {
  className?: string;
  showText?: boolean;
  href?: string;
}

export function BrandBadge({
  className,
  showText = true,
  href = "/",
}: BrandBadgeProps) {
  const badge = (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-800 text-white text-xs font-bold shrink-0">
        PP
      </div>
      {showText && (
        <span className="text-sm font-semibold tracking-tight text-foreground">
          ParcelPilot
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center">
        {badge}
      </Link>
    );
  }

  return badge;
}
