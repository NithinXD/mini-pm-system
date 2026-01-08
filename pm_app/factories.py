"""
Factory classes for creating test data.
"""
import factory
from factory.django import DjangoModelFactory
from django.contrib.auth import get_user_model
from .models import Organization, Project, Task, TaskComment

User = get_user_model()


class OrganizationFactory(DjangoModelFactory):
    """Factory for Organization model."""
    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f'Test Organization {n}')
    slug = factory.Sequence(lambda n: f'test-org-{n}')
    contact_email = factory.Faker('email')


class UserFactory(DjangoModelFactory):
    """Factory for User model."""
    class Meta:
        model = User

    email = factory.Faker('email')
    username = factory.Sequence(lambda n: f'user{n}')
    first_name = factory.Faker('first_name')
    last_name = factory.Faker('last_name')
    organization = factory.SubFactory(OrganizationFactory)
    is_active = True

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            self.set_password(extracted)
        else:
            self.set_password('testpass123')


class ProjectFactory(DjangoModelFactory):
    """Factory for Project model."""
    class Meta:
        model = Project

    organization = factory.SubFactory(OrganizationFactory)
    name = factory.Sequence(lambda n: f'Test Project {n}')
    description = factory.Faker('text')
    status = 'ACTIVE'
    created_by = factory.SubFactory(UserFactory)


class TaskFactory(DjangoModelFactory):
    """Factory for Task model."""
    class Meta:
        model = Task

    project = factory.SubFactory(ProjectFactory)
    title = factory.Sequence(lambda n: f'Test Task {n}')
    description = factory.Faker('text')
    status = 'TODO'
    priority = 'MEDIUM'
    created_by = factory.SubFactory(UserFactory)
    assignee = factory.SubFactory(UserFactory)


class TaskCommentFactory(DjangoModelFactory):
    """Factory for TaskComment model."""
    class Meta:
        model = TaskComment

    task = factory.SubFactory(TaskFactory)
    content = factory.Faker('text')
    author = factory.SubFactory(UserFactory)
