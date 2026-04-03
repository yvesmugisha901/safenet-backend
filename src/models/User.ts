import pool from '../config/db'

export interface User {
    id: string
    name: string
    email: string
    password: string
    phone?: string
    role: 'user' | 'resource_manager' | 'admin'
    created_at: string
    updated_at: string
}

export const UserModel = {
    // Find by email
    findByEmail: async (email: string): Promise<User | null> => {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
        return result.rows[0] || null
    },

    // Find by ID
    findById: async (id: string): Promise<User | null> => {
        const result = await pool.query(
            'SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1',
            [id]
        )
        return result.rows[0] || null
    },

    // Create new user
    create: async (data: {
        name: string; email: string; password: string; phone?: string; role?: string
    }): Promise<User> => {
        const result = await pool.query(
            `INSERT INTO users (name, email, password, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, role, created_at`,
            [data.name, data.email, data.password, data.phone || null, data.role || 'user']
        )
        return result.rows[0]
    },

    // Get all users (admin)
    findAll: async (): Promise<User[]> => {
        const result = await pool.query(
            'SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC'
        )
        return result.rows
    },

    // Update role
    updateRole: async (id: string, role: string): Promise<User | null> => {
        const result = await pool.query(
            'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role',
            [role, id]
        )
        return result.rows[0] || null
    },

    // Delete user
    delete: async (id: string): Promise<boolean> => {
        const result = await pool.query('DELETE FROM users WHERE id = $1', [id])
        return (result.rowCount ?? 0) > 0
    },
}