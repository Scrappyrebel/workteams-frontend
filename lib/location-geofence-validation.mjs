// A Missouri address must not end up with a geofence in the eastern hemisphere.
// Validate before location INSERT/UPDATE so the employee isn't falsely denied
// entry on a real site. Do not auto-flip signs: the actual location is unknown.
export function validateLocationGeofence(address, latValue, lngValue) {
  if ((latValue == null || latValue === "") && (lngValue == null || lngValue === "")) return null;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (latValue == null || lngValue == null || latValue === "" || lngValue === "" ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return "Enter valid latitude AND longitude together, or leave both blank.";
  }
  const isMissouri = /\b(?:MO|Missouri)\b/i.test(String(address || ""));
  if (isMissouri && (lat < 35.95 || lat > 40.67 || lng > -89.0 || lng < -96.0)) {
    return "These coordinates are outside Missouri. Missouri longitude must be NEGATIVE (west). Tap Find coordinates from address and verify the pin at the building before saving.";
  }
  return null;
}
