import Link from "next/link";
import { CircleQuestionMark } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Topbar entry to the functional user guide (Jira's « ? » help icon). */
export function HelpLink() {
  return (
    <Button variant="ghost" size="icon" asChild>
      <Link href="/aide" aria-label="Aide" title="Aide — guide d’utilisation">
        <CircleQuestionMark className="size-4" aria-hidden="true" />
      </Link>
    </Button>
  );
}
