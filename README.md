# Mini Project Management System

A full-stack project management system with Django backend (GraphQL API) and React frontend.

## Features

- **Multi-tenancy**: Organization-based isolation
- **Project Management**: Create and manage projects with status tracking
- **Task Management**: Task board with drag-and-drop functionality
- **Real-time Updates**: WebSocket-based subscriptions for live updates
- **Authentication**: JWT-based authentication system
- **Advanced Filtering**: Search and filter projects/tasks
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Accessibility**: WCAG 2.1 compliant

## Tech Stack

### Backend
- Django 4.2.7
- GraphQL (Graphene-Django)
- PostgreSQL
- Redis (for Channels)
- Django Channels (WebSocket support)
- JWT Authentication

### Frontend
- React 18 with TypeScript
- Apollo Client (GraphQL)
- Tailwind CSS
- Framer Motion (animations)
- React Beautiful DnD (drag and drop)
- React Hook Form (form validation)

## Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL
- Redis

### Also refer to SETUP.md
### Backend Setup

1. Create and activate virtual environment:
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Setup PostgreSQL database:
```bash
# Using Docker (recommended)
docker run --name pm-db -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
docker exec -it pm-db psql -U postgres -c "CREATE DATABASE pm_system;"
```

4. Setup Redis:
```bash
docker run --name pm-redis -p 6379:6379 -d redis
```

5. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your settings
```

6. Run migrations:
```bash
python manage.py makemigrations
python manage.py migrate
```

7. Create superuser:
```bash
python manage.py createsuperuser
```

8. Run development server:
```bash
python manage.py runserver
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm start
```

The application will be available at:
- Backend: http://localhost:8000
- GraphQL Playground: http://localhost:8000/graphql/
- Frontend: http://localhost:3000

