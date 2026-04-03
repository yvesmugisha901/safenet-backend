import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me'

export const signToken = (payload: { id: string; email: string; role: string }): string => {
    return jwt.sign(payload, SECRET, { expiresIn: '7d' } as object)
}

export const verifyToken = (token: string): any => {
    return jwt.verify(token, SECRET)
}