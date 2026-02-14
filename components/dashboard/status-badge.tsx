import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: "WIN" | "LOSE" | "UNKNOWN" }) {
  if (status === "WIN") {
    return <Badge variant="success">WIN</Badge>;
  }

  if (status === "LOSE") {
    return <Badge variant="destructive">LOSE</Badge>;
  }

  return <Badge variant="secondary">UNKNOWN</Badge>;
}
