"""
GraphQL schema for the project management system.
Includes queries, mutations, subscriptions, and authentication.
"""
import graphene
from graphene_django import DjangoObjectType
from graphene_django.filter import DjangoFilterConnectionField
from django_filters import FilterSet, OrderingFilter, CharFilter, DateFilter, DateTimeFilter
from django.contrib.auth import get_user_model
from django.db.models import Q
import graphql_jwt
from graphql_jwt.decorators import login_required
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from graphql_relay import to_global_id

from .models import Organization, Project, Task, TaskComment, Role

User = get_user_model()


# Type Definitions
class RoleType(DjangoObjectType):
    """GraphQL type for Role model."""
    pk = graphene.Int()
    
    class Meta:
        model = Role
        fields = ('id', 'name', 'description', 'permissions', 'is_default', 'organization', 'created_at')
    
    def resolve_pk(self, info):
        return self.pk


class UserType(DjangoObjectType):
    """GraphQL type for User model."""
    pk = graphene.Int()
    role = graphene.Field(lambda: RoleType)
    
    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'first_name', 'last_name', 'organization', 'role', 'custom_permissions', 'is_active')
    
    def resolve_pk(self, info):
        return self.pk


class OrganizationType(DjangoObjectType):
    """GraphQL type for Organization model."""
    is_owner = graphene.Boolean()
    
    class Meta:
        model = Organization
        fields = ('id', 'name', 'slug', 'contact_email', 'created_at', 'updated_at')
    
    def resolve_is_owner(self, info):
        """Check if the current user is the owner of this organization."""
        if not info.context.user.is_authenticated:
            return False
        return self.owner == info.context.user


class ProjectType(DjangoObjectType):
    """GraphQL type for Project model."""
    stats = graphene.JSONString()

    class Meta:
        model = Project
        interfaces = (graphene.relay.Node,)
        fields = ('id', 'organization', 'name', 'description', 'status', 'due_date', 
                  'created_by', 'created_at', 'updated_at')

    def resolve_stats(self, info):
        return self.get_stats()


class TaskType(DjangoObjectType):
    """GraphQL type for Task model."""
    pk = graphene.Int()
    comments = graphene.List(lambda: TaskCommentType)
    assignees = graphene.List(lambda: UserType)
    
    class Meta:
        model = Task
        interfaces = (graphene.relay.Node,)
        fields = ('id', 'project', 'title', 'description', 'status', 'priority', 
                  'due_date', 'created_by', 'created_at', 'updated_at')
    
    def resolve_pk(self, info):
        return self.pk
    
    def resolve_comments(self, info):
        return self.comments.all()
    
    def resolve_assignees(self, info):
        return self.assignees.all()


class TaskCommentType(DjangoObjectType):
    """GraphQL type for TaskComment model."""
    class Meta:
        model = TaskComment
        interfaces = (graphene.relay.Node,)
        fields = ('id', 'task', 'content', 'author', 'timestamp', 'updated_at')
    
    @property
    def created_at(self):
        return self.timestamp


# Filters
class ProjectFilter(FilterSet):
    """Filter for projects with search and ordering."""
    status__in = CharFilter(method='filter_status_in')
    search = CharFilter(method='filter_search')
    
    class Meta:
        model = Project
        fields = {
            'status': ['exact'],
            'due_date': ['gt', 'lt', 'gte', 'lte'],
            'created_at': ['gt', 'lt', 'gte', 'lte'],
        }
    
    order_by = OrderingFilter(fields=('due_date', 'created_at', 'name'))
    
    def filter_status_in(self, queryset, name, value):
        statuses = value.split(',')
        return queryset.filter(status__in=statuses)
    
    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(name__icontains=value) | Q(description__icontains=value)
        )


