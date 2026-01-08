# GraphQL Endpoints & Operations

Endpoint: `/graphql/` (GraphiQL enabled)

Endpoint URLs (examples):

- Local development: `http://localhost:8000/graphql/` (when `runserver` is on port 8000)
- If running Django with a different host/port, replace `localhost:8000` accordingly.
- Production: `https://your-production-domain.com/graphql/` (use your app domain)

Authentication: JWT via `graphql_jwt`.
- Obtain a token with the `token_auth` mutation (or `register` returns a token).
- Send auth header: `Authorization: JWT <token>` (GraphiQL will also accept a token).

Notes:
- The schema uses Relay nodes for `Project`, `Task`, and `TaskComment` (use global IDs for node fields).
- Many operations require a logged-in user and permission checks (`@login_required` and custom `has_permission` logic).

Queries

- `me: UserType` — current authenticated user
- `users: [UserType]` — all users in current user's organization
- `organization(slug: String!): OrganizationType` — get organization by slug
- `organizations: [OrganizationType]` — list organizations (admin-only)
- `projects(organizationSlug: String!, ...filters): ProjectType` — paginated Relay connection; supports `ProjectFilter` (search, status__in, ordering)
- `project(id: ID!): ProjectType` — Relay node field (global ID)
- `tasks(projectId: ID!, ...filters): TaskType` — paginated Relay connection for tasks in a project; accepts `TaskFilter`
- `task(id: ID!): TaskType` — Relay node field (global ID)
- `comments(taskId: ID!): [TaskCommentType]` — comments for a task
- `roles: [RoleType]` — roles in current user's org
- `role(id: Int!): RoleType` — role by ID

Mutations

- `token_auth(email: String, username: String, password: String): ObtainJSONWebToken` — get JWT token
- `verify_token(token: String): Verify` — verify JWT
- `refresh_token(token: String): Refresh` — refresh JWT
- `register(email: String!, username: String!, password: String!, first_name: String, last_name: String, organization_slug: String): Register` — create user + token

- Organization
  - `create_organization(name: String!, contact_email: String!, admin_email: String!, admin_username: String!, admin_password: String!, slug: String, admin_first_name: String, admin_last_name: String): CreateOrganization` — creates org + admin user + token

- Projects
  - `create_project(organization_slug: String!, name: String!, description: String, status: String, due_date: Date): CreateProject`
  - `update_project(id: ID!, name: String, description: String, status: String, due_date: Date): UpdateProject`

- Tasks
  - `create_task(project_id: ID!, title: String!, description: String, status: String, priority: String, assignee_ids: [Int], due_date: DateTime): CreateTask`
  - `update_task(id: ID!, title: String, description: String, status: String, priority: String, assignee_ids: [Int], due_date: DateTime): UpdateTask`
  - `assign_task(task_id: Int!, assignee_ids: [Int]!): AssignTask` — accepts plain PK or Relay global ID for task id
  - `create_task_comment(task_id: ID!, content: String!): CreateTaskComment`
    - Alias: `add_comment` (same as `create_task_comment`, provided for frontend compatibility)

- Roles & Permissions
  - `create_role(name: String!, description: String, permissions: JSONString!): CreateRole`
  - `update_role(role_id: Int!, name: String, description: String, permissions: JSONString): UpdateRole`
  - `assign_user_role(user_id: Int!, role_id: Int!): AssignUserRole`
  - `remove_user_role(user_id: Int!): RemoveUserRole`
  - `set_user_permissions(user_id: Int!, permissions: JSONString!): SetUserPermissions`

Localhost curl examples (use `http://localhost:8000/graphql/`)

Use `curl` to POST GraphQL queries/mutations to the local endpoint. Replace `<JWT>` with the token from `tokenAuth`.

