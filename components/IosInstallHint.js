"use client";

import { useEffect, useState } from "react";

// iPhone and iPad crew kept getting stranded in the browser with no
// home-screen icon (2026-10-29: an employee's old install died and there was
// no way back in). iOS shows no install prompt, and on iPhones only Safari
// offers "Add to Home Screen" — Chrome and the Google app do not. This slim
// banner says the one route that works, then gets out of the way:
//   - shows ONLY on iOS (iPhone/iPad) in Safari,
//   - never shows once WorkTeams is installed (standalone mode),
//   - once dismissed, stays dismissed on that phone (localStorage).
// It renders in normal page flow at the top — never a fixed overlay — so it
// cannot sit on top of the time clock.
const DISMISS_KEY = "wt-ios-install-hint-dismissed";

function isIosDevice() {
  const ua = window.navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13 and later report as desktop Safari; touch points give it away.
  return (
    window.navigator.platform === "MacIntel" &&
    window.navigator.maxTouchPoints > 1
  );
}

function isSafari() {
  const ua = window.navigator.userAgent || "";
  // Other iOS browsers name themselves in the user agent (CriOS = Chrome,
  // FxiOS = Firefox, EdgiOS = Edge, OPiOS = Opera).
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
}

function alreadyInstalled() {
  if (window.navigator.standalone === true) return true; // iOS home-screen app
  return window.matchMedia("(display-mode: standalone)").matches;
}

export default function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Storage unavailable (private mode and friends) — still show the hint.
    }
    if (isIosDevice() && isSafari() && !alreadyInstalled()) setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to persist; the banner is already hidden for this view.
    }
  }

  return (
    <aside aria-label="Add WorkTeams to your home screen" style={bannerStyle}>
      <p style={textStyle}>
        📲 <strong>Put WorkTeams on your home screen:</strong> tap the{" "}
        <strong>Share</strong> button (the square with an arrow pointing up),
        then tap <strong>Add to Home Screen</strong>. WorkTeams then opens
        like an app — straight to your shifts and time clock.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={dismissStyle}
      >
        ×
      </button>
    </aside>
  );
}

const bannerStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  background: "var(--brand-soft)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  color: "var(--ink)",
  padding: "12px 14px",
  margin: "0 auto 16px",
  maxWidth: 1120,
};

const textStyle = { margin: 0, fontSize: "0.95rem", lineHeight: 1.45, flex: 1 };

const dismissStyle = {
  flex: "none",
  border: "none",
  background: "transparent",
  color: "var(--muted)",
  fontSize: "1.3rem",
  lineHeight: 1,
  fontWeight: 800,
  cursor: "pointer",
  padding: "0 2px",
};