class TaskFilter(FilterSet):
    """Filter for tasks with search and ordering."""
    status__in = CharFilter(method='filter_status_in')
    search = CharFilter(method='filter_search')
    
    class Meta:
        model = Task
        fields = {
            'status': ['exact'],
            'priority': ['exact'],
            'due_date': ['gt', 'lt', 'gte', 'lte'],
            'created_at': ['gt', 'lt', 'gte', 'lte'],
        }
    
    order_by = OrderingFilter(fields=('due_date', 'created_at', 'priority', 'title'))
    
    def filter_status_in(self, queryset, name, value):
        statuses = value.split(',')
        return queryset.filter(status__in=statuses)
    
    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(title__icontains=value) | Q(description__icontains=value)
        )


# Queries
class Query(graphene.ObjectType):
    """GraphQL queries."""
    
    # Authentication
    me = graphene.Field(UserType)
    users = graphene.List(UserType)
    
    # Organizations
    organization = graphene.Field(
        OrganizationType, 
        slug=graphene.String(required=True)
    )
    organizations = graphene.List(OrganizationType)
    
    # Projects
    projects = DjangoFilterConnectionField(
        ProjectType,
        filterset_class=ProjectFilter,
        organization_slug=graphene.String(required=True)
    )
    project = graphene.relay.Node.Field(ProjectType)
    
    # Tasks
    tasks = DjangoFilterConnectionField(
        TaskType,
        filterset_class=TaskFilter,
        project_id=graphene.ID(required=True)
    )
    task = graphene.relay.Node.Field(TaskType)
    
    # Comments
    comments = graphene.List(
        TaskCommentType,
        task_id=graphene.ID(required=True)
    )
    
    # Roles & Permissions
    roles = graphene.List(RoleType)
    role = graphene.Field(RoleType, id=graphene.Int(required=True))

    @login_required
    def resolve_me(self, info):
        """Get current authenticated user."""
        return info.context.user

    @login_required
    def resolve_users(self, info):
        """Get all users in the current user's organization."""
        user = info.context.user
        if user.organization:
            return User.objects.filter(organization=user.organization)
        return User.objects.none()

    @login_required
    def resolve_organization(self, info, slug):
        """Get organization by slug."""
        user = info.context.user
        try:
            org = Organization.objects.get(slug=slug)
            # Check if user belongs to this organization
            if user.organization == org or user.is_superuser:
                return org
            return None
        except Organization.DoesNotExist:
            return None

    @login_required
    def resolve_organizations(self, info):
        """Get all organizations (admin only)."""
        user = info.context.user
        if user.is_superuser:
            return Organization.objects.all()
        elif user.organization:
            return [user.organization]
        return []

    @login_required
    def resolve_projects(self, info, organization_slug, **kwargs):
        """Get projects for an organization."""
        user = info.context.user
        try:
            org = Organization.objects.get(slug=organization_slug)
            # Check if user belongs to this organization
            if user.organization == org or user.is_superuser:
                return Project.objects.filter(organization=org)
            return Project.objects.none()
        except Organization.DoesNotExist:
            return Project.objects.none()

    @login_required
    def resolve_tasks(self, info, project_id, **kwargs):
        """Get tasks for a project."""
        user = info.context.user
        from graphql_relay import from_global_id
        _, pk = from_global_id(project_id)
        
        try:
            project = Project.objects.get(pk=pk)
            # Check if user belongs to the project's organization
            if user.organization == project.organization or user.is_superuser:
                return Task.objects.filter(project=project)
            return Task.objects.none()
        except Project.DoesNotExist:
            return Task.objects.none()

    @login_required
    def resolve_comments(self, info, task_id):
        """Get comments for a task."""
        user = info.context.user
        from graphql_relay import from_global_id
        _, pk = from_global_id(task_id)
        
        try:
            task = Task.objects.get(pk=pk)
            # Check if user belongs to the task's project's organization
            if user.organization == task.project.organization or user.is_superuser:
                return task.comments.all()
            return TaskComment.objects.none()
        except Task.DoesNotExist:
            return TaskComment.objects.none()
    
    @login_required
    def resolve_roles(self, info):
        """Get all roles in the current user's organization."""
        user = info.context.user
        if user.organization:
            return Role.objects.filter(organization=user.organization)
        return Role.objects.none()
    
    @login_required
    def resolve_role(self, info, id):
        """Get a specific role by ID."""
        user = info.context.user
        try:
            role = Role.objects.get(pk=id)
            if user.organization == role.organization or user.is_superuser:
                return role
            return None
        except Role.DoesNotExist:
            return None


