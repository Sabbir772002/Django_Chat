from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.timezone import now
import uuid


class UserRole(models.TextChoices):
    VISITOR = 'visitor', 'Visitor'
    AGENT = 'agent', 'Agent'


class AgentStatus(models.TextChoices):
    AVAILABLE = 'available', 'Available'
    BUSY = 'busy', 'Busy'
    OFFLINE = 'offline', 'Offline'


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.VISITOR
    )
    agent_status = models.CharField(
        max_length=20,
        choices=AgentStatus.choices,
        default=AgentStatus.OFFLINE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'auth_user'
    
    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


class SessionStatus(models.TextChoices):
    WAITING = 'waiting', 'Waiting'
    ACTIVE = 'active', 'Active'
    CLOSED = 'closed', 'Closed'


class ChatSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    visitor = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='visitor_sessions'
    )
    agent = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='agent_sessions',
        null=True,
        blank=True
    )
    status = models.CharField(
        max_length=20,
        choices=SessionStatus.choices,
        default=SessionStatus.WAITING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'chat_sessions'
        indexes = [
            models.Index(fields=['status', 'agent']),
        ]
    
    def __str__(self):
        return f"Session {self.id} - {self.status}"


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='sent_messages'
    )
    content = models.TextField()
    timestamp = models.DateTimeField(default=now, db_index=True)
    is_read = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'messages'
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['session', 'timestamp']),
        ]
    
    def __str__(self):
        return f"Message from {self.sender.username} in session {self.session.id}"