- Obtain token (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { tokenAuth(email:\"admin@example.com\", password:\"secret\") { token } }"}'
```

- Register (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { register(email:\"u@example.com\", username:\"user1\", password:\"secret\") { token user { id email } } }"}'
```

- Query `me` (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { me { id email username } }"}'
```

- Create organization (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { createOrganization(name:\"Acme\", contactEmail:\"admin@acme.test\", adminEmail:\"admin@acme.test\", adminUsername:\"acmeadmin\", adminPassword:\"secret\") { organization { id slug name } token user { id email } } }"}'
```

- Create project (curl) — requires auth:

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { createProject(organizationSlug:\"acme\", name:\"Website\", description:\"Build site\") { project { id name } } }"}'
```

- Create task (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { createTask(projectId:\"UHJvamVjdFR5cGU6MQ==\", title:\"New task\", description:\"Details\") { task { id title } } }"}'
```

- Assign task (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { assignTask(taskId:1, assigneeIds:[2,3]) { task { id title assignees { id email } } } }"}'
```

- Add comment to task (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { createTaskComment(taskId:\"UHJvamVjdFR5cGU6MQ==\", content:\"Looks good\") { comment { id content author { id email } } } }"}'
```

Notes on Relay IDs
- Node fields like `project`/`task`/`comment` expect Relay global IDs. You can pass plain numeric PKs in many mutations (the code tries to accept both), but queries like `project(id: ID!)` expect global IDs.


Auth & permissions
- Most `resolve_` methods and many mutations are decorated with `@login_required` and additional permission checks. Use JWT obtained from `token_auth` or `register` to authenticate.


- Query `users` (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { users { id email username } }"}'
```

- Query `organization(slug)` (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { organization(slug:\"acme\") { id name slug contactEmail } }"}'
```

- Query `organizations` (curl) — admin only:

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { organizations { id name slug } }"}'
```

- Query `projects` with filters (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { projects(organizationSlug:\"acme\", status__in:\"open,backlog\") { edges { node { id name status } } } }"}'
```

- Query `project(id)` (curl) — Relay node ID:

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { project(id:\"UHJvamVjdFR5cGU6MQ==\") { id name description status } }"}'
```

- Query `tasks(projectId)` (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { tasks(projectId:\"UHJvamVjdFR5cGU6MQ==\") { edges { node { id title status } } } }"}'
```

- Query `task(id)` (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { task(id:\"VGFza1R5cGU6MQ==\") { id title description assignees { id email } comments { id content } } }"}'
```

- Query `comments(taskId)` (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { comments(taskId:\"VGFza1R5cGU6MQ==\") { id content author { id email } } }"}'
```

- Query `roles` (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { roles { id name permissions } }"}'
```

- Query `role(id)` (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"query { role(id:1) { id name permissions } }"}'
```

- Verify token (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { verifyToken(token:\"<JWT>\") { payload } }"}'
```

- Refresh token (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { refreshToken(token:\"<JWT>\") { token } }"}'
```

- Update project (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { updateProject(id:\"UHJvamVjdFR5cGU6MQ==\", name:\"Updated\") { project { id name } } }"}'
```

- Update task (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { updateTask(id:\"VGFza1R5cGU6MQ==\", title:\"Updated title\") { task { id title } } }"}'
```

- Create role (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { createRole(name:\"Viewer\", permissions:\"{}\") { role { id name permissions } } }"}'
```

- Update role (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { updateRole(roleId:1, name:\"Editor\") { role { id name } } }"}'
```

- Assign user role (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { assignUserRole(userId:2, roleId:1) { user { id email role { id name } } } }"}'
```

- Remove user role (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { removeUserRole(userId:2) { user { id email role } } }"}'
```

- Set user permissions (curl):

```bash
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: JWT <JWT>" \
  -d '{"query":"mutation { setUserPermissions(userId:2, permissions:\"{\\\"edit_task\\\": true}\") { user { id email customPermissions } } }"}'
```

---

GraphQL schema (SDL summary)

You can introspect the full schema at the GraphiQL UI (`http://localhost:8000/graphql/`). Below is a concise SDL-style summary of the main types, queries and mutations implemented in `pm_app/schema.py`.

```graphql
# Core types
type RoleType {
  id: ID
  pk: Int
  name: String
  description: String
  permissions: JSONString
  is_default: Boolean
  organization: OrganizationType
  created_at: DateTime
}

type UserType {
  id: ID
  pk: Int
  email: String
  username: String
  first_name: String
  last_name: String
  organization: OrganizationType
  role: RoleType
  custom_permissions: JSONString
  is_active: Boolean
}

type OrganizationType {
  id: ID
  name: String
  slug: String
  contact_email: String
  created_at: DateTime
  updated_at: DateTime
  is_owner: Boolean
}

type ProjectType implements Node {
  id: ID
  organization: OrganizationType
  name: String
  description: String
  status: String
  due_date: Date
  created_by: UserType
  created_at: DateTime
  updated_at: DateTime
  stats: JSONString
}

type TaskType implements Node {
  id: ID
  pk: Int
  project: ProjectType
  title: String
  description: String
  status: String
  priority: String
  due_date: DateTime
  created_by: UserType
  created_at: DateTime
  updated_at: DateTime
  comments: [TaskCommentType]
  assignees: [UserType]
}

type TaskCommentType implements Node {
  id: ID
  pk: Int
  task: TaskType
  content: String
  author: UserType
  timestamp: DateTime
  updated_at: DateTime
}

# Query root (main fields)
type Query {
  me: UserType
  users: [UserType]
  organization(slug: String!): OrganizationType
  organizations: [OrganizationType]
  projects(organizationSlug: String!, ...filters): ProjectConnection
  project(id: ID!): ProjectType
  tasks(projectId: ID!, ...filters): TaskConnection
  task(id: ID!): TaskType
  comments(taskId: ID!): [TaskCommentType]
  roles: [RoleType]
  role(id: Int!): RoleType
}

# Mutation root (main fields)
type Mutation {
  # Auth
  tokenAuth(email: String, username: String, password: String): ObtainJSONWebToken
  verifyToken(token: String): Verify
  refreshToken(token: String): Refresh
  register(email: String!, username: String!, password: String!, first_name: String, last_name: String, organization_slug: String): Register

  # Organization
  createOrganization(name: String!, contactEmail: String!, adminEmail: String!, adminUsername: String!, adminPassword: String!, slug: String, adminFirstName: String, adminLastName: String): CreateOrganization

  # Projects
  createProject(organizationSlug: String!, name: String!, description: String, status: String, dueDate: Date): CreateProject
  updateProject(id: ID!, name: String, description: String, status: String, dueDate: Date): UpdateProject

  # Tasks
  createTask(projectId: ID!, title: String!, description: String, status: String, priority: String, assigneeIds: [Int], dueDate: DateTime): CreateTask
  updateTask(id: ID!, title: String, description: String, status: String, priority: String, assigneeIds: [Int], dueDate: DateTime): UpdateTask
  assignTask(taskId: Int!, assigneeIds: [Int]!): AssignTask
  createTaskComment(taskId: ID!, content: String!): CreateTaskComment
  addComment(taskId: ID!, content: String!): CreateTaskComment

  # Roles & Permissions
  createRole(name: String!, description: String, permissions: JSONString!): CreateRole
  updateRole(roleId: Int!, name: String, description: String, permissions: JSONString): UpdateRole
  assignUserRole(userId: Int!, roleId: Int!): AssignUserRole
  removeUserRole(userId: Int!): RemoveUserRole
  setUserPermissions(userId: Int!, permissions: JSONString!): SetUserPermissions
}
```
