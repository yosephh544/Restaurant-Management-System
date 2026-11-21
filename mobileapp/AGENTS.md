# Project notes

The offline demo was added at the user's request on 2026-11-19 because the backend was unavailable. Keep it functional until the user asks to remove it. The user requested that the offline app show no wording identifying it as a demo, test, sample, or pretend app.

For future removal, read [docs/offline-demo-removal.md](docs/offline-demo-removal.md). Remove the temporary offline transport and its UI/session hooks without reverting unrelated user edits. Preserve the Majete Corner name, supplied logo, launcher icons, and icon generation script.

Cashier must not do Waiter work: creating orders, adding items, replacing orders, and marking orders served are Waiter-only in this service app, even if the backend returns broader permissions. Cashier handles order viewing and payment/history/refund/transfer workflows. Preserve this role restriction when removing the offline demo.

The user rejected the icon-heavy visual redesign as cluttered and generic. Read [docs/design-notes.md](docs/design-notes.md) before UI changes. Prefer typography, alignment, restrained color, and essential controls. Do not reintroduce decorative icon tiles, colored card stripes, gradient banners, or boxed step indicators.
