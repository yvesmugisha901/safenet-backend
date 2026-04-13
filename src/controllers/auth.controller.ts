import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import pool from '../config/db'
import { signToken } from '../config/jwt'
import { AuthenticatedRequest } from '../middleware/auth'

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
    } catch (err: any) {
        console.error('register error:', err.message)
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
    } catch (err: any) {
        console.error('login error:', err.message)
        res.status(500).json({ error: 'Login failed' })
    }
}

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const r = await pool.query(
            'SELECT id,name,email,phone,role,created_at FROM users WHERE id=$1',
            [req.user!.id]
        )
        if (!r.rows[0]) return res.status(404).json({ error: 'User not found' })
        res.json(r.rows[0])
    } catch (err: any) {
        console.error('getMe error:', err.message)
        res.status(500).json({ error: 'Failed to get user' })
    }
}

export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
    const { name, phone, currentPassword, newPassword } = req.body
    console.log('updateProfile called — userId:', req.user?.id, '| body keys:', Object.keys(req.body))
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE id=$1', [req.user!.id])
        if (!userRes.rows[0]) return res.status(404).json({ error: 'User not found' })
        const user = userRes.rows[0]

        const setClauses: string[] = []
        const vals: any[] = []
        let idx = 1

        if (name && name.trim()) {
            setClauses.push(`name=$${idx++}`)
            vals.push(name.trim())
        }
        if (phone !== undefined) {
            setClauses.push(`phone=$${idx++}`)
            vals.push(phone.trim() || null)
        }
        if (newPassword) {
            if (!currentPassword) return res.status(400).json({ error: 'Current password is required to change password' })
            const ok = await bcrypt.compare(currentPassword, user.password)
            if (!ok) return res.status(400).json({ error: 'Current password is incorrect' })
            if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' })
            setClauses.push(`password=$${idx++}`)
            vals.push(await bcrypt.hash(newPassword, 12))
        }

        if (setClauses.length === 0) return res.status(400).json({ error: 'Nothing to update' })

        setClauses.push(`updated_at=NOW()`)
        vals.push(req.user!.id)

        const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id=$${idx} RETURNING id,name,email,phone,role,created_at`
        console.log('updateProfile SQL:', sql, '| vals count:', vals.length)

        const updated = await pool.query(sql, vals)
        console.log('updateProfile success:', updated.rows[0]?.name)
        res.json(updated.rows[0])
    } catch (err: any) {
        console.error('updateProfile ERROR:', err.message, err.stack)
        res.status(500).json({ error: `Failed to update profile: ${err.message}` })
    }
}

export const getAllUsers = async (_req: Request, res: Response) => {
    try {
        const r = await pool.query('SELECT id,name,email,phone,role,created_at FROM users ORDER BY created_at DESC')
        res.json(r.rows)
    } catch (err: any) {
        console.error('getAllUsers error:', err.message)
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
    } catch (err: any) {
        console.error('updateUserRole error:', err.message)
        res.status(500).json({ error: 'Failed to update role' })
    }
}