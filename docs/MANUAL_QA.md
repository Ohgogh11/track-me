# Manual iPhone QA

Record the app commit, Expo Go version, iOS version, API URL, Clerk test user, and test date before starting. Use test data only.

## Setup

1. Run `bun run check`; expected: lint, type checks, and every automated test pass.
2. Run `bun run db:migrate` against the test Turso database; expected: completion with no credential output.
3. Confirm the Koyeb `/health` endpoint returns healthy, then start Expo with `bun run dev:mobile`; expected: a scannable QR code.
4. Open the project in Expo Go on iPhone; expected: the sign-in screen appears and no database/config error is shown.

## Authentication

5. Create a new email/password user; expected: Clerk requests email verification and the code completes sign-up.
6. Sign out and sign in with the password; expected: protected tabs appear only after authentication.
7. Start password reset and use the emailed code; expected: the new password can sign in.
8. Sign out and use Google; expected: the browser returns to the app with an active session. If it does not, record the exact redirect URI and add it to Clerk before retrying.

## Exercise catalog and plans

9. Open Workouts > Exercises, create a weighted exercise with primary and two secondary muscles, edit it, archive it, and restore it; expected: every change survives leaving/reopening the tab.
10. Copy a built-in, hide the original, and restore it from Hidden built-ins; expected: the copy is personal and the original visibility synchronizes separately.
11. Create a plan with at least two exercises. Add warm-up and work sets with different rep ranges, RPEs, and rest values; reorder exercises and sets; expected: Save and reopen preserves exact order and prescriptions.

## Offline workout and restart acceptance

12. Disable Wi-Fi and cellular data, start the plan, and confirm the global timer advances; expected: the workout starts without API access.
13. Complete a loaded work set; expected: haptic feedback occurs, the rest countdown starts, and notification permission is requested if needed.
14. Complete another set and background the app; expected: a local notification fires at the deadline and elapsed rest continues until acknowledged.
15. Pause, wait, and resume; expected: paused wall time is excluded. Force-close Expo Go mid-session and reopen; expected: the active workout, completed sets, and timer segments recover.
16. Add a set, change session RPE/rest, and add another exercise; expected: the source plan remains unchanged.
17. Finish the workout; expected: planned sets become skipped and the completed workout appears in history without a plan-update prompt.
18. Reopen the source plan; expected: session-only exercise and set changes did not alter it.

## History, analytics, and records

19. Edit a completed work set's weight/reps/RPE; expected: history and Progress metrics update immediately.
20. Verify 7/30/90-day and custom inclusive ranges; expected: workout count, active time, work sets, reps, load volume, frequency, PRs, and body-weight trend reflect the range.
21. Tap muscle-map regions; expected: weighted sets use 1.0 primary and 0.5 secondary attribution and show exercises/volume/PRs.
22. Open an exercise detail; expected: load, reps, volume, estimated 1RM trends, session history, and all-time records include plan and empty workouts.
23. Delete the edited workout; expected: it disappears and all analytics/PR state recalculates.

## Nutrition, goals, body weight, and units

24. Search for a common food, select a provider serving, change its grams, and review values; expected: calories and macros rescale before saving and attribution remains visible.
25. Scan an international packaged-food barcode; expected: Open Food Facts data opens in the review screen and missing nutrients remain visibly unknown rather than zero.
26. Correct a provider result, save it as a favorite, disable connectivity, and log it again; expected: the private corrected copy remains available offline.
27. Search for a provider food without starring it, close the sheet, and disable connectivity; expected: that provider result is not retained as an offline food.
28. Create a custom food with a Hebrew name, log a calorie-only entry, then inspect totals; expected: Unicode is preserved and the calorie-only entry is explicitly excluded from macro totals.
29. Use Copy yesterday and inspect the seven-day card; expected: copied entries use the selected day and weekly calorie/macro averages update.
30. Calculate suggested targets, edit them, and confirm; expected: the calculation breakdown is shown, confirmation is required, and yesterday retains its historical targets.
31. Record body weight in kg, switch to lb, and inspect Progress; expected: the same normalized measurement converts without changing stored meaning.
32. Change the device timezone, tap Use this device timezone, and inspect entries near midnight; expected: grouping follows the saved profile timezone without data loss.

## Sync, cold start, and two-device recovery

33. Re-enable connectivity and tap Sync now; expected: pending reaches zero, a cursor/last-sync time appears, and Koyeb cold start is handled by retries.
34. Open the same Clerk account on a second device/simulator or a clean Expo dataset; expected: the completed workout, plan, nutrition entries, personal foods, targets, and body weight bootstrap from Turso.
35. Edit the same simple entry offline on both devices, then sync both; expected: Settings shows a conflict with Keep mine and Use cloud, and the selected result converges.
36. Edit the same plan/workout offline on both devices and select Use cloud; expected: a recovered copy of the local version remains available.
37. Start separate offline workouts on both devices and sync them; expected: one remains active and the other offers Take over or Keep as draft. Take over should demote the prior session to a recoverable draft, never delete it.
38. Delete an entry offline and sync both datasets; expected: its tombstone removes it everywhere without resurrection.

## Platform/build checks

39. Run `bun run --filter @track-me/mobile export`; expected: both iOS and Android exports complete.
40. When signing access exists, test the SQLCipher EAS development build; expected: data survives restart and Expo Go is not used for the encrypted database test.
41. Build and smoke-test Android with the same account; expected: feature and sync behavior matches iPhone.

## Feedback template

```text
Test number:
Device / OS / Expo Go or build version:
Online, offline, or reconnecting:
Actions performed:
Expected result:
Actual result:
Screenshot or screen recording:
Relevant API/Koyeb log time:
Can reproduce? Always / Sometimes / Once
Severity: Blocks use / Data risk / Major / Minor / Cosmetic
Additional notes:
```
