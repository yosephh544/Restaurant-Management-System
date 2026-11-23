# Majete Corner: visual direction

The user wants an easy-to-read, fast restaurant service app. They rejected a redesign with repeated icons, colored strips, and extra containers as cluttered and looking AI-generated. Keep the real Majete Corner logo and familiar navigation; create hierarchy through table/dish text, alignment, spacing, and clear actions.

## Research and interpretation

- [NN/g: usability heuristics for complex applications](https://www.nngroup.com/articles/usability-heuristics-complex-applications/) specifically shows that repeating the same icon beside every item of one type adds clutter without helping visual search. Remove repeated dish/table/stat icons.
- [NN/g: why a design looks good](https://www.nngroup.com/articles/why-does-design-look-good/) explains consistent typography, alignment, and spacing as ways to establish hierarchy. Use a clear type scale and consistent left edges rather than adding boxes to make content feel designed.
- [NN/g: aesthetic and minimalist design](https://www.nngroup.com/articles/aesthetic-minimalist-design/) recommends retaining what supports the user's task and removing low-value noise. A simple interface must still expose required controls and feedback.
- [Ralabs: reviewing AI-generated interfaces](https://ralabs.org/blog/ai-design-slop-how-to-review-ai-generated-interfaces/) is a designer's critique, not an empirical detector of AI authorship. It calls out generic icon tiles, nested containers, default gradients, and equal emphasis on everything. These describe the rejected pass here; use them as review prompts, not universal bans on native controls.
- [Apple: UI design tips](https://developer.apple.com/design/tips/) supports readable text, adequate contrast, alignment, and generous touch targets. Keep the larger control targets while removing decorative surfaces.

## Implementation rules

1. Table, order status, dishes, quantities, and the next permitted action take priority.
2. Group the three useful service counts into one quiet summary; avoid three decorated icon cards.
3. Use plain metadata and small text-only status indicators. Green primarily identifies actions and selection; warning/error colors retain their meaning.
4. Keep icons when they help recognize a control: navigation, back, search, add/remove, refresh, or delete. Do not put generic icons beside every dish or table.
5. Use a flat logo/name header, simple card boundaries, and restrained selection styling. Do not add colored left bars, gradient banners, faux artwork, or boxed progress steps.
6. Preserve the fixed Review order action, lazy dish list, search/categories, and role-checked shortcuts. Cashier must never acquire Waiter actions through styling changes.
7. Keep loading, empty, validation, and failure feedback useful. Do not add marketing copy or demo labels to the app.

The user authorized focused tests when needed and requested that the APK not be rebuilt after every change. Use static analysis and relevant tests for behavior changes; build the app only on explicit request. Do not claim a device usability review or performance benchmark that was not performed.
