# SafeNet Backend

## Project Overview
SafeNet backend powers the Smart Community Resource & Emergency Management Platform.  
It handles authentication, emergency reporting, resource management, notifications, and analytics.

---

## Key Features
- **User Authentication & Roles**: JWT-based authentication with roles (User, Resource Manager, Admin)
- **Emergency Handling**: CRUD operations for emergencies
- **Resource Management**: Register and manage hospitals, shelters, volunteers, etc.
- **Notifications**: Real-time updates via WebSockets, email (SendGrid), and SMS (Twilio)
- **Analytics**: Track trends, response times, and resource usage
- **Offline Sync**: Cache emergency data locally and sync when online

---

## Technology Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (with PostGIS)
- **Authentication**: JWT
- **Realtime**: Socket.io
- **Notifications**: Twilio (SMS), SendGrid (Email)
- **Analytics**: Chart.js / Recharts



### 1. Install Dependencies
```bash
npm install
