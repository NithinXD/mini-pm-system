"""
Test cases for the project management app.
"""
from django.test import TestCase
from graphene_django.utils.testing import GraphQLTestCase
from django.contrib.auth import get_user_model
from .models import Organization, Project, Task, TaskComment
from .factories import (
    OrganizationFactory, UserFactory, ProjectFactory, 
    TaskFactory, TaskCommentFactory
)

User = get_user_model()


class ModelTests(TestCase):
    """Test cases for models."""

    def test_organization_creation(self):
        """Test organization creation."""
        org = OrganizationFactory()
        self.assertIsInstance(org, Organization)
        self.assertTrue(org.slug)
        self.assertEqual(str(org), org.name)

    def test_user_creation(self):
        """Test user creation."""
        user = UserFactory()
        self.assertIsInstance(user, User)
        self.assertEqual(str(user), user.email)
        self.assertIsNotNone(user.organization)

    def test_project_creation(self):
        """Test project creation."""
        project = ProjectFactory()
        self.assertIsInstance(project, Project)
        self.assertEqual(project.status, 'ACTIVE')
        self.assertIsNotNone(project.organization)

    def test_project_stats(self):
        """Test project statistics calculation."""
        project = ProjectFactory()
        
        # Create tasks
        TaskFactory(project=project, status='TODO')
        TaskFactory(project=project, status='IN_PROGRESS')
        TaskFactory(project=project, status='DONE')
        TaskFactory(project=project, status='DONE')
        
        stats = project.get_stats()
        self.assertEqual(stats['total_tasks'], 4)
        self.assertEqual(stats['completed_tasks'], 2)
        self.assertEqual(stats['in_progress_tasks'], 1)
        self.assertEqual(stats['todo_tasks'], 1)
        self.assertEqual(stats['completion_rate'], 50.0)

    def test_task_creation(self):
        """Test task creation."""
        task = TaskFactory()
        self.assertIsInstance(task, Task)
        self.assertEqual(task.status, 'TODO')
        self.assertEqual(task.priority, 'MEDIUM')

    def test_comment_creation(self):
        """Test comment creation."""
        comment = TaskCommentFactory()
        self.assertIsInstance(comment, TaskComment)
        self.assertIsNotNone(comment.author)
        self.assertIsNotNone(comment.task)


class GraphQLAPITests(GraphQLTestCase):
    """Test cases for GraphQL API."""
    GRAPHQL_URL = '/graphql/'

    def setUp(self):
        """Set up test data."""
        self.org = OrganizationFactory()
        self.user = UserFactory(organization=self.org, password='testpass123')
        self.project = ProjectFactory(organization=self.org, created_by=self.user)
        
        # Get JWT token
        response = self.query(
            '''
            mutation TokenAuth($email: String!, $password: String!) {
                tokenAuth(email: $email, password: $password) {
                    token
                }
            }
            ''',
            variables={'email': self.user.email, 'password': 'testpass123'}
        )
        self.token = response.json()['data']['tokenAuth']['token']

    def test_register_mutation(self):
        """Test user registration."""
        response = self.query(
            '''
            mutation Register($email: String!, $username: String!, $password: String!) {
                register(email: $email, username: $username, password: $password) {
                    user {
                        email
                        username
                    }
                    token
                }
            }
            ''',
            variables={
                'email': 'newuser@test.com',
                'username': 'newuser',
                'password': 'newpass123'
            }
        )
        
        content = response.json()
        self.assertIsNone(content.get('errors'))
        self.assertIsNotNone(content['data']['register']['token'])
        self.assertEqual(content['data']['register']['user']['email'], 'newuser@test.com')

    def test_me_query(self):
        """Test me query."""
        response = self.query(
            '''
            query {
                me {
                    email
                    username
                }
            }
            ''',
            headers={'HTTP_AUTHORIZATION': f'Bearer {self.token}'}
        )
        
        content = response.json()
        self.assertIsNone(content.get('errors'))
        self.assertEqual(content['data']['me']['email'], self.user.email)

    def test_projects_query(self):
        """Test projects query."""
        response = self.query(
            '''
            query GetProjects($orgSlug: String!) {
                projects(organizationSlug: $orgSlug) {
                    edges {
                        node {
                            id
                            name
                            status
                        }
                    }
                }
            }
            ''',
            variables={'orgSlug': self.org.slug},
            headers={'HTTP_AUTHORIZATION': f'Bearer {self.token}'}
        )
        
        content = response.json()
        self.assertIsNone(content.get('errors'))
        self.assertTrue(len(content['data']['projects']['edges']) > 0)

    def test_create_project_mutation(self):
        """Test create project mutation."""
        response = self.query(
            '''
            mutation CreateProject($orgSlug: String!, $name: String!) {
                createProject(organizationSlug: $orgSlug, name: $name) {
                    project {
                        name
                        status
                    }
                }
            }
            ''',
            variables={'orgSlug': self.org.slug, 'name': 'New Test Project'},
            headers={'HTTP_AUTHORIZATION': f'Bearer {self.token}'}
        )
        
        content = response.json()
        self.assertIsNone(content.get('errors'))
        self.assertEqual(content['data']['createProject']['project']['name'], 'New Test Project')
        self.assertEqual(content['data']['createProject']['project']['status'], 'ACTIVE')

