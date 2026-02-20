"""
Django signals for chat application
Handles post-save and other events
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.signals import user_logged_in
import logging

from chatapp.models import ChatSession, User

logger = logging.getLogger('chatapp')


@receiver(post_save, sender=ChatSession)
def session_created_or_updated(sender, instance, created, **kwargs):
    if created:
        logger.info(f"new session {instance.id} by {instance.visitor.username}")
    else:
        logger.info(f"session {instance.id} updated -> {instance.status}")


@receiver(user_logged_in, sender=User)
def user_logged_in_handler(sender, request, user, **kwargs):
    logger.info(f"user login: {user.username} ({user.role})")
