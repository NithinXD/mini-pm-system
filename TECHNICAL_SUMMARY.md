## Technical Summary

This document summarizes the architecture, important design decisions, trade-offs made, and suggested future improvements for the project.

### Architecture Overview
- Backend: Django with Channels (ASGI) providing HTTP + WebSocket support. GraphQL API implemented with `graphene-django` and `graphql_jwt` for authentication.
- Frontend: React (TypeScript) single-page app in `frontend/` built with the standard React toolchain.
- Data stores: Postgres (production) and Redis (Channel layer, caching, pub/sub).
- Dev/local convenience: `docker-compose.yml` included to bring up Postgres and Redis.

### Key Decisions
- Use Django + Graphene for a single unified backend handling auth, business logic, and GraphQL schema. This reduces duplication and keeps domain logic in one place.
- Use JWT (`graphql_jwt`) for stateless authentication; integrates with GraphQL flows and mobile/web clients easily.
- Use Channels + Redis for real-time updates (task create/update/comment flows). Chosen for maturity and close integration with Django.
- React frontend served separately during development; production build can be served by Django static files or a CDN/web server.

### Trade-offs
- JWT vs session cookies:
  - JWT is convenient for APIs and websockets but requires careful rotation and revocation strategies.
  - Cookie-based sessions are simpler for server-rendered auth and automatic CSRF protection.

- Local dev uses sqlite in early stages vs recommending Postgres for production. Sqlite is easy for quick dev but lacks concurrency and advanced features.