# Mutations
class CreateOrganization(graphene.Mutation):
    """Create a new organization with an admin user."""
    class Arguments:
        # Organization fields
        name = graphene.String(required=True)
        slug = graphene.String()
        contact_email = graphene.String(required=True)
        # Admin user fields
        admin_email = graphene.String(required=True)
        admin_username = graphene.String(required=True)
        admin_password = graphene.String(required=True)
        admin_first_name = graphene.String()
        admin_last_name = graphene.String()

    organization = graphene.Field(OrganizationType)
    user = graphene.Field(UserType)
    token = graphene.String()
    
    def mutate(self, info, name, contact_email, admin_email, admin_username, admin_password, **kwargs):
        # Check if admin email already exists
        if User.objects.filter(email=admin_email).exists():
            raise Exception("A user with this email already exists.")
        
        # Check if admin username already exists
        if User.objects.filter(username=admin_username).exists():
            raise Exception("A user with this username already exists.")
        
        # Generate unique slug
        slug = kwargs.get('slug') or name.lower().replace(' ', '-').replace('_', '-')
        unique_slug = slug
        counter = 1
        while Organization.objects.filter(slug=unique_slug).exists():
            unique_slug = f"{slug}-{counter}"
            counter += 1
        
        # Create organization first
        organization = Organization.objects.create(
            name=name,
            slug=unique_slug,
            contact_email=contact_email,
            owner=None  # Will set after creating user
        )
        
        # Create admin user
        admin_user = User.objects.create_user(
            email=admin_email,
            username=admin_username,
            password=admin_password,
            first_name=kwargs.get('admin_first_name', ''),
            last_name=kwargs.get('admin_last_name', ''),
            organization=organization
        )
        
        # Set the admin user as owner of the organization
        organization.owner = admin_user
        organization.save()
        
        # Assign Admin role to the owner (will be created by signal)
        try:
            admin_role = Role.objects.get(organization=organization, name='Admin')
            admin_user.role = admin_role
            admin_user.save()
        except Role.DoesNotExist:
            pass  # Role will be created by signal
        
        # Generate JWT token for the admin user
        from graphql_jwt.shortcuts import get_token
        token = get_token(admin_user)
        
        return CreateOrganization(organization=organization, user=admin_user, token=token)


class CreateProject(graphene.Mutation):
    """Create a new project."""
    class Arguments:
        organization_slug = graphene.String(required=True)
        name = graphene.String(required=True)
        description = graphene.String()
        status = graphene.String()
        due_date = graphene.Date()

    project = graphene.Field(ProjectType)
    
    @login_required
    def mutate(self, info, organization_slug, name, **kwargs):
        user = info.context.user
        if not user.has_permission('create_project') and not user.is_superuser:
            raise Exception("You don't have permission to create projects")
        
        try:
            org = Organization.objects.get(slug=organization_slug)
            # Check if user belongs to this organization
            if user.organization != org and not user.is_superuser:
                raise Exception("You don't have permission to create projects in this organization")
            
            project = Project.objects.create(
                organization=org,
                name=name,
                created_by=user,
                **kwargs
            )
            return CreateProject(project=project)
        except Organization.DoesNotExist:
            raise Exception("Organization not found")


class UpdateProject(graphene.Mutation):
    """Update an existing project."""
    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String()
        description = graphene.String()
        status = graphene.String()
        due_date = graphene.Date()

    project = graphene.Field(ProjectType)
    
    @login_required
    def mutate(self, info, id, **kwargs):
        user = info.context.user
        if not user.has_permission('edit_project') and not user.is_superuser:
            raise Exception("You don't have permission to update projects")
        from graphql_relay import from_global_id
        _, pk = from_global_id(id)
        
        try:
            project = Project.objects.get(pk=pk)
            # Check if user belongs to this organization
            if user.organization != project.organization and not user.is_superuser:
                raise Exception("You don't have permission to update this project")
            
            for key, value in kwargs.items():
                if value is not None:
                    setattr(project, key, value)
            project.save()
            
            return UpdateProject(project=project)
        except Project.DoesNotExist:
            raise Exception("Project not found")


