import request from 'supertest';
import { app, db } from './server';

describe('Notes API', () => {
  beforeEach(() => {
    // Clear database before each test
    db.prepare('DELETE FROM notes').run();
  });

  afterAll(() => {
    db.close();
  });

  describe('Auth', () => {
    it('should login with correct password', async () => {
      const res = await request(app)
        .post('/api/login')
        .set('X-Notes-Requested-With', 'XMLHttpRequest')
        .send({ password: '123' });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should fail login with wrong password', async () => {
      const res = await request(app)
        .post('/api/login')
        .set('X-Notes-Requested-With', 'XMLHttpRequest')
        .send({ password: 'wrong' });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid password');
    });

    it('should reject requests without CSRF header', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ password: '123' });
      
      expect(res.status).toBe(403);
    });
  });

  describe('Public Notes', () => {
    it('should fetch a public note without auth', async () => {
      const id = '00000000-0000-4000-a000-000000000001';
      db.prepare(`
        INSERT INTO notes (id, title, content, positionIndex, isPublic, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, 'Public Note', 'Content', 0, 1, new Date().toISOString(), new Date().toISOString());

      const res = await request(app).get(`/api/public/notes/${id}`);
      
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Public Note');
    });

    it('should fail to fetch a private note without auth', async () => {
      const id = '00000000-0000-4000-a000-000000000002';
      db.prepare(`
        INSERT INTO notes (id, title, content, positionIndex, isPublic, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, 'Private Note', 'Content', 0, 0, new Date().toISOString(), new Date().toISOString());

      const res = await request(app).get(`/api/public/notes/${id}`);
      
      expect(res.status).toBe(404);
    });

    it('should keep sharing flags when a partial update omits them', async () => {
      const id = '00000000-0000-4000-a000-000000000003';
      db.prepare(`
        INSERT INTO notes (id, title, content, positionIndex, isPublic, isPublicEditable, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, 'Editable Note', 'Content', 0, 1, 1, new Date().toISOString(), new Date().toISOString());

      const res = await request(app)
        .patch(`/api/public/notes/${id}`)
        .set('X-Notes-Requested-With', 'XMLHttpRequest')
        .send({ content: 'Edited' });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Edited');
      expect(res.body.isPublic).toBe(1);
      expect(res.body.isPublicEditable).toBe(1);
    });
  });
  describe('Concurrent edits', () => {
    const id = '00000000-0000-4000-a000-000000000010';
    const base = '2026-01-01T00:00:00.000Z';
    let cookie: string[];

    beforeEach(async () => {
      db.prepare(`
        INSERT INTO notes (id, title, content, positionIndex, isPublic, isPublicEditable, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, 'Shared', 'Original', 0, 1, 1, base, base);

      const login = await request(app)
        .post('/api/login')
        .set('X-Notes-Requested-With', 'XMLHttpRequest')
        .send({ password: '123' });
      cookie = login.headers['set-cookie'] as unknown as string[];
    });

    const patch = (body: object, url = `/api/notes/${id}`) =>
      request(app).patch(url).set('Cookie', cookie).set('X-Notes-Requested-With', 'XMLHttpRequest').send(body);

    it('saves an edit based on the current version and bumps updatedAt', async () => {
      const res = await patch({ content: 'Mine', baseUpdatedAt: base });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Mine');
      expect(res.body.updatedAt > base).toBe(true);
    });

    it('rejects an edit based on an outdated version with 409 and the current note', async () => {
      const first = await patch({ content: 'From window A', baseUpdatedAt: base });
      const second = await patch({ content: 'From window B', baseUpdatedAt: base });

      expect(second.status).toBe(409);
      expect(second.body.note.content).toBe('From window A');
      expect(second.body.note.updatedAt).toBe(first.body.updatedAt);
      const stored = db.prepare('SELECT content FROM notes WHERE id = ?').get(id) as { content: string };
      expect(stored.content).toBe('From window A');
    });

    it('applies the same check to public editable notes', async () => {
      await patch({ content: 'Owner edit', baseUpdatedAt: base });
      const res = await request(app)
        .patch(`/api/public/notes/${id}`)
        .set('X-Notes-Requested-With', 'XMLHttpRequest')
        .send({ content: 'Anonymous edit', baseUpdatedAt: base });

      expect(res.status).toBe(409);
      expect(res.body.note.content).toBe('Owner edit');
    });

    it('does not version sharing toggles, so they never cause conflicts', async () => {
      const toggle = await patch({ isPublic: 0 });
      expect(toggle.status).toBe(200);
      expect(toggle.body.updatedAt).toBe(base);

      const edit = await patch({ content: 'Still based on the original', baseUpdatedAt: base });
      expect(edit.status).toBe(200);
    });

    it('does not bump updatedAt when reordering', async () => {
      const res = await patch({ orders: [{ id, positionIndex: 5 }] }, '/api/notes/reorder');
      expect(res.status).toBe(200);

      const stored = db.prepare('SELECT positionIndex, updatedAt FROM notes WHERE id = ?').get(id) as { positionIndex: number; updatedAt: string };
      expect(stored).toEqual({ positionIndex: 5, updatedAt: base });
    });

    it('still accepts edits without a base version', async () => {
      await patch({ content: 'Newer', baseUpdatedAt: base });
      const res = await patch({ content: 'Unversioned' });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Unversioned');
    });

    it('has no delete-all endpoint', async () => {
      await request(app).delete('/api/notes/clear').set('Cookie', cookie).set('X-Notes-Requested-With', 'XMLHttpRequest');

      const count = db.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number };
      expect(count.n).toBe(1);
    });

    it('ignores a client-supplied updatedAt', async () => {
      const res = await patch({ content: 'x', updatedAt: '1999-01-01T00:00:00.000Z', baseUpdatedAt: base });

      expect(res.status).toBe(200);
      expect(res.body.updatedAt > base).toBe(true);
    });
  });
});
