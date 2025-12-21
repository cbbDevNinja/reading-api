const request = require('supertest');
const express = require('express');
const { Pool } = require('pg');

// We need to extract the app setup from index.js
// For now, let's test against the live API locally

describe('Reading API', () => {
  const API_URL = 'http://localhost:3000';
  let token;

  beforeAll(async () => {
    // Login to get a token
    const res = await request(API_URL)
      .post('/login')
      .send({ email: 'test@example.com', password: 'mypassword123' });
    token = res.body.token;
  });

  describe('GET /books', () => {
    it('should return 401 without token', async () => {
      const res = await request(API_URL).get('/books');
      expect(res.status).toBe(401);
    });

    it('should return books with valid token', async () => {
      const res = await request(API_URL)
        .get('/books')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('books');
      expect(res.body).toHaveProperty('pagination');
    });
  });

  describe('POST /books', () => {
    it('should create a book', async () => {
      const res = await request(API_URL)
        .post('/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Book', author: 'Test Author' });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Book');
    });

    it('should reject without title', async () => {
      const res = await request(API_URL)
        .post('/books')
        .set('Authorization', `Bearer ${token}`)
        .send({ author: 'Test Author' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /books/search', () => {
    it('should find books by title', async () => {
      const res = await request(API_URL)
        .get('/books/search?q=test')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});