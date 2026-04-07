import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import pool from '../config/db'
import { signToken } from '../config/jwt'
import { AuthRequest } from '../middleware/auth'

export const register = async (req: Request, res: Response) => {
    const { name, email, password, phone, role = 'user' } = req.body
    try {
        const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email])
        if (exists.rows.length) return res.status(400).json({ error: 'Email already registered' })
        const hashed = await bcrypt.hash(password, 12)
        const r = await pool.query(
            `INSERT INTO users (name,email,password,phone,role) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,phone,role,created_at`,
            [name, email, hashed, phone || null, role]
        )
        const user = r.rows[0]
        const token = signToken({ id: user.id, email: user.email, role: user.role })
        res.status(201).json({ user, token })
    } catch (err) {
        console.error('register error:', err)
        res.status(500).json({ error: 'Registration failed' })
    }
}

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body
    try {
        const r = await pool.query('SELECT * FROM users WHERE email=$1', [email])
        const user = r.rows[0]
        if (!user) return res.status(401).json({ error: 'Invalid credentials' })
        const match = await bcrypt.compare(password, user.password)
        if (!match) return res.status(401).json({ error: 'Invalid credentials' })
        const token = signToken({ id: user.id, email: user.email, role: user.role })
        const { password: _, ...safeUser } = user
        res.json({ user: safeUser, token })
    } catch (err) {
        console.error('login error:', err)
        res.status(500).json({ error: 'Login failed' })
    }
}

export const getMe = async (req: AuthRequest, res: Response) => {
    try {
        const r = await pool.query(
            'SELECT id,name,email,phone,role,created_at FROM users WHERE id=$1',
            [req.user!.id]
        )
        if (!r.rows[0]) return res.status(404).json({ error: 'User not found' })
        res.json(r.rows[0])
    } catch (err) {
        res.status(500).json({ error: 'Failed to get user' })
    }
}

export const updateProfile = async (req: AuthRequest, res: Response) => {
    console.log('updateProfile body:', req.body, 'user:', req.user?.id)
    const { name, phone, currentPassword, newPassword } = req.body
    try {
        // Get current user with password
        const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.user!.id])
        const user = r.rows[0]
        if (!user) return res.status(404).json({ error: 'User not found' })

        // Password change requested
        if (newPassword) {
            if (!currentPassword) return res.status(400).json({ error: 'Current password is required' })
            const match = await bcrypt.compare(currentPassword, user.password)
            if (!match) return res.status(400).json({ error: 'Current password is incorrect' })
            if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' })
        }

        const fields: string[] = []
        const values: any[] = []
        let i = 1

        if (name !== undefined && name.trim()) { fields.push(`name=$${i++}`); values.push(name.trim()) }
        if (phone !== undefined) { fields.push(`phone=$${i++}`); values.push(phone || null) }
        if (newPassword) { fields.push(`password=$${i++}`); values.push(await bcrypt.hash(newPassword, 12)) }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

        fields.push('updated_at=NOW()')
        values.push(req.user!.id)

        const updated = await pool.query(
            `UPDATE users SET ${fields.join(',')} WHERE id=$${i} RETURNING id,name,email,phone,role,created_at`,
            values
        )
        console.log('Profile updated:', updated.rows[0])
        res.json(updated.rows[0])
    } catch (err) {
        console.error('updateProfile error:', err)
        res.status(500).json({ error: 'Failed to update profile' })
    }
}

export const getAllUsers = async (_req: Request, res: Response) => {
    try {
        const r = await pool.query('SELECT id,name,email,phone,role,created_at FROM users ORDER BY created_at DESC')
        res.json(r.rows)
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' })
    }
}

export const updateUserRole = async (req: Request, res: Response) => {
    const { id } = req.params
    const { role } = req.body
    const validRoles = ['user', 'resource_manager', 'admin']
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' })
    try {
        const r = await pool.query(
            'UPDATE users SET role=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,email,role',
            [role, id]
        )
        if (!r.rows[0]) return res.status(404).json({ error: 'User not found' })
        res.json(r.rows[0])
    } catch (err) {
        res.status(500).json({ error: 'Failed to update role' })
    }
}