import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Intuit OAuth return point. Intuit sends the user back to this address with
// ?code= and ?state= when the connection step finishes, or ?error= when it
// does not. The QuickBooks connection itself stays pending until the Intuit
// app setup is completed, so this page only reports where things stand: it
// exchanges nothing, stores nothing, and needs no sign-in.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const failed = Boolean(searchParams.get("error"));

  const title = failed
    ? "QuickBooks connection did not complete"
    : "QuickBooks connection is being set up";
  const message = failed
    ? "The QuickBooks connection did not complete. Please go back to the app and try connecting QuickBooks again."
    : "Your QuickBooks connection is being set up. The connection is pending completion of the Intuit app setup, so there is nothing more you need to do right now.";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 34rem; padding: 0 1rem; line-height: 1.5;">
<h1 style="font-size: 1.35rem;">${title}</h1>
<p>${message}</p>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
