import { NextResponse } from "next/server";
import { sendAllConfiguredToBooks } from "../../../../lib/books/send-to-books";

export const dynamic = "force-dynamic";

// Daily sweep: sends the rolling window of invoice payments to Ridgefront
// Accounting for every company the operator configured on the server.
// When books sending is not configured this answers quietly with
// configured:false and sends nothing.
export async function GET(req) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await sendAllConfiguredToBooks();
  return NextResponse.json(summary);
}
