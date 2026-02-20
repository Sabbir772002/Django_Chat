"""
Django tests for chat application
"""
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from chatapp.models import ChatSession, Message, UserRole, SessionStatus

User = get_user_model()


class UserModelTest(TestCase):
    """Test cases for User model"""
    
    def test_create_visitor_user(self):
        """Test creating a visitor user"""
        user = User.objects.create_user(
            username='visitor1',
            email='visitor1@test.com',
            password='testpass123',
            role=UserRole.VISITOR
        )
        self.assertEqual(user.role, UserRole.VISITOR)
        self.assertTrue(user.check_password('testpass123'))
    
    def test_create_agent_user(self):
        """Test creating an agent user"""
        user = User.objects.create_user(
            username='agent1',
            email='agent1@test.com',
            password='testpass123',
            role=UserRole.AGENT
        )
        self.assertEqual(user.role, UserRole.AGENT)


class ChatSessionModelTest(TestCase):
    """Test cases for ChatSession model"""
    
    def setUp(self):
        """Set up test data"""
        self.visitor = User.objects.create_user(
            username='visitor1',
            email='visitor1@test.com',
            password='testpass123',
            role=UserRole.VISITOR
        )
        self.agent = User.objects.create_user(
            username='agent1',
            email='agent1@test.com',
            password='testpass123',
            role=UserRole.AGENT
        )
    
    def test_create_session(self):
        """Test creating a chat session"""
        session = ChatSession.objects.create(
            visitor=self.visitor,
            status=SessionStatus.WAITING
        )
        self.assertEqual(session.visitor, self.visitor)
        self.assertEqual(session.status, SessionStatus.WAITING)
        self.assertIsNone(session.agent)
    
    def test_assign_agent_to_session(self):
        """Test assigning an agent to session"""
        session = ChatSession.objects.create(
            visitor=self.visitor,
            status=SessionStatus.WAITING
        )
        session.agent = self.agent
        session.status = SessionStatus.ACTIVE
        session.save()
        
        self.assertEqual(session.agent, self.agent)
        self.assertEqual(session.status, SessionStatus.ACTIVE)


class MessageModelTest(TestCase):
    """Test cases for Message model"""
    
    def setUp(self):
        """Set up test data"""
        self.visitor = User.objects.create_user(
            username='visitor1',
            email='visitor1@test.com',
            password='testpass123',
            role=UserRole.VISITOR
        )
        self.session = ChatSession.objects.create(
            visitor=self.visitor,
            status=SessionStatus.ACTIVE
        )
    
    def test_create_message(self):
        """Test creating a message"""
        message = Message.objects.create(
            session=self.session,
            sender=self.visitor,
            content='Hello, this is a test message'
        )
        self.assertEqual(message.sender, self.visitor)
        self.assertEqual(message.content, 'Hello, this is a test message')
        self.assertFalse(message.is_read)
    
    def test_message_ordering(self):
        """Test messages are ordered by timestamp"""
        msg1 = Message.objects.create(
            session=self.session,
            sender=self.visitor,
            content='First message'
        )
        msg2 = Message.objects.create(
            session=self.session,
            sender=self.visitor,
            content='Second message'
        )
        
        messages = Message.objects.filter(session=self.session)
        self.assertEqual(messages.first().id, msg1.id)
        self.assertEqual(messages.last().id, msg2.id)


class AuthenticationAPITest(APITestCase):
    """Test cases for authentication API"""
    
    def test_user_registration(self):
        """Test user registration"""
        response = self.client.post('/api/auth/register/', {
            'username': 'newuser',
            'email': 'newuser@test.com',
            'password': 'testpass123',
            'password2': 'testpass123',
            'role': 'visitor'
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.count(), 1)
    
    def test_user_login(self):
        """Test user login"""
        User.objects.create_user(
            username='testuser',
            email='testuser@test.com',
            password='testpass123'
        )
        
        response = self.client.post('/api/auth/login/', {
            'username': 'testuser',
            'password': 'testpass123'
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)


class ChatSessionAPITest(APITestCase):
    """Test cases for chat session API"""
    
    def setUp(self):
        """Set up test data"""
        self.visitor = User.objects.create_user(
            username='visitor1',
            email='visitor1@test.com',
            password='testpass123',
            role=UserRole.VISITOR
        )
        self.client.force_authenticate(user=self.visitor)
    
    def test_create_session(self):
        """Test creating a session via API"""
        response = self.client.post('/api/sessions/', {})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ChatSession.objects.count(), 1)
    
    def test_list_sessions(self):
        """Test listing user's sessions"""
        ChatSession.objects.create(
            visitor=self.visitor,
            status=SessionStatus.WAITING
        )
        
        response = self.client.get('/api/sessions/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
    
    def test_get_session_messages(self):
        """Test retrieving session messages"""
        session = ChatSession.objects.create(
            visitor=self.visitor,
            status=SessionStatus.ACTIVE
        )
        Message.objects.create(
            session=session,
            sender=self.visitor,
            content='Test message'
        )
        
        response = self.client.get(f'/api/sessions/{session.id}/messages/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)


class MessageAPITest(APITestCase):
    """Test cases for message API"""
    
    def setUp(self):
        """Set up test data"""
        self.visitor = User.objects.create_user(
            username='visitor1',
            email='visitor1@test.com',
            password='testpass123',
            role=UserRole.VISITOR
        )
        self.session = ChatSession.objects.create(
            visitor=self.visitor,
            status=SessionStatus.ACTIVE
        )
        self.client.force_authenticate(user=self.visitor)
    
    def test_create_message(self):
        """Test creating a message via API"""
        response = self.client.post('/api/messages/', {
            'session': str(self.session.id),
            'content': 'Hello, World!'
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Message.objects.count(), 1)
    
    def test_empty_message_rejected(self):
        """Test that empty messages are rejected"""
        response = self.client.post('/api/messages/', {
            'session': str(self.session.id),
            'content': ''
        })
        self.assertEqual(response.status_code, 400)


class PermissionTest(APITestCase):
    """Test cases for permissions and authorization"""
    
    def setUp(self):
        """Set up test data"""
        self.visitor1 = User.objects.create_user(
            username='visitor1',
            email='visitor1@test.com',
            password='testpass123',
            role=UserRole.VISITOR
        )
        self.visitor2 = User.objects.create_user(
            username='visitor2',
            email='visitor2@test.com',
            password='testpass123',
            role=UserRole.VISITOR
        )
        self.session = ChatSession.objects.create(
            visitor=self.visitor1,
            status=SessionStatus.ACTIVE
        )
    
    def test_visitor_cannot_access_other_sessions(self):
        """Test that visitors cannot access other visitors' sessions"""
        self.client.force_authenticate(user=self.visitor2)
        response = self.client.get(f'/api/sessions/{self.session.id}/')
        self.assertEqual(response.status_code, 404)
    
    def test_unauthenticated_cannot_access_api(self):
        """Test that unauthenticated users cannot access protected endpoints"""
        self.client.force_authenticate(user=None)
        response = self.client.get('/api/sessions/')
        self.assertEqual(response.status_code, 401)
