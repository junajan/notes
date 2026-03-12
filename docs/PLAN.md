# Project Plan: Online Notes - Status Report

## Overview
A high-quality, visually polished, and responsive website for managing notes online with a tabbed interface and debounced auto-save.

## Final Tech Stack
- **Monorepo:** npm Workspaces.
- **Frontend:** Vue 3 (Vite 5, Pinia, TypeScript).
- **Backend:** Node.js Express (TypeScript via `tsx`, ESM).
- **Database:** SQLite (via `better-sqlite3`).
- **Validation:** `zod` for shared schemas.
- **UI/UX:** Clean, flat design with monospaced editor, line numbers, and drag-and-drop tabs.

## Implementation Details

### Completed Features
- [x] **Monorepo Architecture:** Shared types between frontend and backend.
- [x] **SQLite Backend:** Persistent storage with audit fields (`createdAt`, `updatedAt`).
- [x] **Responsive UI:** Fully fluid layout for mobile, tablet, and desktop.
- [x] **Tabbed Navigation:**
  - Drag-and-drop reordering (persisted to DB).
  - Integrated "Add Tab" button in the tab bar.
  - Flat, modern aesthetic (removed card background/shadow).
- [x] **Code-like Editor:**
  - Monospaced font (Courier New).
  - Synced line numbers on the left.
  - Debounced auto-save (500ms).
- [x] **Status Indicators:** "Saving..." vs "All changes saved" indicators.
- [x] **Compatibility Fixes:** Downgraded Vite to v5 and switched to `tsx` to support Node.js 21.5.0.

### Data Model (Shared)
```typescript
{
  id: UUID,
  title: string,
  content: string,
  positionIndex: number,
  createdAt: ISO Timestamp,
  updatedAt: ISO Timestamp
}
```

## How to Run
From the root directory:
```bash
npm run dev
```
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3000

## Future Roadmap (Ideas)
- [ ] Rich Text / Markdown support.
- [ ] Global search for notes.
- [ ] Dark mode support.
- [ ] Note categories or tags.
