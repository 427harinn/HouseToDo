# HouseToDo Real iPhone Release Manual Checklist

This checklist is for a human on a real iPhone. Codex cannot operate the device, so every item below remains `NOT RUN` until someone records the date, environment, device/iOS version, and result. This checklist does not imply that staging or production has been deployed.

## Install / PWA

- [ ] `NOT RUN` — Open the target staging/production URL in Safari.
- [ ] `NOT RUN` — Add the site to the Home Screen.
- [ ] `NOT RUN` — Launch from the Home Screen in standalone mode.
- [ ] `NOT RUN` — Confirm the manifest, app name, theme/background colors, and icons are correct.
- [ ] `NOT RUN` — Confirm safe-area insets and Bottom Navigation placement.
- [ ] `NOT RUN` — Confirm Login/Register inputs do not trigger unwanted auto-zoom.
- [ ] `NOT RUN` — Confirm direct route reload and notification deep-link routes open the expected screen.

## Auth

- [ ] `NOT RUN` — Log in with a valid test account.
- [ ] `NOT RUN` — Log out and confirm the session is invalidated.
- [ ] `NOT RUN` — Close/reopen the standalone app and confirm session restoration.
- [ ] `NOT RUN` — Confirm unauthenticated access returns to Login without showing the app shell.

## Home

- [ ] `NOT RUN` — Complete a task and confirm completion motion/state.
- [ ] `NOT RUN` — Pass a task and confirm the passed history state.
- [ ] `NOT RUN` — Undo/restore a completed or passed task.
- [ ] `NOT RUN` — Confirm the completer/actor and assignee display are correct for a shared household.

## Calendar

- [ ] `NOT RUN` — Navigate to the previous and next month and return to Today.
- [ ] `NOT RUN` — Open a Date Sheet for a selected date.
- [ ] `NOT RUN` — Complete a task from the Date Sheet.
- [ ] `NOT RUN` — Restore a completed Calendar task.
- [ ] `NOT RUN` — Open Task Edit from Calendar and confirm returning preserves Calendar context.
- [ ] `NOT RUN` — Confirm planned Shopping markers and Date Sheet deep links.

## Shopping

- [ ] `NOT RUN` — Add a Shopping item.
- [ ] `NOT RUN` — Reuse an item from Recent and from a Template.
- [ ] `NOT RUN` — Select an image from the OS picker and confirm preview/remove behavior.
- [ ] `NOT RUN` — Purchase an item and confirm purchaser/time display.
- [ ] `NOT RUN` — Restore a purchased item.
- [ ] `NOT RUN` — Reorder pending items and confirm the order persists after reload.
- [ ] `NOT RUN` — Confirm a member sees the owner-created item and the owner sees the member purchaser.

## Other

- [ ] `NOT RUN` — Open the member list as owner and member.
- [ ] `NOT RUN` — Create an invite and copy the invite code.
- [ ] `NOT RUN` — Confirm notification settings and morning/evening controls.
- [ ] `NOT RUN` — Confirm storage usage, image limits, and safe unknown/pending states.
- [ ] `NOT RUN` — Confirm owner-only household settings and member read-only behavior.
- [ ] `NOT RUN` — Confirm account email, display name, and avatar behavior.

## Push

- [ ] `NOT RUN` — Grant notification permission on the supported device/browser.
- [ ] `NOT RUN` — Verify morning and evening schedule settings.
- [ ] `NOT RUN` — Receive a push notification and confirm the tap URL opens the intended screen.

Push validation requires an authenticated, configured staging or production environment with the required VAPID secrets and an active Worker Cron. It must not be inferred from local tests or this checklist. The current release-readiness audit found staging but also found pending remote migrations and a missing `SESSION_SECRET`; no Push validation is authorized by this checklist.

## Human sign-off

- Environment / URL: `________________________________________`
- Device / iOS / Safari: `____________________________________`
- Test account(s): `__________________________________________`
- Run date: `_______________________________________________`
- Result / notes: `___________________________________________`
- Reviewer: `________________________________________________`