class CreateTask(graphene.Mutation):
    """Create a new task."""
    class Arguments:
        project_id = graphene.ID(required=True)
        title = graphene.String(required=True)
        description = graphene.String()
        status = graphene.String()
        priority = graphene.String()
        assignee_ids = graphene.List(graphene.Int)
        due_date = graphene.DateTime()

    task = graphene.Field(TaskType)
    
    @login_required
    def mutate(self, info, project_id, title, **kwargs):
        user = info.context.user
        if not user.has_permission('create_task') and not user.is_superuser:
            raise Exception("You don't have permission to create tasks")
        from graphql_relay import from_global_id
        _, pk = from_global_id(project_id)
        
        try:
            project = Project.objects.get(pk=pk)
            # Check if user belongs to this organization
            if user.organization != project.organization and not user.is_superuser:
                raise Exception("You don't have permission to create tasks in this project")
            
            task = Task.objects.create(
                project=project,
                title=title,
                created_by=user,
                **kwargs
            )
            # Handle assignees many-to-many
            if 'assignee_ids' in kwargs and kwargs['assignee_ids']:
                assignees = User.objects.filter(pk__in=kwargs['assignee_ids'])
                for a in assignees:
                    if a.organization != project.organization:
                        raise Exception("Cannot assign task to user from different organization")
                task.assignees.set(assignees)
            # Broadcast to WebSocket group for real-time update with full normalized task
            channel_layer = get_channel_layer()
            if channel_layer:
                task_payload = {
                    "id": to_global_id("TaskType", task.pk),
                    "title": task.title,
                    "description": task.description,
                    "status": task.status,
                    "priority": task.priority,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "assignees": [
                        {
                            "id": to_global_id("UserType", u.pk),
                            "email": u.email,
                            "username": getattr(u, 'username', None)
                        }
                        for u in task.assignees.all()
                    ],
                    "comments": []
                }

                async_to_sync(channel_layer.group_send)(
                    f"task_project_{project.id}",
                    {
                        "type": "task_update",
                        "data": {
                            "action": "create",
                            "task": task_payload
                        }
                    }
                )
            return CreateTask(task=task)
        except Project.DoesNotExist:
            raise Exception("Project not found")
        except User.DoesNotExist:
            raise Exception("Assignee user not found")


class UpdateTask(graphene.Mutation):
    """Update an existing task."""
    class Arguments:
        id = graphene.ID(required=True)
        title = graphene.String()
        description = graphene.String()
        status = graphene.String()
        priority = graphene.String()
        assignee_ids = graphene.List(graphene.Int)
        due_date = graphene.DateTime()

    task = graphene.Field(TaskType)
    
    @login_required
    def mutate(self, info, id, **kwargs):
        user = info.context.user
        if not user.has_permission('edit_task') and not user.is_superuser:
            raise Exception("You don't have permission to update tasks")
        from graphql_relay import from_global_id
        _, pk = from_global_id(id)
        
        try:
            task = Task.objects.get(pk=pk)
            # Check if user belongs to this organization
            if user.organization != task.project.organization and not user.is_superuser:
                raise Exception("You don't have permission to update this task")
            
            # Handle assignees list
            if 'assignee_ids' in kwargs and kwargs['assignee_ids'] is not None:
                assignees = User.objects.filter(pk__in=kwargs.pop('assignee_ids'))
                for a in assignees:
                    if a.organization != task.project.organization:
                        raise Exception("Cannot assign task to user from different organization")
                task.assignees.set(assignees)
            
            for key, value in kwargs.items():
                if value is not None:
                    setattr(task, key, value)
            task.save()
            
            # Broadcast to WebSocket group for real-time update
            channel_layer = get_channel_layer()
            if channel_layer:
                task_payload = {
                    "id": to_global_id("TaskType", task.pk),
                    "title": task.title,
                    "description": task.description,
                    "status": task.status,
                    "priority": task.priority,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "assignees": [
                        {
                            "id": to_global_id("UserType", u.pk),
                            "email": u.email,
                            "username": getattr(u, 'username', None)
                        }
                        for u in task.assignees.all()
                    ],
                    "comments": [
                        {
                            "id": to_global_id("TaskCommentType", c.pk),
                            "content": c.content,
                            "author": {
                                "id": to_global_id("UserType", c.author.pk),
                                "email": c.author.email,
                                "username": getattr(c.author, 'username', None)
                            },
                            "timestamp": c.timestamp.isoformat()
                        }
                        for c in task.comments.all()
                    ]
                }

                async_to_sync(channel_layer.group_send)(
                    f"task_project_{task.project.id}",
                    {
                        "type": "task_update",
                        "data": {
                            "action": "update",
                            "task": task_payload
                        }
                    }
                )
            return UpdateTask(task=task)
        except Task.DoesNotExist:
            raise Exception("Task not found")
        except User.DoesNotExist:
            raise Exception("Assignee user not found")


