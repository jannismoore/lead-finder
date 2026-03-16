"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

const SCORE_EXPLANATION =
  "AI-generated lead fit score (0–100).\n80–100: Perfect fit\n60–79: Good fit\n40–59: Moderate fit\n20–39: Low fit\n0–19: Not a fit";

export function ScoreBadge({
  score,
  size = "default",
}: {
  score: number | null | undefined;
  size?: "default" | "lg";
}) {
  const value = score ?? 0;
  const isLg = size === "lg";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`cursor-help gap-1 ${isLg ? "text-lg px-3 py-1" : ""}`}
          >
            Score: {value}
            <Info className={isLg ? "h-3.5 w-3.5" : "h-3 w-3"} />
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
          {SCORE_EXPLANATION}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ScoreBadgeCompact({
  score,
}: {
  score: number | null | undefined;
}) {
  const value = score ?? 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="cursor-help gap-1">
            {value}
            <Info className="h-3 w-3" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
          {SCORE_EXPLANATION}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
