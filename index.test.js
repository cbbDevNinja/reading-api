const request = require('supertest');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Setup test app
const app = express();
const JWT_SECRET = 'test-secret';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/reading_list'
});

app.use(express.json());

// Auth middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Routes
app.get('/books', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  const countResult = await pool.query('SELECT COUNT(*) FROM books WHERE user_id = $1', [req.userId]);
  const total = parseInt(countResult.rows[0].count);
  
  const result = await pool.query(
    'SELECT * FROM books WHERE user_id = $1 ORDER BY id LIMIT $2 OFFSET $3',
    [req.userId, limit, offset]
  );
  
  res.json({
    books: result.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
});

app.get('/books/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Search query required' });
  
  const result = await pool.query(
    'SELECT * FROM books WHERE user_id = $1 AND (title ILIKE $2 OR author ILIKE $2)',
    [req.userId, `%${q}%`]
  );
  res.json(result.rows);
});

app.post('/books', authenticate, async (req, res) => {
  const { title, author } = req.body;
  if (!title || !author) {
    return res.status(400).json({ error: 'Title and author required' });
  }
  const result = await pool.query(
    'INSERT INTO books (title, author, user_id) VALUES ($1, $2, $3) RETURNING *',
    [title, author, req.userId]
  );
  res.status(201).json(result.rows[0]);
});

// Tests
describe('Reading API', () => {
  let token;
  let userId;

  beforeAll(async () => {
    // Create test user
    const hashedPassword = await bcrypt.hash('testpass', 10);
    const userResult = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
      ['testuser@example.com', hashedPassword]
    );
    userId = userResult.rows[0].id;
    token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM books WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  describe('GET /books', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/books');
      expect(res.status).toBe(401);
    });

    it('should return books with valid token', async () => {
      const res = await request(app)
        .get('/books')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('books');
      expect(res.body).toHaveProperty('pagination');
    });
  });

  describe('POST /books', () => {
    it('should create a book', async () => {
      const res = await request(app)
        .post('/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Book', author: 'Test Author' });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Book');
    });

    it('should reject without title', async () => {
      const res = await request(app)
        .post('/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ author: 'Test Author' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /books/search', () => {
    it('should find books by title', async () => {
      const res = await request(app)
        .get('/books/search?q=test')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});