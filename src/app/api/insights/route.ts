import { NextResponse } from "next/server";
import { deriveInsights } from "@/lib/engines/insights";
import { detectConflicts } from "@/lib/engines/conflict";
import { store } from "@/lib/actions/store";

export async function GET() {
  return NextResponse.json({
    insights: deriveInsights(),
    conflicts: detectConflicts(),
    executed: {
      escalations: store().escalations,
      ticketUpdates: store().ticketUpdates,
      tasks: store().tasks,
    },
  });
}
