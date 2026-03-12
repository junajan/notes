# Online Notes

A minimalist, high-performance note-taking application designed for speed and simplicity. Featuring a clean Vue 3 frontend and a robust Express/SQLite backend.

## ✨ Features

- **Rich Editor Experience**: Clean writing area with line numbers and real-time syncing.
- **Note Management**: Create, update, delete, and reorder notes with ease.
- **Drag & Drop**: Reorder your notes by dragging tabs (automatically disabled on mobile for better UX).
- **Smart Shortcuts**: 
  - `Cmd+Shift+D` (Mac) or `Ctrl+Shift+D` (Windows/Linux) to **duplicate the current line** or selection.
  - `Option+Shift+D` is also supported as an alternative if browser shortcuts conflict.
- **Simple Authentication**: Secure your notes with a single password layer (JWT-based).
- **Safety First**: Confirmation modal when deleting notes to prevent accidental data loss.
- **Fully Responsive**: Optimized for both desktop and mobile devices with smart margin adjustments.

## 🛠 Tech Stack

- **Frontend**: [Vue 3](https://vuejs.org/) (Composition API), [Vite](https://vitejs.dev/), [Pinia](https://pinia.vuejs.org/), [vuedraggable](https://github.com/SortableJS/vue.draggable.next).
- **Backend**: [Node.js](https://nodejs.org/), [Express](https://expressjs.com/), [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3).
- **Shared**: Type-safe communication using [Zod](https://zod.dev/) schemas.
- **Monorepo**: Managed with NPM Workspaces.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation

1. Clone the repository
2. Install dependencies from the root:
   ```bash
   npm install
   ```

### Running the Application

Start both the frontend and backend in development mode:

```bash
npm run dev
```

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend**: [http://localhost:3000](http://localhost:3000)

### Configuration

You can configure the application password by setting the `APP_PASSWORD` environment variable in the backend. 

- **Default Password**: `123`

## ⌨️ Development

The project uses NPM workspaces:
- `backend/`: Express server and SQLite database.
- `frontend/`: Vue 3 application.
- `packages/shared/`: Shared types and Zod schemas used by both.

To run only a specific workspace:
```bash
npm run dev --workspace=@notes/frontend
npm run dev --workspace=@notes/backend
```

## 📄 License

ISC
