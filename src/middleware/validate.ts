import { Request, Response, NextFunction } from 'express'

// Generic required fields validator
export const requireFields = (fields: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const missing = fields.filter(f => {
            const val = req.body[f]
            return val === undefined || val === null || val === ''
        })
        if (missing.length > 0) {
            return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` })
        }
        next()
    }
}

// Validate emergency report body
export const validateEmergency = (req: Request, res: Response, next: NextFunction) => {
    const { title, type, latitude, longitude } = req.body
    const validTypes = ['medical', 'fire', 'flood', 'accident', 'crime', 'other']

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
        return res.status(400).json({ error: 'Title must be at least 3 characters' })
    }
    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` })
    }
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    if (isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'Invalid latitude' })
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Invalid longitude' })
    }
    next()
}

// Validate register body
export const validateRegister = (req: Request, res: Response, next: NextFunction) => {
    const { name, email, password } = req.body
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' })
    }
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' })
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    next()
}

// Validate resource body
export const validateResource = (req: Request, res: Response, next: NextFunction) => {
    const { name, type, address, latitude, longitude } = req.body
    const validTypes = ['hospital', 'fire_station', 'shelter', 'police', 'volunteer']

    if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Resource name is required' })
    }
    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` })
    }
    if (!address || address.trim().length < 3) {
        return res.status(400).json({ error: 'Address is required' })
    }
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Valid latitude and longitude are required' })
    }
    next()
}