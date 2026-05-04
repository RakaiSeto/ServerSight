# ServerSight

ServerSight is a lightweight monitoring dashboard for Linux servers, Docker containers, and public website health.

## Stack

- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + TanStack Router
- Runtime: Docker Compose

## Quick Start

1. Copy env templates:
   - `backend/.env.example` to `backend/.env`
   - `frontend/.env.example` to `frontend/.env`
2. Start services:

```bash
docker compose up --build
```

3. Open apps:
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:3000/api`

## Prometheus Metrics Source

System metrics on `/api/system/stats` are sourced from Prometheus. Configure these backend environment variables:

- `PROMETHEUS_BASE_URL` (required), example: `http://your-prometheus:9090`
- `PROMETHEUS_TIMEOUT_MS` (optional), default: `5000`

## Default Admin

- Email: `admin@serversight.local`
- Password: `admin123`

Change these values via environment variables before production use.
