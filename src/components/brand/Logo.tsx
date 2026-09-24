import { cn } from "@/lib/utils";

/** Wordmark used in the panel chrome. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 28" className={cn("h-5 w-auto", className)} role="img" aria-label="Feed Panel">
      <text
        x="0"
        y="21"
        fill="currentColor"
        fontFamily="inherit"
        fontSize="22"
        fontWeight="700"
        letterSpacing="-0.3"
      >
        Feed Panel
      </text>
    </svg>
  );
}