class AssignTask(graphene.Mutation):
    """Assign task to one or more users."""
    class Arguments:
        task_id = graphene.Int(required=True)
        assignee_ids = graphene.List(graphene.Int, required=True)

    task = graphene.Field(TaskType)
    
    @login_required
    def mutate(self, info, task_id, assignee_ids):
        user = info.context.user
        
        # Check permission
        if not user.has_permission('assign_task') and not user.is_superuser:
            raise Exception("You don't have permission to assign tasks")
        
        try:
            # Accept either a plain integer PK or a Relay global ID
            from graphql_relay import from_global_id
            task_pk = None
            if isinstance(task_id, str):
                # If it's a base64 global id, convert
                try:
                    _, task_pk_str = from_global_id(task_id)
                    task_pk = int(task_pk_str)
                except Exception:
                    # Fallback to parse integer from string
                    digits = ''.join(ch for ch in task_id if ch.isdigit())
                    task_pk = int(digits) if digits else None
            else:
                task_pk = int(task_id)

            if task_pk is None:
                raise Task.DoesNotExist()

            task = Task.objects.get(pk=task_pk)
            
            # Check if user belongs to this organization
            if user.organization != task.project.organization and not user.is_superuser:
                raise Exception("You don't have permission to assign this task")
            
            # Get all assignees and validate they're in the same organization
            assignees = User.objects.filter(pk__in=assignee_ids)
            
            for assignee in assignees:
                if assignee.organization != task.project.organization:
                    raise Exception(f"Cannot assign task to user {assignee.email} from different organization")
            
            # Set assignees
            task.assignees.set(assignees)
            
            # Broadcast to WebSocket group for real-time update
            channel_layer = get_channel_layer()
            if channel_layer:
                task_payload = {
                    "id": to_global_id("TaskType", task.pk),
                    "pk": task.pk,
                    "title": task.title,
                    "description": task.description,
                    "status": task.status,
                    "priority": task.priority,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "assignees": [
                        {
                            "id": to_global_id("UserType", u.pk),
                            "pk": u.pk,
                            "email": u.email,
                            "username": getattr(u, 'username', None)
                        }
                        for u in task.assignees.all()
                    ],
                    "comments": [
                        {
                            "id": to_global_id("TaskCommentType", c.pk),
                            "pk": c.pk,
                            "content": c.content,
                            "author": {
                                "id": to_global_id("UserType", c.author.pk),
                                "pk": c.author.pk,
                                "email": c.author.email,
                                "username": getattr(c.author, 'username', None)
                            },
                            "timestamp": c.timestamp.isoformat()
                        }
                        for c in task.comments.all()
                    ]
                }

                async_to_sync(channel_layer.group_send)(
                    f"task_project_{task.project.id}",
                    {
                        "type": "task_update",
                        "data": {
                            "action": "assign",
                            "task": task_payload
                        }
                    }
                )
            return AssignTask(task=task)
        except Task.DoesNotExist:
            raise Exception("Task not found")
        except User.DoesNotExist:
            raise Exception("One or more assignee users not found")


