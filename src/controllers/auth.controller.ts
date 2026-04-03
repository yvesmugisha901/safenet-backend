import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { UserModel } from '../models/User'
import { signToken } from '../config/jwt'

export const register = async (req: Request, res: Response) => {
    const { name, email, password, phone, role = 'user' } = req.body
    try {
        const existing = await UserModel.findByEmail(email)
        if (existing) return res.status(400).json({ error: 'Email already registered' })

        const hashed = await bcrypt.hash(password, 12)
        const user = await UserModel.create({ name, email, password: hashed, phone, role })
        const token = signToken({ id: user.id, email: user.email, role: user.role })
        res.status(201).json({ user, token })
    } catch (err) {
        console.error('Register error:', err)
        res.status(500).json({ error: 'Registration failed' })
    }
}

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body
    try {
        const user = await UserModel.findByEmail(email)
        if (!user) return res.status(401).json({ error: 'Invalid credentials' })

        const match = await bcrypt.compare(password, user.password)
        if (!match) return res.status(401).json({ error: 'Invalid credentials' })

        const token = signToken({ id: user.id, email: user.email, role: user.role })
        const { password: _, ...safeUser } = user
        res.json({ user: safeUser, token })
    } catch (err) {
        console.error('Login error:', err)
        res.status(500).json({ error: 'Login failed' })
    }
}

export const getMe = async (req: any, res: Response) => {
    try {
        const user = await UserModel.findById(req.user.id)
        if (!user) return res.status(404).json({ error: 'User not found' })
        res.json(user)
    } catch (err) {
        res.status(500).json({ error: 'Failed to get user' })
    }
}

export const getAllUsers = async (_req: Request, res: Response) => {
    try {
        const users = await UserModel.findAll()
        res.json(users)
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' })
    }
}

export const updateUserRole = async (req: Request, res: Response) => {
    const { id } = req.params
    const { role } = req.body
    const validRoles = ['user', 'resource_manager', 'admin']
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' })
    }
    try {
        const user = await UserModel.updateRole(id, role)
        if (!user) return res.status(404).json({ error: 'User not found' })
        res.json(user)
    } catch (err) {
        res.status(500).json({ error: 'Failed to update role' })
    }
}