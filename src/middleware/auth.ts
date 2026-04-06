import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../config/jwt'

export interface AuthRequest extends Request {
  user?: { id: string; role: string; email: string }
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = verifyToken(token)
    req.user = { id: decoded.id, role: decoded.role, email: decoded.email }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    console.log('Auth check — user role:', req.user?.role, '| allowed:', roles)
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Your role "${req.user?.role}" is not allowed. Required: ${roles.join(' or ')}`
      })
    }
    next()
  }
}