class CreateTaskComment(graphene.Mutation):
    """Create a task comment."""
    class Arguments:
        task_id = graphene.ID(required=True)
        content = graphene.String(required=True)

    comment = graphene.Field(TaskCommentType)
    
    @login_required
    def mutate(self, info, task_id, content):
        user = info.context.user
        if not user.has_permission('comment_task') and not user.is_superuser:
            raise Exception("You don't have permission to comment")
        # Accept either a Relay global ID or a plain PK
        from graphql_relay import from_global_id
        task_pk = None
        if isinstance(task_id, str):
            try:
                _, pk = from_global_id(task_id)
                task_pk = int(pk)
            except Exception:
                digits = ''.join(ch for ch in task_id if ch.isdigit())
                task_pk = int(digits) if digits else None
        else:
            try:
                task_pk = int(task_id)
            except Exception:
                task_pk = None

        try:
            if task_pk is None:
                raise Task.DoesNotExist()
            task = Task.objects.get(pk=task_pk)
            # Check if user belongs to this organization
            if user.organization != task.project.organization and not user.is_superuser:
                raise Exception("You don't have permission to comment on this task")
            
            comment = TaskComment.objects.create(
                task=task,
                content=content,
                author=user
            )
            
            # Send real-time notification
            channel_layer = get_channel_layer()
            if channel_layer:
                # Build full task payload including comments and assignees
                task_payload = {
                    "id": to_global_id("TaskType", task.pk),
                    "pk": task.pk,
                    "title": task.title,
                    "description": task.description,
                    "status": task.status,
                    "priority": task.priority,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "assignees": [
                        {
                            "id": to_global_id("UserType", u.pk),
                            "pk": u.pk,
                            "email": u.email,
                            "username": getattr(u, 'username', None)
                        }
                        for u in task.assignees.all()
                    ],
                    "comments": [
                        {
                            "id": to_global_id("TaskCommentType", c.pk),
                            "pk": c.pk,
                            "content": c.content,
                            "author": {
                                "id": to_global_id("UserType", c.author.pk),
                                "pk": c.author.pk,
                                "email": c.author.email,
                                "username": getattr(c.author, 'username', None)
                            },
                            "timestamp": c.timestamp.isoformat()
                        }
                        for c in task.comments.all()
                    ]
                }

                async_to_sync(channel_layer.group_send)(
                    f"task_project_{task.project.id}",
                    {
                        "type": "task_update",
                        "data": {
                            "action": "comment",
                            "task": task_payload,
                            "comment": {
                                "id": to_global_id("TaskCommentType", comment.pk),
                                "pk": comment.pk,
                                "content": comment.content,
                                "author": {
                                    "id": to_global_id("UserType", comment.author.pk),
                                    "pk": comment.author.pk,
                                    "email": comment.author.email,
                                    "username": getattr(comment.author, 'username', None)
                                },
                                "timestamp": comment.timestamp.isoformat()
                            }
                        }
                    }
                )
            
            return CreateTaskComment(comment=comment)
        except Task.DoesNotExist:
            raise Exception("Task not found")


class Register(graphene.Mutation):
    """Register a new user."""
    class Arguments:
        email = graphene.String(required=True)
        username = graphene.String(required=True)
        password = graphene.String(required=True)
        first_name = graphene.String()
        last_name = graphene.String()
        organization_slug = graphene.String()

    user = graphene.Field(UserType)
    token = graphene.String()
    
    def mutate(self, info, email, username, password, **kwargs):
        # Get organization if provided
        organization = None
        if 'organization_slug' in kwargs and kwargs['organization_slug']:
            try:
                organization = Organization.objects.get(slug=kwargs.pop('organization_slug'))
            except Organization.DoesNotExist:
                raise Exception("Organization not found")
        
        # Create user
        user = User.objects.create_user(
            email=email,
            username=username,
            password=password,
            organization=organization,
            **kwargs
        )
        
        # Generate JWT token
        from graphql_jwt.shortcuts import get_token
        token = get_token(user)
        
        return Register(user=user, token=token)


