const request = require('supertest');
const app = require('../src/index'); // Assure-toi que ce fichier exporte app (pas .listen())

describe('API Gateway - Routes simples', () => {
  test('GET /api/health → 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  test('POST /api/auth/login → 200 ou erreur', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: '1234' });
    
    // Tu peux ajuster l'attendu selon ton comportement réel
    expect([200, 502, 404]).toContain(res.status);
  });

  test('GET /api/books → 401 ou autre', async () => {
    const res = await request(app).get('/api/books');
    expect([401, 502, 404]).toContain(res.status);
  });
});
