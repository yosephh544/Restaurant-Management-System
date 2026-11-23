# Temporary quick sign-in

Added on 2026-11-21 for testing and extended at the user's request to support multiple real backend accounts. This feature does not restore the removed offline app.

## Behavior

- Available only when `temporaryQuickLoginEnabled = kDebugMode`.
- Add quick sign-in account opens a username/PIN form. Save account verifies the credentials and encrypted staff profile through the backend, saves the account securely, and stays on the sign-in screen. The app then attempts to revoke its verification tokens.
- Each saved username/role has its own sign-in button and Remove control. Multiple accounts for the same role are supported. Saving an existing username updates it; other accounts are retained.
- Quick sign-in calls normal backend authentication. Active status, shifts, roles, permissions, and cashier restrictions still apply. An invalid PIN removes only that account; connection and shift failures keep the list.
- Normal sign-ins leave the saved list unchanged. Sign-out deletes real tokens, drafts, and payment workspace data while retaining the explicitly configured test accounts.
- Usernames/PINs are stored through the real secure vault under `temporary_quick_login`, with the server URL. PINs are never exposed by the UI account-list method, hardcoded, logged, or stored in SharedPreferences.
- Changing servers clears all quick accounts. Profile/release startup deletes the stored list, and those builds hide and reject the shortcuts.
- The earlier single-account storage format remains readable. It is converted to the account-list format when adding, updating, or removing an account.

## Removal

1. Remove the saved accounts first, or keep a one-time `vault.delete('temporary_quick_login')` in startup to clear older installs. Preserve other vault keys.
2. Remove `lib/features/authentication/quick_login_dialog.dart`.
3. In `auth_pages.dart`, remove its import, quick-account list/loading state, add/sign-in/remove handlers, the server-change listener for account labels, and debug-only controls. Keep the normal username/PIN form, branding, Profile, and pull-to-refresh.
4. In `session.dart`, remove `temporaryQuickLoginEnabled`, `_quickLoginKey`, `_quickLoginAccounts`, `quickLoginAccounts`, `forgetQuickLogin`, `quickLogin`, `_saveQuickLoginAccount`, and `addQuickLoginAccount`, plus quick-cache cleanup in restore/server switching. Keep `_authenticate` and normal `login`, token persistence, generation checks, and server settings.
5. Remove the README paragraph and update the AGENTS note. Preserve live API flows, cashier restrictions, minus buttons, and pull-to-refresh.

Use static analysis for routine validation. Tests and APK builds remain opt-in, as requested by the user.
