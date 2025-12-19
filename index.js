const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-secret-key-change-this-later';

const pool = new Pool({
  database: 'reading_list'
});

app.use(express.json());

// Middleware to verify JWT
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Sign up
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    throw err;
  }
});

// Log in
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const user = result.rows[0];
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// Protected routes below - all require authentication

// GET all books (only user's books)
app.get('/books', authenticate, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM books WHERE user_id = $1 ORDER BY id',
    [req.userId]
  );
  res.json(result.rows);
});

// GET single book
app.get('/books/:id', authenticate, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM books WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Book not found' });
  }
  res.json(result.rows[0]);
});

// POST new book
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

// PATCH mark as read
app.patch('/books/:id', authenticate, async (req, res) => {
  const { read } = req.body;
  const result = await pool.query(
    'UPDATE books SET read = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [read, req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Book not found' });
  }
  res.json(result.rows[0]);
});

// DELETE book
app.delete('/books/:id', authenticate, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM books WHERE id = $1 AND user_id = $2 RETURNING *',
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Book not found' });
  }
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});