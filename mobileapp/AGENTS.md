# Project notes

The user requested on 2026-11-21 that the APK not be rebuilt after every change. Tests were initially skipped; the user later authorized focused tests when needed. Use static analysis and relevant tests for meaningful behavior changes. Build the APK only when explicitly requested.

The user requested removal of the temporary offline demo on 2026-11-21. The app now requires a real backend and username/PIN sign-in. Do not restore local sample data, simulated sessions, the Continue role selector, or Profile role switching. The completed removal is recorded in [docs/offline-demo-removal.md](docs/offline-demo-removal.md). Preserve the Majete Corner name, supplied logo, launcher icons, and icon generation script.

The user requested temporary quick sign-in on 2026-11-21 and clarified that it must support multiple real test accounts. This is a debug-only account list configured in the app; it stores each username/PIN securely and calls normal backend authentication. Adding an account verifies and saves it without signing in, so several can be added consecutively. Keep it separate from normal sign-in and the removed offline demo. Read [docs/temporary-quick-login.md](docs/temporary-quick-login.md) for behavior and removal instructions.

Cashier must not do Waiter work: creating orders, adding items, replacing orders, and marking orders served are Waiter-only in this service app, even if the backend returns broader permissions. Cashier handles order viewing and payment/history/refund/transfer workflows. Preserve this restriction in the live app.

The user rejected the icon-heavy visual redesign as cluttered and generic. Read [docs/design-notes.md](docs/design-notes.md) before UI changes. Prefer typography, alignment, restrained color, and essential controls. Do not reintroduce decorative icon tiles, colored card stripes, gradient banners, or boxed step indicators.
