-- WorkTeams notification quiet hours (072).
--
-- Migration 068 gave each member per-category phone-notification choices
-- (schedule changes, messages, customer replies, pay), but no quiet-hours
-- window. Workforce got quiet hours in its Dept 9 build (its migration
-- 266); this is the WorkTeams parity piece, in this app's own patterns.
--
-- Two nullable TIME columns on the member's existing preferences row:
--
--   * Both NULL = quiet hours off = exactly the behavior before this
--     migration. A member with no preferences row at all is likewise
--     never held (absence of a row already means "all on" in 068).
--   * The window is read in the COMPANY's timezone (companies.timezone,
--     migration 041 — NOT NULL, default 'America/Chicago'). A window
--     whose end is earlier than its start wraps past midnight
--     (22:00 -> 06:00). A window whose start equals its end is off.
--   * While a member is inside their window, the NON-URGENT push send
--     paths hold the phone push: crew-chat messages, schedule-request
--     notifications and work-order notices. The underlying message,
--     request or work order is already saved in the app exactly as
--     today — only the buzz is skipped. There is deliberately NO queue and
--     NO scheduler: a held push is simply not sent at that moment and
--     is never re-sent later; the shared check lives in
--     lib/notification-prefs.js and every send path uses it.
--   * URGENT always passes. This app's urgent class is the emergency /
--     help channel — the emergency send route and the owner alerts
--     (emergency_alerts: help requests, safety, missing clock-in /
--     possible no-show, overtime). That channel never consulted member
--     preferences and still never does; it comes through quiet hours
--     or not, exactly as the notifications page already promises
--     ("Emergency and help alerts ... always come through").
--
-- The preferences table already carries table-level grants from 068
-- (select/insert/update to authenticated, all to service_role), which
-- cover the two new columns — no new table, no new grant needed. Client
-- and server code read the new columns tolerantly (a separate probe in
-- lib/notification-prefs.js and on the notifications page), so the app
-- behaves exactly as today until this migration runs.

BEGIN;

alter table public.member_notification_preferences
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time;

comment on column public.member_notification_preferences.quiet_hours_start is
  'Start of the member''s quiet-hours window, read in the company timezone (companies.timezone). NULL together with quiet_hours_end = quiet hours off.';
comment on column public.member_notification_preferences.quiet_hours_end is
  'End of the member''s quiet-hours window, read in the company timezone. An end earlier than the start wraps past midnight; start equal to end = off.';

COMMIT;
