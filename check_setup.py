import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from pm_app.models import *
from django.contrib.auth import get_user_model
User = get_user_model()

# Check setup
org = Organization.objects.get(slug='truxen')
print(f'Organization: {org.name}')
print(f'Owner: {org.owner}')

# Show all users and their roles
for user in User.objects.filter(organization=org):
    print(f'User: {user.email} - Role: {user.role.name if user.role else "No Role"}')

# Show all roles
for role in Role.objects.filter(organization=org):
    perms = [k for k, v in role.permissions.items() if v]
    print(f'Role: {role.name} - Default: {role.is_default} - Permissions: {perms}')