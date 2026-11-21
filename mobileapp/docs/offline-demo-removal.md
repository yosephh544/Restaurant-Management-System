# Temporary offline demo: record and future removal

Added on 2026-11-19 at the user's request while the backend was inactive. The user wants to remove this later, but keep it working for now. They also requested no visible wording identifying the offline app as a demo or showing test/sample/pretend/no-money labels. This preference applies to the offline UI; existing notices for the real backend's electronic test payment adapter are preserved.

## Current entry and behavior

- Sign-in **Continue** opens role selection, then `SessionController.startDemo(role)`.
- **Profile → Change role** calls `switchDemoRole(role)` and returns to the role's home page.
- **Profile → Sign out** exits and resets the in-memory restaurant. Restarting the app also resets it.
- `DemoRestaurant` implements Dio's `HttpClientAdapter`. It handles requests entirely in memory; the real network adapter is saved and restored on exit/disposal.
- Seeded Ethiopian dishes and today's orders support creation/addition/replacement, kitchen preparation/cancellation, serving, cash payments, electronic pending sessions/retraction, cashier history, refunds, and transfers.
- Permissions and waiter ownership checks apply to the local data. Role switching preserves orders and each role's in-memory workspace.
- Demo tokens, drafts, and payment metadata never enter the real secure vault. The configured API URL is preserved. Cash payments update local records; electronic payments stay pending, with no provider calls.

## Files introduced for the offline feature

| File | Purpose | Future action |
| --- | --- | --- |
| `lib/core/demo.dart` | Local restaurant data, staff, payment simulation, API transport | Remove once all references are removed |
| `test/demo_test.dart` | Offline workflows, permissions, isolation, entry/switching/exit and label checks | Remove after replacing with appropriate live API coverage |

`AGENTS.md` and this document record the user's preference and removal plan. Update or archive their offline notes after removal.

## Hooks to remove from existing files

1. **`lib/core/session.dart`**: remove the `demo.dart` import, `_DemoVault`, `SessionState.isDemo`, `_demo`, `_demoVault`, `_liveAdapter`, `startDemo`, `switchDemoRole`, and `_saveDemoPayments`. Restore `_accept` to use the real vault/server, persist normal sessions, and create plain `SessionState` values. Remove the offline-only login guard and adapter restoration paths. Restore normal sign-out deletion of the real stored session and normal remote logout. Keep the generation checks in `restore()` because they also protect real authentication from stale asynchronous results.
2. **`lib/features/authentication/auth_pages.dart`**: remove the `demo.dart` import, `chooseDemoRole`, `_tryDemo`, the **Continue** button and its associated divider/spacing, the offline **Change role** card, and all `isDemo` branches. Always show real server settings and use the normal sign-out confirmation. Keep the logo/name and any unrelated layout edits. Keep normal phone-number display when available.
3. **`lib/features/payments/payment_pages.dart`**: remove the `offline`/`isDemo` conditionals added to checkout dropdown labels/buttons, payment notices, saved-session subtitles, QR captions/accessibility text, refund confirmation, and pending-payment cancellation. Use the existing live adapter wording until real electronic payments are implemented. These live labels existed before the offline feature.
4. **`lib/core/router.dart`**: no active offline behavior is needed here anymore. The initial yellow demo banner was removed at the user's request. A local `session` variable introduced to read the staff can stay; do not revert branding or user layout changes.
5. **`README.md`**: remove/update the **Try without a backend** section, demo-specific validation instructions and this guide's link. Remove the offline-account explanation while retaining the real staff provisioning instructions.

Use targeted edits, not whole-file `git restore` or a blanket rollback: these files also contain the user's styling changes and the Majete Corner branding.

## Branding to keep

Keep `restaurantName = 'Majete Corner'`, `BrandMark` using `assets/images/logo.jpg`, the pubspec logo asset declaration, Android/iOS display names, all generated launcher icons/adaptive icon resources, and `tool/generate_brand_icons.ps1`. These are permanent branding changes and independent of the offline transport. Do not remove real `LocalWorkspace`, permission rules, server configuration, or live order/payment API methods.

Also preserve the later UI improvements: the extended New order FAB, refresh controls beside Your orders, opaque slide transitions, and lazy dish selection with search/categories and a fixed Review order action. The selection/review flow in `cart_page.dart` works with the real API and is independent of the temporary offline transport.

The quieter service theme, status filter chips, and permission-checked inline order/kitchen/payment shortcuts are also permanent UI improvements. Keep them when removing the offline transport. Decorative icon tiles, status stripes, gradient headers, and the boxed step indicator were removed after the user found them cluttered; follow `design-notes.md` for the current visual direction.

Keep `P.waiterActions`, the role restriction in `Staff.can`, and `canServeOrder` plus the serving action's revalidation. The user requires Cashier to stay out of order creation/addition/replacement/serving work. This policy applies to the live app as well as the offline transport.

## Validation after removal

Run Flutter analysis and relevant live API tests. Verify real sign-in, token restore/refresh, server switching, sign-out, and role-specific order/payment flows. Ensure no offline transport imports or `startDemo`, `switchDemoRole`, or `isDemo` hooks remain, and verify the branded Android APK builds. The older API/widget fixtures predate current response contracts and must be updated before relying on the full suite for live backend coverage.
