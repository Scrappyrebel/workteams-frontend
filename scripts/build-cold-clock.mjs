import {readFileSync,writeFileSync} from "node:fs";
import {coldClockClient} from "../lib/cold-clock-client.mjs";
const libraries=["punch-outbox.mjs","local-shift.mjs","attendance-shifts.mjs","cold-clock-identity.mjs"];
const bundle=libraries.map(file=>readFileSync(new URL(`../lib/${file}`,import.meta.url),"utf8").replace(/^export /gm,"")).join("\n");
const core="return {openBrowserPunchStorage,createPunchOutbox,localShift,chooseAssignedShift,readColdClock};";
const script=`(${coldClockClient.toString()})((()=>{${bundle}\n${core}})());`.replace(/<\/script/gi,"<\\/script");
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WorkTeams — Offline Time Clock</title><style>body{font:18px system-ui,sans-serif;max-width:600px;margin:30px auto;padding:20px;color:#172554;background:#f8fafc}button,select{font:inherit;padding:15px;width:100%;margin:8px 0}button{background:#1d4ed8;color:white;border:0;border-radius:8px}button:disabled{opacity:.5}label{display:block;margin-top:15px}</style></head><body><h1 id="clock-company">WorkTeams</h1><h2>Offline Time Clock</h2><p id="clock-status" role="status">Opening your saved clock…</p><section id="clock-controls" hidden><label>Assigned location<select id="clock-location"></select></label><label>Working role<select id="clock-role"></select></label><p id="clock-summary"></p><button id="clock-in" disabled>Clock in — save on this phone</button><button id="clock-out" disabled>Clock out — save finishing time</button><p>Required book and video proof remains separate and pending. Previously saved recordings are preserved. This startup screen saves time; use the full Time Clock for proof capture.</p><button id="clock-reconnect">Return to full Time Clock when connected</button></section><script>${script}</script></body></html>`;
writeFileSync(new URL("../public/offline-clock-shell.js",import.meta.url),`// Generated from the existing tested punch queue. No account data is bundled.\nself.WORKTEAMS_OFFLINE_HTML=${JSON.stringify(html)};\n`);
// A stopped worker must be executable without fetching any imported script.
// Keep the source small; embed the exact same generated shell at build time.
// Markers make repeated predev/prebuild runs idempotent.
const workerUrl=new URL("../public/sw.js",import.meta.url);
const worker=readFileSync(workerUrl,"utf8");
const embedded=`// BEGIN GENERATED OFFLINE CLOCK\nself.WORKTEAMS_OFFLINE_HTML=${JSON.stringify(html)};\n// END GENERATED OFFLINE CLOCK`;
const dependency=/importScripts\("\/offline-clock-shell\.js"\);|\/\/ BEGIN GENERATED OFFLINE CLOCK[\s\S]*?\/\/ END GENERATED OFFLINE CLOCK/;
if(!dependency.test(worker))throw Error("Worker shell insertion point is missing");
writeFileSync(workerUrl,worker.replace(dependency,()=>embedded));
console.log("WorkTeams standalone offline clock generated from the existing punch queue.");

