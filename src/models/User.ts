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
    findByEmail: async (email: string): Promise<User | null> => {
        const r = await pool.query('SELECT * FROM users WHERE email = $1', [email])
        return r.rows[0] || null
    },

    findById: async (id: string): Promise<User | null> => {
        const r = await pool.query(
            'SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1', [id]
        )
        return r.rows[0] || null
    },

    create: async (data: { name: string; email: string; password: string; phone?: string; role?: string }): Promise<User> => {
        const r = await pool.query(
            `INSERT INTO users (name, email, password, phone, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, phone, role, created_at`,
            [data.name, data.email, data.password, data.phone || null, data.role || 'user']
        )
        return r.rows[0]
    },

    findAll: async (): Promise<User[]> => {
        const r = await pool.query(
            'SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC'
        )
        return r.rows
    },

    updateRole: async (id: string, role: string): Promise<User | null> => {
        const r = await pool.query(
            'UPDATE users SET role=$1, updated_at=NOW() WHERE id=$2 RETURNING id,name,email,role', [role, id]
        )
        return r.rows[0] || null
    },

    updateProfile: async (id: string, data: { name?: string; phone?: string; password?: string }): Promise<User | null> => {
        const fields: string[] = []
        const values: any[] = []
        let i = 1
        if (data.name) { fields.push(`name=$${i++}`); values.push(data.name) }
        if (data.phone !== undefined) { fields.push(`phone=$${i++}`); values.push(data.phone) }
        if (data.password) { fields.push(`password=$${i++}`); values.push(data.password) }
        if (!fields.length) return null
        fields.push(`updated_at=NOW()`)
        values.push(id)
        const r = await pool.query(
            `UPDATE users SET ${fields.join(',')} WHERE id=$${i} RETURNING id,name,email,phone,role,created_at`,
            values
        )
        return r.rows[0] || null
    },

    delete: async (id: string): Promise<boolean> => {
        const r = await pool.query('DELETE FROM users WHERE id=$1', [id])
        return (r.rowCount ?? 0) > 0
    },
}