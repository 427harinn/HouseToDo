# Task reminder deep link

## Behavior

Task-specific Web Push notifications keep the existing title (`家事の時間です`) and body (`task.title`). Both the canonical reminder path (`deadlineTime - notificationOffsetMinutes`) and the legacy `notificationTime` path send:

```json
{
  "kind": "task",
  "taskId": "<task id>",
  "url": "/home?task=<encodeURIComponent(task id)>"
}
```

Summary notifications are unchanged:

```json
{
  "kind": "summary",
  "period": "morning | evening",
  "localDate": "YYYY-MM-DD",
  "url": "/home"
}
```

## Service Worker click handling

`public/sw.js` accepts only same-origin HTTP(S) URLs and falls back to `/` for malformed, cross-origin, protocol-relative, or script URLs. Existing window clients are compared using pathname + search + hash. Therefore an existing `/home` client navigates to `/home?task=abc`; a client already at that exact full URL is only focused. Other routes also navigate to the full task URL. With no window client, the Worker opens the full task URL.

## Home query handling

Home parses `?task=` as untrusted input and does not fetch a task by ID. The cached Memory/IndexedDB Home snapshot may paint first, but it cannot finalize a notification selection. After the authoritative current-date Home response arrives, the task is selected only when its returned ID is in the current household `homeTasks` and its status is `pending` or `in_progress`. This is recurrence-agnostic and works for every task type represented in Home.

The existing inline detail and Complete button are reused. Notification navigation never completes a task. The selected row is expanded, `openRowId` is closed, and the row is scrolled into view once with `block: "center"`; reduced-motion users get `behavior: "auto"`.

After successful selection, or after authoritative confirmation that the target is missing, completed, skipped, inactive, deleted, not actionable today, from another household, or nonexistent, Home removes `?task=` with `history.replaceState`. It then behaves normally: the user can close the detail, expand another task, pass, or press the existing Complete button. No task data is exposed from the query and no cross-household lookup is performed.

## Cache, auth, and date safety

The deep link waits for the authenticated household and authoritative Home response. If authentication is still loading, the task query is carried only in the login/home URL continuation; it is not persisted in storage. If the local date rolls over and the task is no longer in today's authoritative Home list, Home falls back normally.

## Manual iPhone check

1. Create or edit a task with a reminder a few minutes ahead.
2. Close or background the PWA and wait for the reminder.
3. Tap the notification.
4. Confirm Home opens, the notified task is expanded, and its row is visible near the center.
5. Confirm the existing Complete button is immediately available without the task already being completed.
6. Tap Complete and verify the normal local-first completion behavior.
7. Repeat once while the PWA is already open at Home, and once while it is open on Calendar, Shopping, or another route.

Summary notifications remain `/home` and do not auto-select a task. No reminder fields or D1 migration are required for this feature.

## Scope status

Task notification deep-link implementation and staging/mobile verification are complete, including real iPhone PWA verification. Calendar notification deep-link synchronization and Shopping planned-date notifications are deferred/out of scope. Notification action buttons are not required, and no new notification DB field is planned.
