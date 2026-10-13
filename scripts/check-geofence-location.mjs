import assert from "node:assert/strict";
import fs from "node:fs";
import {validateLocationGeofence} from "../lib/location-geofence-validation.mjs";
assert.equal(validateLocationGeofence("3855 Corporate Centre Dr, O Fallon, MO 63368","38.723808","-90.716119"),null);
assert.match(validateLocationGeofence("3855 Corporate Centre Dr, O Fallon, MO 63368","38.749","90.7107"),/outside Missouri/);
assert.equal(validateLocationGeofence("3855 Corporate Centre Dr, O Fallon, Missouri","38.749","-90.7107"),null);
assert.match(validateLocationGeofence("Somewhere, Missouri","38.749","90.7107"),/NEGATIVE/);
assert.match(validateLocationGeofence("O Fallon, MO","", "-90.716119"),/both/i);
assert.equal(validateLocationGeofence("O Fallon, MO","", ""),null);
assert.equal(validateLocationGeofence("Seattle, WA","47.5","-122.3"),null);
const source=fs.readFileSync("app/app/[companyId]/locations/page.js","utf8");
assert.ok(source.includes("validateLocationGeofence(form.address, form.lat, form.lng)") &&
  source.includes("alert(geofenceError);"),"Location editor must block bad geofences before INSERT/UPDATE");
console.log("WorkTeams location geofence sign/range validation regression PASSED.");
