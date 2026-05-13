# `frontend/src/locales` directory

This directory contains flat JSON dictionaries for the Telegram Mini App UI. Keys are grouped by feature prefix (`common.*`, `build.*`, `jumpGate.*`, `market.*`, `production.*`, etc.) and consumed through `lib/i18n.tsx`.

## Files

- **`en.json`** — default English UI dictionary. Add every new user-facing string here first.
- **`ru.json`** — Russian UI dictionary with the same keys as `en.json`.

## Adding a locale string

1. Add the key to both `en.json` and `ru.json`.
2. Read it through `useI18n().t(key, params?)` in React components, or pass the translated value into canvas/Pixi helpers.
3. Keep runtime/generated values such as planet names separate from dictionary keys unless the product spec says they should be localized.
