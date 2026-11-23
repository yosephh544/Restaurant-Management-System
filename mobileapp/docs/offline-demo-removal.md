# Offline demo removal (completed)

The temporary offline feature added on 2026-11-19 was removed at the user's request on 2026-11-21. The app now uses the real backend and username/PIN sign-in.

## Removed

- `lib/core/demo.dart`: seeded dishes/orders, simulated staff and payments, and the in-memory Dio transport.
- `test/demo_test.dart`: coverage specific to the removed offline workflows.
- The in-memory demo vault, adapter replacement/restoration, demo session flag, and role-switching session methods.
- The sign-in Continue role selector and Profile Change role controls.
- Offline branches in table selection, payment checkout/notices, and order payment eligibility.
- Offline setup instructions and outdated reminders to keep the feature active.

## Preserved

Majete Corner branding, the supplied logo, launcher icons, and `tool/generate_brand_icons.ps1` remain. Real secure sessions, token restore/refresh, server settings, draft persistence, waiter-only floor actions, configured tables, table bills, Kitchen/Bar queues, and the order selection/review flow remain.

The minus buttons and pull-to-refresh across data screens remain. Refresh preserves unsent quantities and notes. Cashier still cannot create/add/replace orders or mark them served, even if the backend grants broader permissions.

The real backend's phone/QR adapter still creates placeholder payment sessions, so its test-payment notices remain. Removing the offline app does not change provider integration or simulate successful payments.

## Validation policy

Use static analysis for routine validation. The user requested no tests or APK builds unless explicitly requested. Do not recreate the removed local transport or role selector to work around a backend connection problem.
