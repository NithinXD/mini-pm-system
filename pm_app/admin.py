"""
Admin configuration for the project management app.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Organization, Project, Task, TaskComment, Role


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Custom user admin."""
    list_display = ['email', 'username', 'organization', 'role', 'is_staff', 'is_active']
    list_filter = ['is_staff', 'is_active', 'organization', 'role']
    search_fields = ['email', 'username']
    ordering = ['email']
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Organization & Role', {'fields': ('organization', 'role', 'custom_permissions')}),
    )


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    """Organization admin."""
    list_display = ['name', 'slug', 'contact_email', 'owner', 'created_at']
    search_fields = ['name', 'slug', 'contact_email']
    prepopulated_fields = {'slug': ('name',)}
    raw_id_fields = ['owner']


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    """Project admin."""
    list_display = ['name', 'organization', 'status', 'due_date', 'created_by', 'created_at']
    list_filter = ['status', 'organization', 'created_at']
    search_fields = ['name', 'description']
    date_hierarchy = 'created_at'
    raw_id_fields = ['organization', 'created_by']


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    """Task admin."""
    list_display = ['title', 'project', 'status', 'priority', 'get_assignees', 'due_date', 'created_at']
    list_filter = ['status', 'priority', 'project', 'created_at']
    search_fields = ['title', 'description']
    date_hierarchy = 'created_at'
    raw_id_fields = ['project', 'created_by']
    filter_horizontal = ['assignees']
    
    def get_assignees(self, obj):
        return ", ".join([user.username for user in obj.assignees.all()[:3]])
    get_assignees.short_description = 'Assignees'


@admin.register(TaskComment)
class TaskCommentAdmin(admin.ModelAdmin):
    """Task comment admin."""
    list_display = ['task', 'author', 'timestamp', 'content_preview']
    list_filter = ['timestamp']
    search_fields = ['content', 'author__email']
    date_hierarchy = 'timestamp'
    raw_id_fields = ['task', 'author']
    
    def content_preview(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = 'Content'


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    """Role admin."""
    list_display = ['name', 'organization', 'is_default', 'created_at']
    list_filter = ['is_default', 'organization', 'created_at']
    search_fields = ['name', 'description']
    raw_id_fields = ['organization']
    readonly_fields = ['created_at', 'updated_at']

