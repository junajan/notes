import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { CreateNoteSchema, UpdateNoteSchema } from '@notes/shared';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/notes.db');

// Auth configuration
const APP_PASSWORD = process.env.APP_PASSWORD || '123';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const COOKIE_NAME = 'auth_token';
const SESSION_DURATION = '365d';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year

// Ensure data directory exists
import fs from 'fs';
if (!fs.existsSync(path.join(__dirname, '../data'))) {
  fs.mkdirSync(path.join(__dirname, '../data'));
}

const db = new Database(dbPath);

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    positionIndex INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )
`);

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

// Helper to set auth cookie
const setAuthCookie = (res: Response, token: string) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE
  });
};

// Authentication middleware with rolling session
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    jwt.verify(token, JWT_SECRET);
    
    // Refresh token on every request (rolling session)
    const newToken = jwt.sign({ authorized: true }, JWT_SECRET, { expiresIn: SESSION_DURATION });
    setAuthCookie(res, newToken);
    
    next();
  } catch (err) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// Login route
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === APP_PASSWORD) {
    const token = jwt.sign({ authorized: true }, JWT_SECRET, { expiresIn: SESSION_DURATION });
    setAuthCookie(res, token);
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid password' });
});

// Logout route
app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

// Auth check route
app.get('/api/auth/check', (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.json({ authenticated: false });

  try {
    jwt.verify(token, JWT_SECRET);
    // Also extend on check
    const newToken = jwt.sign({ authorized: true }, JWT_SECRET, { expiresIn: SESSION_DURATION });
    setAuthCookie(res, newToken);
    res.json({ authenticated: true });
  } catch (err) {
    res.json({ authenticated: false });
  }
});

// Protected routes
app.use('/api/notes', authenticate);

// Get all notes
app.get('/api/notes', (req, res) => {
  const notes = db.prepare('SELECT * FROM notes ORDER BY positionIndex ASC').all();
  res.json(notes);
});

// Create note
app.post('/api/notes', (req, res) => {
  try {
    const input = CreateNoteSchema.parse(req.body);
    const now = new Date().toISOString();
    const newNote = {
      id: uuidv4(),
      ...input,
      createdAt: now,
      updatedAt: now
    };

    const insert = db.prepare(`
      INSERT INTO notes (id, title, content, positionIndex, createdAt, updatedAt)
      VALUES (@id, @title, @content, @positionIndex, @createdAt, @updatedAt)
    `);
    insert.run(newNote);

    res.status(201).json(newNote);
  } catch (error) {
    res.status(400).json({ error: error });
  }
});

// Reorder notes
app.patch('/api/notes/reorder', (req, res) => {
  try {
    const { orders } = req.body; 
    const updatedAt = new Date().toISOString();

    const update = db.prepare('UPDATE notes SET positionIndex = ?, updatedAt = ? WHERE id = ?');
    
    const transaction = db.transaction((data) => {
      for (const item of data) {
        update.run(item.positionIndex, updatedAt, item.id);
      }
    });

    transaction(orders);
    res.json({ message: 'Reordered successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Failed to reorder' });
  }
});

// Update note
app.patch('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  try {
    const input = UpdateNoteSchema.parse(req.body);
    const updatedAt = new Date().toISOString();

    const currentNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    if (!currentNote) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const fields = Object.keys(input).map(key => `${key} = @${key}`).concat('updatedAt = @updatedAt').join(', ');
    const update = db.prepare(`UPDATE notes SET ${fields} WHERE id = @id`);
    
    update.run({ ...input, updatedAt, id });

    const updatedNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    res.json(updatedNote);
  } catch (error) {
    res.status(400).json({ error: error });
  }
});

// Delete all notes
app.delete('/api/notes/clear', authenticate, (req, res) => {
  try {
    db.prepare('DELETE FROM notes').run();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete all notes' });
  }
});

// Delete note
app.delete('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Note not found' });
  }
  
  res.status(204).send();
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
