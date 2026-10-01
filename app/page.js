"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "../lib/session";
import LandingContent from "../components/LandingContent";

// If you're already signed in, the home page (and the installed app icon)
// takes you straight into the app instead of showing the marketing page.
export default function HomePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (u) router.replace("/app");
      else setChecked(true);
    })();
  }, [router]);

  if (!checked) return null;
  return <LandingContent />;
}
