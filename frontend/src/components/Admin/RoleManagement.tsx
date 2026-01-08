import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { useAuth } from '../../context/AuthContext';
import { 
  GET_USERS, 
  GET_ROLES, 
  CREATE_ROLE, 
  ASSIGN_USER_ROLE, 
  REMOVE_USER_ROLE,
  SET_USER_PERMISSIONS,
  UPDATE_ROLE 
} from '../../graphql/queries';

// Type definitions
interface Role {
  id: string;
  pk?: number;
  name: string;
  description: string;
  permissions: { [key: string]: boolean };
  isDefault: boolean;
}

interface User {
  id: string;
  pk: number;
  email: string;
  username: string;
  role?: Role;
  customPermissions?: { [key: string]: boolean };
}

interface GetRolesData {
  roles: Role[];
}

interface GetUsersData {
  users: User[];
}

const AVAILABLE_PERMISSIONS = [
  { 
    key: 'create_project', 
    label: 'Create Projects',
    description: 'Allows user to create new projects within their organization'
  },
  { 
    key: 'edit_project', 
    label: 'Edit Projects',
    description: 'Allows user to modify existing project details, status, and settings'
  },
  { 
    key: 'delete_project', 
    label: 'Delete Projects',
    description: 'Allows user to permanently delete projects and all associated data'
  },
  { 
    key: 'create_task', 
    label: 'Create Tasks',
    description: 'Allows user to create new tasks within projects they have access to'
  },
  { 
    key: 'edit_task', 
    label: 'Edit Tasks',
    description: 'Allows user to modify task details, status, priority, and due dates'
  },
  { 
    key: 'delete_task', 
    label: 'Delete Tasks',
    description: 'Allows user to permanently delete tasks and all associated comments'
  },
  { 
    key: 'assign_task', 
    label: 'Assign Tasks',
    description: 'Allows user to assign tasks to other users in the organization'
  },
  { 
    key: 'comment_task', 
    label: 'Comment on Tasks',
    description: 'Allows user to add comments and participate in task discussions'
  },
  { 
    key: 'manage_users', 
    label: 'Manage Users',
    description: 'Allows user to invite, modify, and remove users from the organization'
  },
  { 
    key: 'manage_roles', 
    label: 'Manage Roles',
    description: 'Allows user to create, modify, and delete custom roles and permissions'
  },
  { 
    key: 'view_all', 
    label: 'View All Content',
    description: 'Allows user to view all projects and tasks across the organization'
  },
];

// Role hierarchy and permissions mapping
const ROLE_PERMISSIONS = {
  'Admin': [
    'create_project', 'edit_project', 'delete_project',
    'create_task', 'edit_task', 'delete_task', 'assign_task',
    'comment_task', 'manage_users', 'manage_roles', 'view_all'
  ],
  'Manager': [
    'create_project', 'edit_project',
    'create_task', 'edit_task', 'delete_task', 'assign_task',
    'comment_task', 'view_all'
  ],
  'Member': [
    'create_task', 'edit_task', 'comment_task', 'view_all'
  ],
  'Viewer': [
    'comment_task', 'view_all'
  ]
};

// Function to get permissions a user can grant based on their role
const getGrantablePermissions = (currentUserRole?: string, isOwner?: boolean) => {
  // Organization owners and admins can grant any permission
  if (isOwner || currentUserRole === 'Admin') {
    return AVAILABLE_PERMISSIONS;
  }
  
  // Get permissions for the current user's role
  const rolePermissions = ROLE_PERMISSIONS[currentUserRole as keyof typeof ROLE_PERMISSIONS] || [];
  
  // Filter available permissions to only those the current user has
  return AVAILABLE_PERMISSIONS.filter(perm => rolePermissions.includes(perm.key));
};

