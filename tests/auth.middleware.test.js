const jwt = require("jsonwebtoken")
const { verifyToken } = require("../src/middlewares/auth")

// Mock de jsonwebtoken
jest.mock("jsonwebtoken")

describe("Auth Middleware", () => {
  let req, res, next

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()

    // Setup request, response, and next function
    req = {
      headers: {},
    }

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    next = jest.fn()

    // Mock process.env
    process.env.JWT_SECRET = "test-secret"
  })

  test("should return 401 if no authorization header is present", () => {
    verifyToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: "Accès non autorisé. Token manquant." })
    expect(next).not.toHaveBeenCalled()
  })

  test("should return 401 if authorization header has invalid format", () => {
    req.headers.authorization = "Invalid-format"

    verifyToken(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: "Accès non autorisé. Format de token invalide." })
    expect(next).not.toHaveBeenCalled()
  })

  test("should return 401 if token is invalid", () => {
    req.headers.authorization = "Bearer invalid-token"

    // Mock jwt.verify to throw an error
    jwt.verify.mockImplementation(() => {
      throw new Error("Invalid token")
    })

    verifyToken(req, res, next)

    expect(jwt.verify).toHaveBeenCalledWith("invalid-token", "test-secret")
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ message: "Token invalide ou expiré." })
    expect(next).not.toHaveBeenCalled()
  })

  test("should set user in request and call next if token is valid", () => {
    req.headers.authorization = "Bearer valid-token"

    const decodedToken = { id: 1, email: "test@example.com", role: "admin" }

    // Mock jwt.verify to return a decoded token
    jwt.verify.mockReturnValue(decodedToken)

    verifyToken(req, res, next)

    expect(jwt.verify).toHaveBeenCalledWith("valid-token", "test-secret")
    expect(req.user).toEqual(decodedToken)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })
})
