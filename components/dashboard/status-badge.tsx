import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: "WIN" | "LOSE" | "UNKNOWN" }) {
  if (status === "WIN") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        WIN
      </Badge>
    );
  }

  if (status === "LOSE") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        LOSE
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <HelpCircle className="h-3 w-3" />
      UNKNOWN
    </Badge>
  );
}
