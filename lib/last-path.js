// Remembers where the user was in the app so launching the installed app
// (or the home-screen icon) drops them back where they left off.
const KEY = "workteams:lastPath";

export function saveLastPath(path) {
  try {
    if (path && path.startsWith("/app/")) localStorage.setItem(KEY, path);
  } catch {}
}

export function getLastPath() {
  try {
    const p = localStorage.getItem(KEY);
    return p && p.startsWith("/app/") ? p : null;
  } catch {
    return null;
  }
}

export function clearLastPath() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
