const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const { createProxyMiddleware } = require("http-proxy-middleware");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("./middlewares/auth");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Routes
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "API Gateway is running" });
});

// Auth Service
app.use(
  "/api/auth",
  createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || "http://localhost:3002",
    changeOrigin: true,
    pathRewrite: { "^/api/auth": "/api" },
    onProxyReq: (proxyReq, req) => {
      if (req.body) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },
    proxyTimeout: 10000,
    onError: (err, req, res) => {
      console.error('Auth Proxy Error:', err);
      res.status(502).json({ error: 'Auth Service Unavailable' });
    }
  })
);

// Books Service - Sans vérification de token
app.use(
  "/api/books",
  createProxyMiddleware({
    target: process.env.BOOKS_SERVICE_URL || "http://localhost:3003",
    pathRewrite: {
      "^/api/books": "/api",
    },
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
      if (req.body) {
        const bodyData = JSON.stringify(req.body)
        proxyReq.setHeader("Content-Type", "application/json")
        proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData))
        proxyReq.write(bodyData)
      }
    },
    proxyTimeout: 10000,
    onError: (err, req, res) => {
      console.error("Books Proxy Error:", err)
      res.status(502).json({ error: "Books Service Unavailable" })
    },
  }),
)



// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: "error", message: "Something went wrong!" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

const server = app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

server.timeout = 10000;

module.exports = app;
