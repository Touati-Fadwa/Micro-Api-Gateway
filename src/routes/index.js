const express = require("express")
const router = express.Router()

// Health check route
router.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "API Gateway is running" })
})

module.exports = router
