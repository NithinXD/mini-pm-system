"""
Database models for the mini project management system.
Includes Organization, Project, Task, TaskComment, Role, and Permission models.
"""
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.db.models import Count, Case, When, Value, Q
from django.utils.text import slugify
from django.db.models.signals import post_save
from django.dispatch import receiver
import json


class User(AbstractUser):
    """Custom user model for authentication."""
    email = models.EmailField(unique=True)
    organization = models.ForeignKey(
        'Organization', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='users'
    )
    role = models.ForeignKey(
        'Role',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users'
    )
    custom_permissions = models.JSONField(default=dict, blank=True)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']
    
    def __str__(self):
        return self.email
    
    def has_permission(self, permission_key):
        """Check if user has a specific permission."""
        # Superuser has all permissions
        if self.is_superuser:
            return True
        
        # Organization owner has all permissions within their org
        if self.organization and hasattr(self.organization, 'owner') and self.organization.owner == self:
            return True
        
        # Check custom permissions first (can override role)
        if permission_key in self.custom_permissions:
            return self.custom_permissions[permission_key]
        
        # Check role permissions
        if self.role:
            return self.role.has_permission(permission_key)
        
        return False
    
    def can_modify_user(self, target_user):
        """Check if this user can modify another user."""
        if self.is_superuser:
            return True
        
        if self.organization and self.organization.owner == self:
            return target_user.organization == self.organization
        
        # Project managers can only modify users with lower or equal permissions
        if self.has_permission('manage_users'):
            if target_user.organization != self.organization:
                return False
            
            # Can't modify organization owner
            if target_user.organization.owner == target_user:
                return False
            
            # Can't modify users with higher role hierarchy
            return self._role_hierarchy_check(target_user)
        
        return False
    
    def _role_hierarchy_check(self, target_user):
        """Check if current user's role is higher than target user's role."""
        if not self.role or not target_user.role:
            return True
        
        role_hierarchy = ['Viewer', 'Member', 'Manager', 'Admin']
        my_level = role_hierarchy.index(self.role.name) if self.role.name in role_hierarchy else 0
        target_level = role_hierarchy.index(target_user.role.name) if target_user.role.name in role_hierarchy else 0
        
        return my_level >= target_level
    
    class Meta:
        db_table = 'auth_user'
        ordering = ['email']


class Organization(models.Model):
    """Organization model for multi-tenancy."""
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, max_length=100)
    contact_email = models.EmailField()
    owner = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='owned_organizations'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['slug'], name='unique_org_slug')
        ]
        ordering = ['name']
        indexes = [
            models.Index(fields=['slug']),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


STATUS_CHOICES = [
    ('ACTIVE', 'Active'),
    ('COMPLETED', 'Completed'),
    ('ON_HOLD', 'On Hold'),
    ('ARCHIVED', 'Archived'),
]


class Project(models.Model):
    """Project model."""
    organization = models.ForeignKey(
        Organization, 
        on_delete=models.CASCADE, 
        related_name='projects'
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='ACTIVE'
    )
    due_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        'User', 
        on_delete=models.SET_NULL, 
        null=True,
        related_name='created_projects'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', 'status']),
            models.Index(fields=['due_date']),
        ]

    def __str__(self):
        return f"{self.name} ({self.organization.name})"

    def get_stats(self):
        """Calculate project statistics."""
        tasks = self.tasks.aggregate(
            total=Count('id'),
            completed=Count(Case(When(status='DONE', then=Value(1)))),
            in_progress=Count(Case(When(status='IN_PROGRESS', then=Value(1)))),
            todo=Count(Case(When(status='TODO', then=Value(1)))),
        )
        
        completion_rate = 0
        if tasks['total'] > 0:
            completion_rate = round((tasks['completed'] / tasks['total']) * 100, 2)
        
        return {
            'total_tasks': tasks['total'],
            'completed_tasks': tasks['completed'],
            'in_progress_tasks': tasks['in_progress'],
            'todo_tasks': tasks['todo'],
            'completion_rate': completion_rate
        }


TASK_STATUS_CHOICES = [
    ('TODO', 'To Do'),
    ('IN_PROGRESS', 'In Progress'),
    ('DONE', 'Done'),
]

