import React, { useState } from 'react';
import { getWebSocket } from '../../websocket';
import { useQuery, useMutation } from '@apollo/client/react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { GET_TASKS, GET_USERS, CREATE_TASK, UPDATE_TASK, ASSIGN_TASK, ADD_COMMENT } from '../../graphql/queries';

const ITEM_TYPE = 'TASK';

interface DragItem {
  id: string;
  status: string;
}

const TaskBoard: React.FC = () => {
    const { projectId: globalProjectId } = useParams<{ projectId: string }>();
    // Use globalProjectId for GraphQL, plainProjectId for WebSocket
    function getPlainProjectId(globalId: string) {
      if (/^\d+$/.test(globalId)) return globalId;
      try {
        const decoded = atob(globalId);
        const parts = decoded.split(":");
        return parts.length > 1 ? parts[1] : globalId;
      } catch {
        return globalId;
      }
    }
    const plainProjectId = getPlainProjectId(globalProjectId || "");
    // Real-time tasks state
    const [realtimeTasks, setRealtimeTasks] = useState<any[]>([]);

    React.useEffect(() => {
      if (!plainProjectId) return;
      const ws = getWebSocket(plainProjectId);

      const handleMessage = (event: MessageEvent) => {
        // Verbose logging for debugging incoming WebSocket payloads
        try {
          console.debug('[WS raw message]', event.data);
        } catch (e) {}
        const data = JSON.parse(event.data);
        console.debug('[WS parsed message]', data);
        if (data.tasks) {
          // Normalize all tasks from WebSocket bulk update
          setRealtimeTasks(data.tasks.map((task: any) => {
            const normId = normalizeId(task.id);
            return {
              ...task,
              id: normId,
              globalId: task.globalId || task.id,
              assignees: task.assignees || [],
              comments: task.comments || [],
            };
          }));
        } else if (data.task) {
          console.debug('[WS single task before normalize]', data.task);
          // Normalize single task from WebSocket
          const task = data.task;
          const normId = normalizeId(task.id);
          const patchedTask = {
            ...task,
            id: normId,
            globalId: task.globalId || task.id,
            assignees: task.assignees || [],
            comments: task.comments || [],
          };
          console.debug('[WS single task after normalize]', patchedTask);
          setRealtimeTasks(prev => {
            const exists = prev.some(t => t.id === normId);
            if (exists) {
              return prev.map(t => t.id === normId ? patchedTask : t);
            }
            return [...prev, patchedTask];
          });
        }
      };
      ws.addEventListener("message", handleMessage);
      return () => {
        ws.removeEventListener("message", handleMessage);
      };
    }, [plainProjectId]);
  const navigate = useNavigate();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [newComment, setNewComment] = useState('');


  // Initial fetch, but no polling
  const { data, loading, error, refetch } = useQuery(GET_TASKS, {
    variables: { projectId: globalProjectId },
    pollInterval: undefined,
  }) as any;

  const { data: usersData } = useQuery(GET_USERS) as any;

  const [createTask, { loading: creating }] = useMutation(CREATE_TASK, {
    onCompleted: () => {
      setShowCreateForm(false);
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      refetch();
    }
  });

  const [updateTask] = useMutation(UPDATE_TASK, {
    onCompleted: () => refetch()
  });

  const [assignTask] = useMutation(ASSIGN_TASK, {
    onCompleted: () => refetch()
  });

  const [addComment] = useMutation(ADD_COMMENT, {
    onCompleted: (data) => {
      setNewComment('');
      refetch().then((result: any) => {
        // Update the selected task with fresh data
        if (selectedTask && result.data) {
          const tasks = result.data.tasks.edges.map((edge: any) => edge.node);
          const updatedTask = tasks.find((t: any) => t.id === selectedTask.id);
          if (updatedTask) {
            setSelectedTask(updatedTask);
          }
        }
      });
    }
  });

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTask({
        variables: {
          projectId: globalProjectId,
          title,
          description,
          priority
        }
      });
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      // Find the globalId for this task
      let globalId = taskId;
      // Search dedupedTasksMap for the globalId
      if (dedupedTasksMap.has(taskId)) {
        globalId = dedupedTasksMap.get(taskId).globalId || taskId;
      } else {
        // Try to find by normalized ID
        for (const [normId, t] of dedupedTasksMap.entries()) {
          if (normId === taskId || t.id === taskId) {
            globalId = t.globalId || t.id;
            break;
          }
        }
      }
      // Ensure we pass a valid global GraphQL ID to the backend
      const gqlId = ensureGlobalId(globalId);
      await updateTask({
        variables: {
          id: gqlId,
          status: newStatus,
        },
      });
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const handleAssignTask = async (taskIdentifier: string | number, assigneeIds: number[]) => {
    if (!assigneeIds || assigneeIds.length === 0) return;
    try {
      // Ensure taskId is a plain integer primary key as backend expects
      const plain = typeof taskIdentifier === 'number' ? taskIdentifier : Number(normalizeId(taskIdentifier));
      if (isNaN(plain)) {
        console.error('Invalid task id for assign:', taskIdentifier);
        return;
      }
      // sanitize assigneeIds: remove null/undefined/non-numeric and dedupe
      const sanitizedAssignees = Array.from(new Set((assigneeIds || [])
        .map(a => (typeof a === 'number' ? a : (a ? Number(a) : NaN)))
        .filter(a => typeof a === 'number' && !isNaN(a))
      ));
      console.debug('[AssignTask] variables', { taskId: plain, assigneeIds: sanitizedAssignees });
      if (sanitizedAssignees.length === 0) {
        console.warn('AssignTask: no valid assignee IDs to send');
        return;
      }
      await assignTask({
        variables: {
          taskId: plain,
          assigneeIds: sanitizedAssignees,
        }
      });
    } catch (err) {
      console.error('Failed to assign task:', err);
      try {
        // Detailed error logging
        // @ts-ignore
        if (err.networkError && err.networkError.result) {
          // @ts-ignore
          console.error('Network result:', err.networkError.result);
        }
        // @ts-ignore
        if (err.graphQLErrors) console.error('GraphQLErrors:', err.graphQLErrors);
      } catch (e) {}
    }
  };

  const handleAddComment = async (taskId: string) => {
    if (!newComment.trim()) return;
    try {
      // Ensure we pass a GraphQL global ID for the task
      const gqlTaskId = ensureGlobalId(taskId);
      await addComment({
        variables: {
          taskId: gqlTaskId,
          content: newComment
        }
      });
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };


  // Dropdown state for assignee checkboxes (must be before any return)
  const [showDropdownId, setShowDropdownId] = useState<string | null>(null);
  const [tempAssignees, setTempAssignees] = useState<Record<string, number[]>>({});

  const handleToggleDropdown = (task: any) => {
    const normId = normalizeId(task.id || task.pk);
    if (showDropdownId === task.id) {
      // closing
      setShowDropdownId(null);
      setTempAssignees(prev => {
        const copy = { ...prev };
        delete copy[normId];
        return copy;
      });
    } else {
      // opening - initialize temp selection from task.assignees
      setShowDropdownId(task.id);
      const current = (task.assignees || []).map((a: any) => a.pk).filter((p: any) => typeof p === 'number');
      setTempAssignees(prev => ({ ...prev, [normId]: Array.from(new Set(current)) }));
    }
  };
  React.useEffect(() => {
    const close = () => setShowDropdownId(null);
    if (showDropdownId !== null) {
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
    }
  }, [showDropdownId]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>Error: {error.message}</div>;

  // Merge real-time updates with initial fetch
  let tasks = [];
  // Build a map of latest tasks by ID (real-time takes precedence)
  const taskMap = new Map();
  if (data?.tasks?.edges) {
    data.tasks.edges.forEach(({ node }: any) => {
      taskMap.set(node.id, node);
    });
  }
  if (realtimeTasks.length > 0) {
    realtimeTasks.forEach((rt) => {
      taskMap.set(rt.id, rt);
    });
  }
  // Use only the latest version of each task
  // Remove duplicates by ID (defensive)
  // Normalize all IDs to plain integer format for deduplication
  function normalizeId(id: any) {
    // Handle numbers
    if (typeof id === 'number') return String(id);
    if (typeof id === 'string') {
      // Plain integer string
      if (/^\d+$/.test(id)) return id;
      // Try base64 decode (GraphQL global ID), then extract trailing number after ':'
      try {
        const decoded = atob(id);
        const parts = decoded.split(':');
        const maybeNum = parts[parts.length - 1];
        if (/^\d+$/.test(maybeNum)) return maybeNum;
      } catch (e) {
        // not base64
      }
      // Fallback: extract first numeric sequence
      const digits = id.match(/\d+/);
      if (digits) return digits[0];
      return id;
    }
    return String(id);
  }

  // Ensure we send a GraphQL global ID (base64) for mutations that expect it
  function ensureGlobalId(id: any) {
    if (!id && id !== 0) return id;
    // already a base64 global id for TaskType
    if (typeof id === 'string' && /^VGFza1R5cGU6/.test(id)) return id;
    const plain = String(id);
    if (/^\d+$/.test(plain)) {
      try {
        return btoa(`TaskType:${plain}`);
      } catch (e) {
        return plain;
      }
    }
    return plain;
  }

  // Always use the latest status for each task by ID
  // Combine initial fetch and real-time updates, then deduplicate by normalized ID
  const allTasks: any[] = [];
  if (data?.tasks?.edges) {
    data.tasks.edges.forEach(({ node }: any) => {
      allTasks.push(node);
    });
  }
  if (realtimeTasks.length > 0) {
    realtimeTasks.forEach((rt) => {
      allTasks.push(rt);
    });
  }
  // Deduplicate by normalized ID, real-time updates take precedence
  const dedupedTasksMap = new Map<string, any>();
  // Store both globalId and normalized id for each task
  allTasks.forEach((task) => {
    const normId = normalizeId(task.id);
    // Prefer an explicit globalId if provided, otherwise keep original id (could be global or plain)
    const globalId = task.globalId || task.id;
    dedupedTasksMap.set(normId, { ...task, id: normId, globalId });
  });
  // If real-time tasks exist, use only those for rendering
  // Always merge real-time updates with initial fetch
  // Build a map of latest tasks by normalized ID
  const mergedTasksMap = new Map<string, any>();
  // Add initial fetch tasks
  Array.from(dedupedTasksMap.values()).forEach(task => {
    mergedTasksMap.set(task.id, task);
  });
  // Overwrite with any real-time updates
  realtimeTasks.forEach(rt => {
    const normId = normalizeId(rt.id);
    // If the task already exists, replace it; otherwise, add it
    mergedTasksMap.set(normId, { ...rt, id: normId, globalId: rt.globalId || rt.id });
  });
  tasks = Array.from(mergedTasksMap.values()).map(node => ({ node }));
  // Debug: Log final deduplicated tasks before rendering
  console.log('[TaskBoard] Final deduplicated tasks:', tasks.map(t => t.node));
  // Debug: Log merged tasks after deduplication
  console.log('[TaskBoard] Merged tasks after deduplication:', tasks.map(t => t.node));
  const users = usersData?.users || [];
  const todoTasks = tasks.filter(({ node }: any) => node.status === 'TODO');
      console.log('[TaskBoard] TODO tasks (render):', todoTasks.map(t => t.node));
    console.log('[TaskBoard] TODO tasks:', todoTasks.map(t => t.node));
  const inProgressTasks = tasks.filter(({ node }: any) => node.status === 'IN_PROGRESS');
      console.log('[TaskBoard] IN_PROGRESS tasks (render):', inProgressTasks.map(t => t.node));
    console.log('[TaskBoard] IN_PROGRESS tasks:', inProgressTasks.map(t => t.node));
  const doneTasks = tasks.filter(({ node }: any) => node.status === 'DONE');
    console.log('[TaskBoard] DONE tasks (render):', doneTasks.map(t => t.node));
  console.log('[TaskBoard] DONE tasks:', doneTasks.map(t => t.node));

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return '#ef4444';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#10b981';
      default: return '#6b7280';
    }
  };

  const DraggableTaskCard = ({ task }: { task: any }) => {
    const [{ isDragging }, drag] = useDrag({
      type: ITEM_TYPE,
      item: { id: task.id, globalId: task.globalId, status: task.status },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });

    return (
      <div
        ref={drag as any}
        style={{
          opacity: isDragging ? 0.5 : 1,
          cursor: 'move',
          backgroundColor: 'white',
          padding: '1rem',
          borderRadius: '6px',
          marginBottom: '0.75rem',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e5e7eb'
        }}
        onClick={() => setSelectedTask(task)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '0.5rem' }}>
          <h4 style={{ 
            fontSize: '0.875rem', 
            fontWeight: '600',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            flex: 1
          }}>
            {task.title}
          </h4>
          <span style={{
            fontSize: '0.625rem',
            padding: '0.125rem 0.5rem',
            backgroundColor: getPriorityColor(task.priority) + '20',
            color: getPriorityColor(task.priority),
            borderRadius: '4px',
            fontWeight: '500',
            flexShrink: 0,
            alignSelf: 'flex-start'
          }}>
            {task.priority}
          </span>
        </div>
        {task.description && (
          <p style={{ 
            fontSize: '0.75rem', 
            color: '#6b7280', 
            marginBottom: '0.5rem',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-wrap',
            maxHeight: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical'
          }}>
            {task.description}
          </p>
        )}
        {task.assignees && task.assignees.length > 0 && (
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
            <span>👥</span>
            <span>{task.assignees.map((a: any) => a.username).join(', ')}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(task.id, e.target.value)}
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              backgroundColor: 'white',
              flex: 1
            }}
          >
            <option value="TODO">To Do</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="DONE">Done</option>
          </select>
          <div style={{ position: 'relative', flex: 1 }}>
            <button
              type="button"
              style={{
                width: '100%',
                padding: '0.25rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: 'white',
                fontSize: '0.75rem',
                textAlign: 'left',
                cursor: 'pointer',
                minHeight: '2.5rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.25rem',
                alignItems: 'center'
              }}
              onClick={e => {
                e.stopPropagation();
                handleToggleDropdown(task);
              }}
            >
              {(task.assignees && task.assignees.length > 0)
                ? task.assignees.map((a: any) => a.username).join(', ')
                : 'Assign user(s)'}
              <span style={{ marginLeft: 'auto', fontSize: '0.9em', color: '#888' }}>▼</span>
            </button>
            {showDropdownId === task.id && (
              <div style={{
                position: 'absolute',
                top: '110%',
                left: 0,
                zIndex: 10,
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                minWidth: '180px',
                maxHeight: '200px',
                overflowY: 'auto',
                padding: '0.5rem'
              }}
                onClick={e => e.stopPropagation()}
              >
                {users.map((user: any) => {
                  const normId = normalizeId(task.id || task.pk);
                  const selected = tempAssignees[normId] || (task.assignees || []).map((a: any) => a.pk);
                  const checked = (selected || []).some((p: any) => p === user.pk);
                  return (
                    <label key={user.pk} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85em', padding: '0.25rem 0' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const norm = normId;
                          setTempAssignees(prev => {
                            const cur = Array.from(new Set(prev[norm] || (task.assignees || []).map((a: any) => a.pk)));
                            const exists = cur.includes(user.pk);
                            const next = exists ? cur.filter((p: number) => p !== user.pk) : [...cur, user.pk];
                            return { ...prev, [norm]: next };
                          });
                        }}
                        style={{ marginRight: '0.5em' }}
                      />
                      {user.username}
                    </label>
                  );
                })}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const norm = normalizeId(task.id || task.pk);
                      const toSave = tempAssignees[norm] || [];
                      if (toSave.length === 0) {
                        if (!window.confirm('Remove all assignees from this task?')) return;
                      } else if (!window.confirm('Save assignment changes?')) return;
                      await handleAssignTask(task.id || task.pk, toSave);
                      setShowDropdownId(null);
                      setTempAssignees(prev => { const copy = { ...prev }; delete copy[norm]; return copy; });
                    }}
                    style={{ padding: '0.25rem 0.5rem', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const norm = normalizeId(task.id || task.pk);
                      setShowDropdownId(null);
                      setTempAssignees(prev => { const copy = { ...prev }; delete copy[norm]; return copy; });
                    }}
                    style={{ padding: '0.25rem 0.5rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {task.comments && task.comments.length > 0 && (
          <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.5rem' }}>
            💬 {task.comments.length} comment{task.comments.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    );
  };

  const DroppableColumn = ({ status, title, color, tasks }: { status: string; title: string; color: string; tasks: any[] }) => {
    const [{ isOver }, drop] = useDrop({
      accept: ITEM_TYPE,
      drop: (item: any) => {
        if (item.status !== status) {
          // Use globalId for mutation
          handleStatusChange(item.globalId || item.id, status);
        }
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
      }),
    });

    return (
      <div ref={drop as any}>
        <div style={{
          backgroundColor: isOver ? color + 'aa' : color,
          padding: '0.75rem',
          borderRadius: '6px',
          marginBottom: '1rem',
          transition: 'background-color 0.2s'
        }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: '600' }}>
            {title} ({tasks.length})
          </h3>
        </div>
        <div style={{
          minHeight: '200px',
          backgroundColor: isOver ? '#f0f0f0' : 'transparent',
          borderRadius: '6px',
          padding: isOver ? '0.5rem' : '0',
          transition: 'all 0.2s'
        }}>
          {tasks.map((task) => {
            // Use the shared normalizeId function for keys
            return <DraggableTaskCard key={normalizeId(task.id)} task={task} />;
          })}
        </div>
      </div>
    );
  };

  // Removed unused renderTaskCard

  return (
    <DndProvider backend={HTML5Backend}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '0.5rem',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem'
            }}
          >
            ← Back
          </button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Task Board</h1>
        </div>
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
          {showCreateForm ? 'Cancel' : '+ New Task'}
        </button>
      </div>

      {/* Create Task Form */}
      {showCreateForm && (
        <div style={{ padding: '2rem' }}>
          <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Create New Task</h3>
            <form onSubmit={handleCreateTask}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Task Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px'
                  }}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
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
                {creating ? 'Creating...' : 'Create Task'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div style={{ padding: '2rem' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1.5rem'
        }}>
          <DroppableColumn
            status="TODO"
            title="TO DO"
            color="#dbeafe"
            tasks={todoTasks.map(({ node }: any) => node)}
          />
          <DroppableColumn
            status="IN_PROGRESS"
            title="IN PROGRESS"
            color="#fef3c7"
            tasks={inProgressTasks.map(({ node }: any) => node)}
          />
          <DroppableColumn
            status="DONE"
            title="DONE"
            color="#d1fae5"
            tasks={doneTasks.map(({ node }: any) => node)}
          />
        </div>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }} onClick={() => setSelectedTask(null)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{selectedTask.title}</h2>
              <button
                onClick={() => setSelectedTask(null)}
                style={{
                  padding: '0.5rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  color: '#6b7280'
                }}
              >
                ×
              </button>
            </div>

            {selectedTask.description && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                  Description
                </h3>
                <p style={{ 
                  fontSize: '0.875rem', 
                  color: '#6b7280',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'pre-wrap'
                }}>
                  {selectedTask.description}
                </p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                  Status
                </h3>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {selectedTask.status.replace('_', ' ')}
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                  Priority
                </h3>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: getPriorityColor(selectedTask.priority) + '20',
                  color: getPriorityColor(selectedTask.priority),
                  borderRadius: '4px',
                  fontWeight: '500'
                }}>
                  {selectedTask.priority}
                </span>
              </div>
              {selectedTask.assignees && selectedTask.assignees.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                    Assigned To
                  </h3>
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {selectedTask.assignees.map((a: any) => a.username).join(', ')}
                  </span>
                </div>
              )}
              {selectedTask.dueDate && (
                <div>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                    Due Date
                  </h3>
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {new Date(selectedTask.dueDate).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Comments Section */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
                Comments ({selectedTask.comments?.length || 0})
              </h3>
              
              <div style={{ marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                {selectedTask.comments && selectedTask.comments.length > 0 ? (
                  selectedTask.comments.map((comment: any) => (
                    <div key={comment.id} style={{
                      backgroundColor: '#f9fafb',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      marginBottom: '0.75rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#374151' }}>
                          {comment.author.username}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                          {new Date(comment.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {comment.content}
                      </p>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>No comments yet.</p>
                )}
              </div>
              {/* New Comment Input */}
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  marginBottom: '0.5rem'
                }}
              />
              <button
                onClick={() => handleAddComment(selectedTask.id)}
                disabled={!newComment.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                  opacity: newComment.trim() ? 1 : 0.5,
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Post Comment
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </DndProvider>
  );
};

export default TaskBoard;
