import pool from '../config/db'

export interface Resource {
    id: string
    name: string
    type: 'hospital' | 'fire_station' | 'shelter' | 'police' | 'volunteer'
    address: string
    latitude: number
    longitude: number
    capacity: number
    available: boolean
    phone?: string
    manager_id?: string
    manager_name?: string
    created_at: string
    updated_at: string
}

export const ResourceModel = {
    findAll: async (): Promise<Resource[]> => {
        const result = await pool.query(
            `SELECT r.*, u.name AS manager_name
       FROM resources r
       LEFT JOIN users u ON u.id = r.manager_id
       ORDER BY r.name`
        )
        return result.rows
    },

    findById: async (id: string): Promise<Resource | null> => {
        const result = await pool.query(
            `SELECT r.*, u.name AS manager_name
       FROM resources r
       LEFT JOIN users u ON u.id = r.manager_id
       WHERE r.id = $1`,
            [id]
        )
        return result.rows[0] || null
    },

    findAvailable: async (): Promise<Resource[]> => {
        const result = await pool.query(
            `SELECT r.*, u.phone AS manager_phone, u.email AS manager_email
       FROM resources r
       LEFT JOIN users u ON u.id = r.manager_id
       WHERE r.available = TRUE`
        )
        return result.rows
    },

    create: async (data: {
        name: string; type: string; address: string
        latitude: number; longitude: number
        capacity?: number; phone?: string; manager_id?: string
    }): Promise<Resource> => {
        const result = await pool.query(
            `INSERT INTO resources (name, type, address, latitude, longitude, capacity, phone, manager_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [data.name, data.type, data.address, data.latitude, data.longitude,
            data.capacity || 0, data.phone || null, data.manager_id || null]
        )
        return result.rows[0]
    },

    update: async (id: string, data: Partial<Resource>): Promise<Resource | null> => {
        const fields: string[] = []
        const values: any[] = []
        let i = 1
        if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name) }
        if (data.available !== undefined) { fields.push(`available = $${i++}`); values.push(data.available) }
        if (data.capacity !== undefined) { fields.push(`capacity = $${i++}`); values.push(data.capacity) }
        if (data.phone !== undefined) { fields.push(`phone = $${i++}`); values.push(data.phone) }
        if (fields.length === 0) return null
        fields.push(`updated_at = NOW()`)
        values.push(id)
        const result = await pool.query(
            `UPDATE resources SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        )
        return result.rows[0] || null
    },

    delete: async (id: string): Promise<boolean> => {
        const result = await pool.query('DELETE FROM resources WHERE id = $1', [id])
        return (result.rowCount ?? 0) > 0
    },
}