TASK_PRIORITY_CHOICES = [
    ('LOW', 'Low'),
    ('MEDIUM', 'Medium'),
    ('HIGH', 'High'),
    ('URGENT', 'Urgent'),
]


class Task(models.Model):
    """Task model."""
    project = models.ForeignKey(
        Project, 
        on_delete=models.CASCADE, 
        related_name='tasks'
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, 
        choices=TASK_STATUS_CHOICES, 
        default='TODO'
    )
    priority = models.CharField(
        max_length=10,
        choices=TASK_PRIORITY_CHOICES,
        default='MEDIUM'
    )
    assignees = models.ManyToManyField(
        'User',
        blank=True,
        related_name='assigned_tasks'
    )
    due_date = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_tasks'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project', 'status']),
            models.Index(fields=['due_date']),
        ]

    def __str__(self):
        return f"{self.title} - {self.project.name}"


class TaskComment(models.Model):
    """Task comment model for discussions."""
    task = models.ForeignKey(
        Task, 
        on_delete=models.CASCADE, 
        related_name='comments'
    )
    content = models.TextField()
    author = models.ForeignKey(
        'User',
        on_delete=models.CASCADE,
        related_name='comments'
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['task', 'timestamp']),
        ]

    def __str__(self):
        return f"Comment by {self.author.email} on {self.task.title}"


class Role(models.Model):
    """Role model for RBAC (Role-Based Access Control)."""
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='roles'
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=dict)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
        unique_together = [['organization', 'name']]
        indexes = [
            models.Index(fields=['organization', 'is_default']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.organization.name})"
    
    def has_permission(self, permission_key):
        """Check if role has a specific permission."""
        return self.permissions.get(permission_key, False)
    
    @classmethod
    def get_default_permissions(cls, role_name):
        """Get default permission set for built-in roles."""
        defaults = {
            'Admin': {
                'create_project': True,
                'edit_project': True,
                'delete_project': True,
                'create_task': True,
                'edit_task': True,
                'delete_task': True,
                'assign_task': True,
                'comment_task': True,
                'manage_users': True,
                'manage_roles': True,
                'view_all': True,
            },
            'Manager': {
                'create_project': True,
                'edit_project': True,
                'delete_project': False,
                'create_task': True,
                'edit_task': True,
                'delete_task': True,
                'assign_task': True,
                'comment_task': True,
                'manage_users': False,
                'manage_roles': False,
                'view_all': True,
            },
            'Member': {
                'create_project': False,
                'edit_project': False,
                'delete_project': False,
                'create_task': True,
                'edit_task': True,
                'delete_task': False,
                'assign_task': False,
                'comment_task': True,
                'manage_users': False,
                'manage_roles': False,
                'view_all': True,
            },
            'Viewer': {
                'create_project': False,
                'edit_project': False,
                'delete_project': False,
                'create_task': False,
                'edit_task': False,
                'delete_task': False,
                'assign_task': False,
                'comment_task': True,
                'manage_users': False,
                'manage_roles': False,
                'view_all': True,
            }
        }
        return defaults.get(role_name, {})
    
    @classmethod
    def create_default_roles(cls, organization):
        """Create default roles for an organization."""
        default_roles = ['Admin', 'Manager', 'Member', 'Viewer']
        created_roles = []
        
        for role_name in default_roles:
            role, created = cls.objects.get_or_create(
                organization=organization,
                name=role_name,
                defaults={
                    'description': f'Default {role_name} role',
                    'permissions': cls.get_default_permissions(role_name),
                    'is_default': True
                }
            )
            if created:
                created_roles.append(role)
        
        return created_roles


# Signals
@receiver(post_save, sender=Organization)
def create_default_roles_for_org(sender, instance, created, **kwargs):
    """Create default roles when a new organization is created."""
    if created:
        Role.create_default_roles(instance)


@receiver(post_save, sender=User)
def assign_default_role_to_user(sender, instance, created, **kwargs):
    """Assign default Member role to new users."""
    if created and instance.organization and not instance.role:
        try:
            member_role = Role.objects.get(organization=instance.organization, name='Member')
            instance.role = member_role
            instance.save(update_fields=['role'])
        except Role.DoesNotExist:
            pass  # Role might not exist yet if org is being created simultaneously


