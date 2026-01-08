import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { GET_PROJECTS, CREATE_PROJECT } from '../../graphql/queries';
import { useAuth } from '../../context/AuthContext';

const Dashboard: React.FC = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const organizationSlug = user?.organization?.slug;

  const { data, loading, error, refetch } = useQuery(GET_PROJECTS, {
    variables: { organizationSlug },
    skip: !organizationSlug, // Skip query if no organization
  }) as any;

  const [createProject, { loading: creating }] = useMutation(CREATE_PROJECT, {
    onCompleted: () => {
      setShowCreateForm(false);
      setName('');
      setDescription('');
      setDueDate('');
      refetch();
    }
  });

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationSlug) {
      console.error('No organization found for user');
      return;
    }
    try {
      console.log('Creating project with:', {
        organizationSlug,
        name,
        description,
        dueDate: dueDate || null
      });

      await createProject({
        variables: {
          organizationSlug,
          name,
          description,
          dueDate: dueDate || null // Send null if no date to debug
        }
      });
    } catch (err: any) {
      console.error('Failed to create project:', err);
      console.error('Error details:', {
        message: err.message,
        graphQLErrors: err.graphQLErrors,
        networkError: err.networkError
      });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Check if user has an organization
  if (!user?.organization) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ color: 'red', marginBottom: '1rem' }}>
          No organization found. Please contact your administrator or create an organization.
        </div>
        <button
          onClick={() => navigate('/create-organization')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Create Organization
        </button>
      </div>
    );
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;
  
  if (error) {
    console.error('GraphQL Error:', error);
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ color: 'red', marginBottom: '1rem' }}>
          Error: {error.message}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          <p>Possible issues:</p>
          <ul>
            <li>Make sure you're logged in</li>
            <li>Check that the organization '{organizationSlug}' exists</li>
            <li>Verify your user is assigned to this organization</li>
          </ul>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>PM System</h1>
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Projects
            </button>
            {/* Show admin navigation for org owners, superusers, or users with admin/manage_roles permissions */}
            {user && (
              user.organization?.isOwner ||
              user.role?.permissions?.admin || 
              user.role?.permissions?.manage_roles ||
              user.customPermissions?.admin ||
              user.customPermissions?.manage_roles
            ) && (
              <button
                onClick={() => navigate('/admin/roles')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'transparent',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Admin Panel
              </button>
            )}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {user?.email}
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '2rem' }}>
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>Projects</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            {showCreateForm ? 'Cancel' : '+ New Project'}
          </button>
        </div>

        {/* Create Project Form */}
        {showCreateForm && (
          <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Create New Project</h3>
            <form onSubmit={handleCreateProject}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Project Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.5 : 1
                }}
              >
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </form>
          </div>
        )}

        {/* Projects Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1.5rem'
        }}>
          {data?.projects?.edges?.map(({ node }: any) => (
            <div
              key={node.id}
              onClick={() => navigate(`/project/${node.id}`)}
              style={{
                backgroundColor: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                {node.name}
              </h3>
              <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {node.description || 'No description'}
              </p>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#6b7280'
              }}>
                <span style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: node.status === 'ACTIVE' ? '#dbeafe' : '#d1fae5',
                  color: node.status === 'ACTIVE' ? '#1e40af' : '#065f46',
                  borderRadius: '4px'
                }}>
                  {node.status}
                </span>
                {node.dueDate && (
                  <span>Due: {new Date(node.dueDate).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {data?.projects?.edges?.length === 0 && (
          <div style={{
            backgroundColor: 'white',
            padding: '3rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <p style={{ fontSize: '1.125rem' }}>No projects yet. Create your first project to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
