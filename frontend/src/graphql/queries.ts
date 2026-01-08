import { gql } from '@apollo/client';

// Auth Mutations
export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    tokenAuth(email: $email, password: $password) {
      token
    }
  }
`;

export const REGISTER = gql`
  mutation Register($email: String!, $username: String!, $password: String!, $organizationSlug: String) {
    register(
      email: $email
      username: $username
      password: $password
      organizationSlug: $organizationSlug
    ) {
      user {
        id
        email
        username
      }
      token
    }
  }
`;

export const REFRESH_TOKEN = gql`
  mutation RefreshToken($token: String!) {
    refreshToken(token: $token) {
      token
      payload
    }
  }
`;

export const VERIFY_TOKEN = gql`
  mutation VerifyToken($token: String!) {
    verifyToken(token: $token) {
      payload
    }
  }
`;

// Queries
export const GET_ME = gql`
  query GetMe {
    me {
      id
      email
      username
      role {
        id
        name
        permissions
      }
      customPermissions
      organization {
        id
        slug
        name
        isOwner
      }
    }
  }
`;

export const GET_PROJECTS = gql`
  query GetProjects($organizationSlug: String!) {
    projects(organizationSlug: $organizationSlug, first: 100) {
      edges {
        node {
          id
          name
          description
          status
          dueDate
          stats
          createdAt
        }
      }
    }
  }
`;

export const GET_TASKS = gql`
  query GetTasks($projectId: ID!) {
    tasks(projectId: $projectId, first: 100) {
      edges {
        node {
          id
          pk
          title
          description
          status
          priority
          dueDate
          assignees {
            id
            pk
            email
            username
          }
          comments {
            id
            content
            author {
              id
              username
              email
            }
            timestamp
          }
          createdAt
        }
      }
    }
  }
`;

export const GET_USERS = gql`
  query GetUsers {
    users {
      id
      pk
      email
      username
      role {
        id
        pk
        name
        description
        permissions
        isDefault
      }
      customPermissions
    }
  }
`;

// Mutations
export const CREATE_PROJECT = gql`
  mutation CreateProject($organizationSlug: String!, $name: String!, $description: String, $dueDate: Date) {
    createProject(
      organizationSlug: $organizationSlug
      name: $name
      description: $description
      dueDate: $dueDate
    ) {
      project {
        id
        name
        description
        status
      }
    }
  }
`;

export const CREATE_TASK = gql`
  mutation CreateTask($projectId: ID!, $title: String!, $description: String, $priority: String, $assigneeIds: [Int!]) {
    createTask(
      projectId: $projectId
      title: $title
      description: $description
      priority: $priority
      assigneeIds: $assigneeIds
    ) {
      task {
        id
        title
        status
        priority
        assignees {
          id
          username
        }
      }
    }
  }
`;

export const UPDATE_TASK = gql`
  mutation UpdateTask($id: ID!, $status: String, $title: String, $description: String, $priority: String) {
    updateTask(
      id: $id
      status: $status
      title: $title
      description: $description
      priority: $priority
    ) {
      task {
        id
        title
        status
        priority
      }
    }
  }
`;

export const ASSIGN_TASK = gql`
  mutation AssignTask($taskId: Int!, $assigneeIds: [Int!]!) {
    assignTask(taskId: $taskId, assigneeIds: $assigneeIds) {
      task {
        id
        pk
        assignees {
          id
          pk
          username
          email
        }
      }
    }
  }
`;

export const ADD_COMMENT = gql`
  mutation AddComment($taskId: ID!, $content: String!) {
    addComment(taskId: $taskId, content: $content) {
      comment {
        id
        content
        author {
          id
          username
          email
        }
        timestamp
      }
    }
  }
`;

export const CREATE_ORGANIZATION = gql`
  mutation CreateOrganization(
    $name: String!, 
    $contactEmail: String!, 
    $slug: String,
    $adminEmail: String!,
    $adminUsername: String!,
    $adminPassword: String!,
    $adminFirstName: String,
    $adminLastName: String
  ) {
    createOrganization(
      name: $name, 
      contactEmail: $contactEmail, 
      slug: $slug,
      adminEmail: $adminEmail,
      adminUsername: $adminUsername,
      adminPassword: $adminPassword,
      adminFirstName: $adminFirstName,
      adminLastName: $adminLastName
    ) {
      organization {
        id
        name
        slug
        contactEmail
      }
      user {
        id
        email
        username
        firstName
        lastName
      }
      token
    }
  }
`;

export const GET_ROLES = gql`
  query GetRoles {
    roles {
      id
      pk
      name
      description
      permissions
      isDefault
    }
  }
`;

export const CREATE_ROLE = gql`
  mutation CreateRole($name: String!, $description: String, $permissions: JSONString!) {
    createRole(name: $name, description: $description, permissions: $permissions) {
      role {
        id
        name
        description
        permissions
        isDefault
      }
    }
  }
`;

export const UPDATE_ROLE = gql`
  mutation UpdateRole($roleId: Int!, $name: String, $description: String, $permissions: JSONString) {
    updateRole(roleId: $roleId, name: $name, description: $description, permissions: $permissions) {
      role {
        id
        name
        description
        permissions
        isDefault
      }
    }
  }
`;

export const ASSIGN_USER_ROLE = gql`
  mutation AssignUserRole($userId: Int!, $roleId: Int!) {
    assignUserRole(userId: $userId, roleId: $roleId) {
      user {
        id
        pk
        email
        username
        role {
          id
          name
          permissions
        }
      }
    }
  }
`;

export const REMOVE_USER_ROLE = gql`
  mutation RemoveUserRole($userId: Int!) {
    removeUserRole(userId: $userId) {
      user {
        id
        pk
        email
        username
        role {
          id
          name
          permissions
        }
      }
    }
  }
`;

export const SET_USER_PERMISSIONS = gql`
  mutation SetUserPermissions($userId: Int!, $permissions: JSONString!) {
    setUserPermissions(userId: $userId, permissions: $permissions) {
      user {
        id
        pk
        email
        username
        customPermissions
      }
    }
  }
`;