class CreateRole(graphene.Mutation):
    """Create a custom role."""
    class Arguments:
        name = graphene.String(required=True)
        description = graphene.String()
        permissions = graphene.JSONString(required=True)
    
    role = graphene.Field(RoleType)
    
    @login_required
    def mutate(self, info, name, permissions, description=''):
        user = info.context.user
        
        # Check permission - only org owners and superusers can create roles
        if not user.is_superuser and not (user.organization and user.organization.owner == user):
            if not user.has_permission('manage_roles'):
                raise Exception("You don't have permission to create roles")
        
        if not user.organization:
            raise Exception("User must belong to an organization")
        
        # Project managers can only create roles with permissions they have
        if not user.is_superuser and not (user.organization.owner == user):
            for perm_key, perm_value in permissions.items():
                if perm_value and not user.has_permission(perm_key):
                    raise Exception(f"You don't have permission to grant '{perm_key}'")
        
        # Create role
        role = Role.objects.create(
            organization=user.organization,
            name=name,
            description=description,
            permissions=permissions,
            is_default=False
        )
        
        return CreateRole(role=role)


class UpdateRole(graphene.Mutation):
    """Update a role's permissions or details."""
    class Arguments:
        role_id = graphene.Int(required=True)
        name = graphene.String()
        description = graphene.String()
        permissions = graphene.JSONString()
    
    role = graphene.Field(RoleType)
    
    @login_required
    def mutate(self, info, role_id, **kwargs):
        user = info.context.user
        
        # Check permission
        if not user.has_permission('manage_roles') and not user.is_superuser:
            raise Exception("You don't have permission to update roles")
        
        try:
            role = Role.objects.get(pk=role_id)
            
            # Check organization
            if user.organization != role.organization and not user.is_superuser:
                raise Exception("You can only update roles in your organization")
            
            # Update fields
            if 'name' in kwargs and kwargs['name']:
                role.name = kwargs['name']
            if 'description' in kwargs and kwargs['description'] is not None:
                role.description = kwargs['description']
            if 'permissions' in kwargs and kwargs['permissions']:
                role.permissions = kwargs['permissions']
            
            role.save()
            return UpdateRole(role=role)
        except Role.DoesNotExist:
            raise Exception("Role not found")


class AssignUserRole(graphene.Mutation):
    """Assign a role to a user."""
    class Arguments:
        user_id = graphene.Int(required=True)
        role_id = graphene.Int(required=True)
    
    user = graphene.Field(UserType)
    
    @login_required
    def mutate(self, info, user_id, role_id):
        current_user = info.context.user
        
        try:
            target_user = User.objects.get(pk=user_id)
            role = Role.objects.get(pk=role_id)
            
            # Check organization first
            if current_user.organization != target_user.organization:
                raise Exception("Cannot assign role to user from different organization")
            if current_user.organization != role.organization:
                raise Exception("Cannot assign role from different organization")
            
            # Check if current user can modify target user
            # Organization owners can always assign roles
            # Users with manage_users permission can assign roles
            # Superusers can assign roles
            can_assign = (
                current_user.is_superuser or
                (current_user.organization and current_user.organization.owner == current_user) or
                current_user.has_permission('manage_users')
            )
            
            if not can_assign:
                raise Exception("You don't have permission to assign roles to users")
            
            # Additional check for non-owners: can't modify organization owner
            if (not current_user.is_superuser and 
                current_user.organization.owner != current_user and
                target_user.organization.owner == target_user):
                raise Exception("You cannot modify the organization owner's role")
            
            target_user.role = role
            target_user.save()
            
            return AssignUserRole(user=target_user)
        except User.DoesNotExist:
            raise Exception("User not found")
        except Role.DoesNotExist:
            raise Exception("Role not found")


