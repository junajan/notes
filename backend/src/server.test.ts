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
  });
});
