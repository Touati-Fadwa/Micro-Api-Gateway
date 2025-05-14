const request = require('supertest');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

describe('API Gateway - Test d\'Intégration', () => {
  let gateway;
  let authService;
  let booksService;
  const JWT_SECRET = 'test-secret';
  const validToken = jwt.sign({ userId: 123 }, JWT_SECRET);

  // Fonction pour obtenir un port libre améliorée
  const getPort = () => new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });

  beforeAll(async () => {
    try {
      const [authPort, booksPort, gatewayPort] = await Promise.all([
        getPort(),
        getPort(),
        getPort()
      ]);

      // Mock Auth Service
      const authApp = express();
      authApp.use(express.json());
      authApp.post('/api/login', (req, res) => {
        res.json({ token: validToken });
      });
      authService = authApp.listen(authPort);

      // Mock Books Service
      const booksApp = express();
      booksApp.get('/api', (req, res) => {
        if (!req.headers.authorization) {
          return res.status(401).send();
        }
        res.json([{ id: 1, title: "Test Book" }]);
      });
      booksService = booksApp.listen(booksPort);

      // Configuration
      process.env.JWT_SECRET = JWT_SECRET;
      process.env.AUTH_SERVICE_URL = `http://localhost:${authPort}`;
      process.env.BOOKS_SERVICE_URL = `http://localhost:${booksPort}`;

      // Charger l'app après configuration
      const app = require('../src/index');
      gateway = app.listen(gatewayPort);
      process.env.TEST_GATEWAY_URL = `http://localhost:${gatewayPort}`;
    } catch (err) {
      console.error('Erreur during setup:', err);
      throw err;
    }
  });

  afterAll(async () => {
    await Promise.all([
      new Promise(resolve => gateway?.close(resolve)),
      new Promise(resolve => authService?.close(resolve)),
      new Promise(resolve => booksService?.close(resolve))
    ]);
  });

  test('GET /api/health retourne 200', async () => {
    const res = await request(process.env.TEST_GATEWAY_URL).get('/api/health');
    expect(res.status).toBe(200);
  });

  test('POST /api/auth/login proxy vers auth-service', async () => {
    const res = await request(process.env.TEST_GATEWAY_URL)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'test' });
    
    expect(res.status).toBe(200);
    expect(res.body.token).toBe(validToken);
  }, 10000); // Timeout spécifique

  test('GET /api/books nécessite un token valide', async () => {
    // Sans token
    const res1 = await request(process.env.TEST_GATEWAY_URL).get('/api/books');
    expect(res1.status).toBe(401);

    // Avec token
    const res2 = await request(process.env.TEST_GATEWAY_URL)
      .get('/api/books')
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual([{ id: 1, title: "Test Book" }]);
  });
});