class RemoveUserRole(graphene.Mutation):
    """Remove a user's role (set to None)."""
    class Arguments:
        user_id = graphene.Int(required=True)
    
    user = graphene.Field(UserType)
    
    @login_required
    def mutate(self, info, user_id):
        current_user = info.context.user
        
        try:
            target_user = User.objects.get(pk=user_id)
            
            # Check organization first
            if current_user.organization != target_user.organization:
                raise Exception("Cannot modify user from different organization")
            
            # Check if current user can modify target user
            # Organization owners can always remove roles
            # Users with manage_users permission can remove roles
            # Superusers can remove roles
            can_remove = (
                current_user.is_superuser or
                (current_user.organization and current_user.organization.owner == current_user) or
                current_user.has_permission('manage_users')
            )
            
            if not can_remove:
                raise Exception("You don't have permission to remove roles from users")
            
            # Additional check for non-owners: can't modify organization owner
            if (not current_user.is_superuser and 
                current_user.organization.owner != current_user and
                target_user.organization.owner == target_user):
                raise Exception("You cannot remove the organization owner's role")
            
            target_user.role = None
            target_user.save()
            
            return RemoveUserRole(user=target_user)
        except User.DoesNotExist:
            raise Exception("User not found")


class SetUserPermissions(graphene.Mutation):
    """Set custom permissions for a user (overrides role permissions)."""
    class Arguments:
        user_id = graphene.Int(required=True)
        permissions = graphene.JSONString(required=True)
    
    user = graphene.Field(UserType)
    
    @login_required
    def mutate(self, info, user_id, permissions):
        current_user = info.context.user
        
        try:
            target_user = User.objects.get(pk=user_id)
            
            # Check organization first
            if current_user.organization != target_user.organization:
                raise Exception("Cannot set permissions for user from different organization")
            
            # Check if current user can modify target user
            # Organization owners can always set permissions
            # Users with manage_users permission can set permissions
            # Superusers can set permissions
            can_set_permissions = (
                current_user.is_superuser or
                (current_user.organization and current_user.organization.owner == current_user) or
                current_user.has_permission('manage_users')
            )
            
            if not can_set_permissions:
                raise Exception("You don't have permission to set permissions for users")
            
            # Additional check for non-owners: can't modify organization owner
            if (not current_user.is_superuser and 
                current_user.organization.owner != current_user and
                target_user.organization.owner == target_user):
                raise Exception("You cannot modify the organization owner's permissions")
            
            # Project managers can only grant permissions they have
            if not current_user.is_superuser and not (current_user.organization and current_user.organization.owner == current_user):
                for perm_key, perm_value in permissions.items():
                    if perm_value and not current_user.has_permission(perm_key):
                        raise Exception(f"You don't have permission to grant '{perm_key}'")
            
            target_user.custom_permissions = permissions
            target_user.save()
            
            return SetUserPermissions(user=target_user)
        except User.DoesNotExist:
            raise Exception("User not found")


class Mutation(graphene.ObjectType):
    """GraphQL mutations."""
    
    # Authentication
    token_auth = graphql_jwt.ObtainJSONWebToken.Field()
    verify_token = graphql_jwt.Verify.Field()
    refresh_token = graphql_jwt.Refresh.Field()
    register = Register.Field()
    
    # Organizations
    create_organization = CreateOrganization.Field()
    
    # Projects
    create_project = CreateProject.Field()
    update_project = UpdateProject.Field()
    
    # Tasks
    create_task = CreateTask.Field()
    update_task = UpdateTask.Field()
    assign_task = AssignTask.Field()
    
    # Comments
    create_task_comment = CreateTaskComment.Field()
    add_comment = CreateTaskComment.Field()  # Alias for frontend compatibility

    # Roles & Permissions
    create_role = CreateRole.Field()
    update_role = UpdateRole.Field()
    assign_user_role = AssignUserRole.Field()
    remove_user_role = RemoveUserRole.Field()
    set_user_permissions = SetUserPermissions.Field()


# Schema
schema = graphene.Schema(query=Query, mutation=Mutation)
