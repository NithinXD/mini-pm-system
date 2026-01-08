# Project Setup

This document explains everything to do before starting development and preparing the repo for GitHub/production.

## Prerequisites
- Python 3.12 (use pyenv/venv)
- Node 24.12.0 and npm or yarn
- Docker & docker-compose (recommended for Postgres/Redis local setup)

## Environment / Secrets
Create a `.env` (never commit) with values for at least:

- `DJANGO_SECRET_KEY` — keep private
- `DEBUG` — `0`/`False` in production
- `DATABASE_URL` — e.g. `postgres://user:pass@db:5432/dbname`
- `REDIS_URL` — e.g. `redis://redis:6379/0`

## Local Postgres & Redis (Docker quickstart)
Run a local Postgres and Redis with Docker for development:

```bash
# Postgres
docker run -d --name mini_pm_pg -e POSTGRES_USER=pm_user -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=mini_pm -p 5432:5432 postgres:15

# Redis
docker run -d --name mini_pm_redis -p 6379:6379 redis:7
```

DATABASE_URL example for local dev:

```
postgres://pm_user:secret@localhost:5432/mini_pm
```

REDIS_URL example:

```
redis://localhost:6379/0
```

If you prefer, use the provided `docker-compose.yml` at the repo root:

```bash
docker-compose up -d
```

## Backend (Django) Setup
1. Create a virtual environment and activate it:

```bash
python -m venv .venv
# Windows
.\.venv\Scripts\activate
# Unix
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Prepare environment variables: copy an example `.env.example` to `.env` and fill in values.

4. Apply migrations and create a superuser:

```bash
python manage.py migrate
python manage.py createsuperuser
```

5. (Optional) Collect static files for production:

```bash
python manage.py collectstatic --noinput
```

6. Run development server:

```bash
python manage.py runserver 0.0.0.0:8000
daphne backend.asgi:application --port 8000 
```
daphne for websockets

Production notes:
- Use ASGI server (Daphne/Uvicorn) or Gunicorn+ASGI worker depending on your stack. The repo has `asgi.py`.
- Configure allowed hosts and secure settings (`SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, etc.).

If you use Channels/WebSockets, ensure `REDIS_URL` is configured and the channel layer backend is running.

## Frontend (React) Setup
1. Ensure Node is installed (match `frontend/package.json` `engines` if present).
2. From the project root:

```bash
cd frontend
npm install
```

3. Run dev server:

```bash
npm start
```

4. Build for production:

```bash
npm run build
```

The build output goes to `frontend/build/`. Serve that from your webserver or configure Django to serve static files for production.

## Connecting Django to Postgres & Redis
- Ensure `DATABASE_URL` is set in `.env` and your Django settings read it (e.g., with `dj-database-url` or `DATABASES` configured accordingly).
- Example `DATABASES` env variable (Django expects parsed URL):

```
postgres://pm_user:secret@db:5432/mini_pm
```

- Example channel layer settings using Redis:

```python
# settings.py
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [os.environ.get('REDIS_URL', 'redis://localhost:6379')],
        },
    },
}
```

## Docker / docker-compose
The project includes a `docker-compose.yml`. Typical workflow:

```bash
docker-compose up -d --build
```

Provide a `.env` alongside `docker-compose.yml` for DB/Redis credentials used by services.

## Quick Commands Summary

Backend dev:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Frontend dev:
```bash
cd frontend
npm install
npm start
```

Docker quickstart:
```bash
docker-compose up -d
```
