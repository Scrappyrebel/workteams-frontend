import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Gusto OAuth return point. Gusto sends the user back to this address with
// ?code= and ?state= when the connection step finishes, or ?error= when it
// does not. The payroll connection itself stays pending until Gusto partner
// approval is granted, so this page only reports where things stand: it
// exchanges nothing, stores nothing, and needs no sign-in.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const failed = Boolean(searchParams.get("error"));

  const title = failed
    ? "Gusto connection did not complete"
    : "Gusto connection is being set up";
  const message = failed
    ? "The Gusto connection did not complete. Please go back to the app and try connecting Gusto again."
    : "Your Gusto connection is being set up. The payroll connection is pending partner approval, so there is nothing more you need to do right now.";

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
