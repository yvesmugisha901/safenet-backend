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
    distance_km?: number
    created_at: string
    updated_at: string
}

export const ResourceModel = {
    findAll: async (): Promise<Resource[]> => {
        const r = await pool.query(
            `SELECT res.*, u.name AS manager_name
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       ORDER BY res.name`
        )
        return r.rows
    },

    findById: async (id: string): Promise<Resource | null> => {
        const r = await pool.query(
            `SELECT res.*, u.name AS manager_name
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       WHERE res.id = $1`, [id]
        )
        return r.rows[0] || null
    },

    findByManager: async (managerId: string): Promise<Resource[]> => {
        const r = await pool.query(
            `SELECT res.*, u.name AS manager_name
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       WHERE res.manager_id = $1 ORDER BY res.name`, [managerId]
        )
        return r.rows
    },

    findAvailable: async (): Promise<Resource[]> => {
        const r = await pool.query(
            `SELECT res.*, u.phone AS manager_phone, u.email AS manager_email
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       WHERE res.available = TRUE`
        )
        return r.rows
    },

    create: async (data: {
        name: string; type: string; address: string
        latitude: number; longitude: number
        capacity?: number; phone?: string; manager_id?: string
    }): Promise<Resource> => {
        const r = await pool.query(
            `INSERT INTO resources (name,type,address,latitude,longitude,capacity,phone,manager_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [data.name, data.type, data.address, data.latitude, data.longitude,
            data.capacity || 0, data.phone || null, data.manager_id || null]
        )
        return r.rows[0]
    },

    update: async (id: string, data: Partial<Resource>): Promise<Resource | null> => {
        const fields: string[] = []
        const values: any[] = []
        let i = 1
        if (data.name !== undefined) { fields.push(`name=$${i++}`); values.push(data.name) }
        if (data.available !== undefined) { fields.push(`available=$${i++}`); values.push(data.available) }
        if (data.capacity !== undefined) { fields.push(`capacity=$${i++}`); values.push(data.capacity) }
        if (data.phone !== undefined) { fields.push(`phone=$${i++}`); values.push(data.phone) }
        if (data.address !== undefined) { fields.push(`address=$${i++}`); values.push(data.address) }
        if (!fields.length) return null
        fields.push(`updated_at=NOW()`)
        values.push(id)
        const r = await pool.query(
            `UPDATE resources SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
        )
        return r.rows[0] || null
    },

    delete: async (id: string): Promise<boolean> => {
        const r = await pool.query('DELETE FROM resources WHERE id=$1', [id])
        return (r.rowCount ?? 0) > 0
    },
}