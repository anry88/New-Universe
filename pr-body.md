## Description
Implemented a top-down interactive map of the Home System using PixiJS v8.

Key features:
- Star at center with pulse animation.
- Planets on orbits with names and clickability.
- Idle ships displayed at their planet locations.
- Active expeditions displayed as trajectories towards target sectors.
- Pan and zoom (scroll/pinch) support.
- Integration with existing `useMe` hook for real-time data.

## Changes
### Shared
- Created `shared/types/ships.ts` and `shared/types/expeditions.ts`.
- Updated `shared/types/user.ts` to include `ships` and `expeditions`.

### Backend
- Updated `GET /me` route to return user's ships and active expeditions.
- Updated `/me` tests.

### Frontend
- Created `SystemRenderer.tsx` (PixiJS component).
- Created `SystemMapPage.tsx`.
- Added `/map` route to `App.tsx`.
- Updated `HomePage.tsx` to link to the map.

## Verification
- Backend tests passed: `npm test src/features/me/me.test.ts`
- Frontend build passed (type safety check): `npm run build`

Closes #40