export default function RoleManagement() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles');
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // Role form state
  const [newRole, setNewRole] = useState({
    name: '',
    description: '',
    permissions: {} as Record<string, boolean>
  });

  const { data: rolesData, loading: rolesLoading } = useQuery<GetRolesData>(GET_ROLES);
  const { data: usersData, loading: usersLoading } = useQuery<GetUsersData>(GET_USERS);
  
  const [createRole] = useMutation(CREATE_ROLE, {
    refetchQueries: [{ query: GET_ROLES }]
  });
  
  const [assignUserRole] = useMutation(ASSIGN_USER_ROLE, {
    refetchQueries: [{ query: GET_USERS }, { query: GET_ROLES }]
  });

  const [removeUserRole] = useMutation(REMOVE_USER_ROLE, {
    refetchQueries: [{ query: GET_USERS }, { query: GET_ROLES }]
  });

  const [setUserPermissions] = useMutation(SET_USER_PERMISSIONS, {
    refetchQueries: [{ query: GET_USERS }, { query: GET_ROLES }]
  });

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createRole({
        variables: {
          name: newRole.name,
          description: newRole.description,
          permissions: newRole.permissions
        }
      });
      setNewRole({ name: '', description: '', permissions: {} });
      setShowCreateRole(false);
    } catch (err) {
      console.error('Failed to create role:', err);
      alert('Failed to create role. Check your permissions.');
    }
  };

  const handleAssignRole = async (userId: number, roleId: number) => {
    console.log('handleAssignRole called with:', { userId, roleId });
    try {
      const result = await assignUserRole({
        variables: { userId, roleId }
      });
      console.log('Role assignment successful:', result);
    } catch (err) {
      console.error('Failed to assign role:', err);
      alert('Failed to assign role. Check your permissions.');
    }
  };

  const handleRemoveRole = async (userId: number) => {
    console.log('handleRemoveRole called with:', { userId });
    try {
      const result = await removeUserRole({
        variables: { userId }
      });
      console.log('Role removal successful:', result);
    } catch (err) {
      console.error('Failed to remove role:', err);
      alert('Failed to remove role. Check your permissions.');
    }
  };

  const handleUpdateUserPermissions = async (userId: number, permissions: Record<string, boolean>) => {
    console.log('handleUpdateUserPermissions called with:', { userId, permissions });
    
    // Ensure we have a clean permissions object
    const cleanPermissions: Record<string, boolean> = {};
    Object.keys(permissions).forEach(key => {
      if (typeof permissions[key] === 'boolean') {
        cleanPermissions[key] = permissions[key];
      }
    });
    
    console.log('Clean permissions:', cleanPermissions);
    
    try {
      const result = await setUserPermissions({
        variables: { 
          userId, 
          permissions: JSON.stringify(cleanPermissions)
        }
      });
      console.log('Permission update successful:', result);
      
    } catch (err) {
      console.error('Failed to update permissions:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      alert('Failed to update permissions. Check your permissions.');
    }
  };

  if (rolesLoading || usersLoading) {
    return <div style={{ padding: '2rem' }}>Loading...</div>;
  }

  // Get permissions the current user can grant
  const grantablePermissions = getGrantablePermissions(
    currentUser?.role?.name, 
    currentUser?.organization?.isOwner
  );

  const roles = rolesData?.roles || [];
  const users = usersData?.users || [];
  
  // Debug logging
  console.log('Current users data:', users);
  console.log('Current roles data:', roles);
  console.log('AVAILABLE_PERMISSIONS length:', AVAILABLE_PERMISSIONS.length);
  if (users.length > 0) {
    console.log('First user object structure:', JSON.stringify(users[0], null, 2));
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '2rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header with Back Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
          <button
            onClick={() => window.history.back()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ← Back to Dashboard
          </button>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
            Role & Permission Management
          </h1>
        </div>

        {/* Tabs */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ borderBottom: '1px solid #e5e7eb' }}>
            <nav style={{ display: 'flex', gap: '2rem' }}>
              <button
                onClick={() => setActiveTab('roles')}
                style={{
                  padding: '1rem 0',
                  border: 'none',
                  background: 'none',
                  fontSize: '1rem',
                  fontWeight: '500',
                  color: activeTab === 'roles' ? '#3b82f6' : '#6b7280',
                  borderBottom: activeTab === 'roles' ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer'
                }}
              >
                Roles
              </button>
              <button
                onClick={() => setActiveTab('users')}
                style={{
                  padding: '1rem 0',
                  border: 'none',
                  background: 'none',
                  fontSize: '1rem',
                  fontWeight: '500',
                  color: activeTab === 'users' ? '#3b82f6' : '#6b7280',
                  borderBottom: activeTab === 'users' ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer'
                }}
              >
                Users
              </button>
            </nav>
          </div>
        </div>

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>Roles</h2>
              <button
                onClick={() => setShowCreateRole(true)}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Create Role
              </button>
            </div>

            {/* Create Role Form */}
            {showCreateRole && (
              <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                marginBottom: '2rem'
              }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' }}>
                  Create New Role
                </h3>
                <form onSubmit={handleCreateRole}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Role Name
                    </label>
                    <input
                      type="text"
                      value={newRole.name}
                      onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px'
                      }}
                    />
                  </div>
                  
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Description
                    </label>
                    <textarea
                      value={newRole.description}
                      onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', marginBottom: '1rem', fontWeight: '500' }}>
                      Permissions
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                      {grantablePermissions.map((perm) => (
                        <label 
                          key={perm.key} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            position: 'relative'
                          }}
                          title={perm.description}
                        >
                          <input
                            type="checkbox"
                            checked={newRole.permissions[perm.key] || false}
                            onChange={(e) => setNewRole({
                              ...newRole,
                              permissions: {
                                ...newRole.permissions,
                                [perm.key]: e.target.checked
                              }
                            })}
                          />
                          <span style={{ cursor: 'help' }}>{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      type="submit"
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Create Role
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateRole(false)}
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Roles List */}
            <div style={{ display: 'grid', gap: '1rem' }}>
              {roles.map((role: any) => (
                <div
                  key={role.pk}
                  style={{
                    backgroundColor: 'white',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                        {role.name}
                        {role.isDefault && (
                          <span style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#dbeafe',
                            color: '#1e40af',
                            borderRadius: '4px'
                          }}>
                            Default
                          </span>
                        )}
                      </h3>
                      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{role.description}</p>
                      
                      <div>
                        <h4 style={{ fontWeight: '500', marginBottom: '1rem' }}>Permissions:</h4>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                          gap: '0.5rem',
                          backgroundColor: '#f9fafb',
                          padding: '1rem',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb'
                        }}>
                          {AVAILABLE_PERMISSIONS.map((permission) => {
                            const hasPermission = role.permissions?.[permission.key] || false;
                            return (
                              <div
                                key={permission.key}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  padding: '0.5rem',
                                  backgroundColor: hasPermission ? '#ecfdf5' : '#f3f4f6',
                                  borderRadius: '4px',
                                  border: `1px solid ${hasPermission ? '#d1fae5' : '#e5e7eb'}`
                                }}
                                title={permission.description}
                              >
                                <div style={{
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  backgroundColor: hasPermission ? '#10b981' : '#9ca3af',
                                  flexShrink: 0
                                }} />
                                <span style={{
                                  fontSize: '0.875rem',
                                  color: hasPermission ? '#047857' : '#6b7280',
                                  fontWeight: hasPermission ? '500' : '400'
                                }}>
                                  {permission.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '2rem', color: '#1f2937' }}>
              User Management
            </h2>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {users.map((user: any) => (
                <div
                  key={user.pk}
                  style={{
                    backgroundColor: 'white',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '2rem', alignItems: 'flex-start' }}>
                    {/* User Info */}
                    <div>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                        {user.username}
                      </h3>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>{user.email}</p>
                      <p style={{ 
                        marginTop: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: user.role ? '#059669' : '#dc2626'
                      }}>
                        Role: {user.role?.name || 'No Role'}
                      </p>
                    </div>

                    {/* Role Assignment */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        Assign Role
                      </label>
                      <select
                        value={user.role?.pk || ''}
                        onChange={(e) => {
                          const roleId = e.target.value;
                          console.log('Role selection changed:', { userId: user.pk, roleId, parsedRoleId: parseInt(roleId) });
                          
                          if (roleId && !isNaN(parseInt(roleId))) {
                            handleAssignRole(user.pk, parseInt(roleId));
                          } else {
                            // Handle "No Role" case - remove the role
                            handleRemoveRole(user.pk);
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px'
                        }}
                      >
                        <option value="">No Role</option>
                        {roles.map((role: any) => (
                          <option key={role.pk} value={role.pk}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Actions */}
                    <div>
                      <button
                        onClick={() => setSelectedUser(selectedUser?.pk === user.pk ? null : user)}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        {selectedUser?.pk === user.pk ? 'Cancel' : 'Custom Permissions'}
                      </button>
                    </div>
                  </div>

                  {/* Custom Permissions Panel */}
                  {selectedUser?.pk === user.pk && (
                    <div style={{
                      marginTop: '1.5rem',
                      padding: '1.5rem',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <h4 style={{ fontWeight: '600', marginBottom: '1rem' }}>Custom Permissions for {user.username}</h4>
                      {currentUser?.role?.name !== 'Admin' && !currentUser?.organization?.isOwner && (
                        <div style={{ 
                          marginBottom: '1rem', 
                          padding: '0.75rem', 
                          backgroundColor: '#eff6ff', 
                          border: '1px solid #dbeafe', 
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          color: '#1e40af'
                        }}>
                          <strong>Note:</strong> As a {currentUser?.role?.name || 'Member'}, you can only grant permissions that your role has access to.
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                        {grantablePermissions.map((perm, index) => {
                          console.log(`Rendering permission ${index}: ${perm.key} for user ${user.username}`);
                          
                          // Parse custom permissions if it's a string
                          let customPermissions = user.customPermissions;
                          if (typeof customPermissions === 'string') {
                            try {
                              customPermissions = JSON.parse(customPermissions);
                            } catch (e) {
                              customPermissions = {};
                            }
                          }
                          customPermissions = customPermissions || {};
                          
                          // Check if user has this permission through their role
                          const userRoleName = user.role?.name;
                          const roleDefaultPermissions = ROLE_PERMISSIONS[userRoleName as keyof typeof ROLE_PERMISSIONS] || [];
                          const hasViaRole = roleDefaultPermissions.includes(perm.key);
                          const hasViaCustom = customPermissions[perm.key] || false;
                          
                          // Permission is enabled if granted via role OR custom permissions
                          const isChecked = hasViaRole || hasViaCustom;
                          
                          console.log(`Permission ${perm.key}: role=${hasViaRole}, custom=${hasViaCustom}, checked=${isChecked}`);
                          
                          return (
                            <label 
                              key={`${user.pk}-${perm.key}`} 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.5rem',
                                position: 'relative',
                                opacity: hasViaRole ? 0.7 : 1
                              }}
                              title={hasViaRole ? `${perm.description} (Granted by ${userRoleName} role)` : perm.description}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={hasViaRole} // Disable if already granted by role
                                onChange={(e) => {
                                  if (hasViaRole) return; // Can't change role permissions
                                  
                                  const currentPermissions = customPermissions || {};
                                  const newPermissions = {
                                    ...currentPermissions,
                                    [perm.key]: e.target.checked
                                  };
                                  console.log('Updating permissions:', { userId: user.pk, currentPermissions, newPermissions });
                                  handleUpdateUserPermissions(user.pk, newPermissions);
                                }}
                              />
                              <span style={{ cursor: 'help' }}>
                                {perm.label}
                                {hasViaRole && (
                                  <span style={{
                                    marginLeft: '0.5rem',
                                    fontSize: '0.75rem',
                                    color: '#059669',
                                    fontWeight: '500'
                                  }}>
                                    (via {userRoleName})
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}