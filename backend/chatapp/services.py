import logging
import time
from django.db.models import Q, Count
from chatapp.models import User, ChatSession, Message, UserRole, SessionStatus

logger = logging.getLogger('chatapp')

# redis sorted set key, score = creation time so oldest come first
REDIS_WAITING_KEY = 'chat:waiting_queue'


def _get_redis():
    # grab redis connection from channels config, fallback to default if something wrong
    import redis as redis_lib
    from django.conf import settings
    try:
        ch_cfg = settings.CHANNEL_LAYERS.get('default', {}).get('CONFIG', {})
        hosts = ch_cfg.get('hosts', [('redis', 6379)])
        host_entry = hosts[0]
        if isinstance(host_entry, (list, tuple)):
            host, port = host_entry[0], host_entry[1]
        else:
            return redis_lib.from_url(host_entry, decode_responses=True)
        return redis_lib.Redis(host=host, port=port, db=0, decode_responses=True)
    except Exception:
        return redis_lib.Redis(host='redis', port=6379, db=0, decode_responses=True)


class AgentAssignmentService:

    @staticmethod
    def enqueue_waiting_session(session: 'ChatSession') -> None:
        # put visitor in line, score is timestamp so order maintain
        try:
            r = _get_redis()
            score = session.created_at.timestamp()
            r.zadd(REDIS_WAITING_KEY, {str(session.id): score})
        except Exception as e:
            logger.warning(f"redis enqueue fail: {e}")

    @staticmethod
    def dequeue_next_waiting() -> 'str | None':
        # pop oldest waiting session atomically
        try:
            r = _get_redis()
            result = r.zpopmin(REDIS_WAITING_KEY, 1)
            if result:
                return result[0][0]
            return None
        except Exception as e:
            logger.warning(f"redis dequeue fail, try db: {e}")
            # redis down? fallback to db
            session = ChatSession.objects.filter(
                status=SessionStatus.WAITING
            ).order_by('created_at').first()
            return str(session.id) if session else None

    @staticmethod
    def remove_from_queue(session_id: str) -> None:
        try:
            r = _get_redis()
            r.zrem(REDIS_WAITING_KEY, str(session_id))
        except Exception as e:
            logger.warning(f"redis remove fail: {e}")

    @staticmethod
    def assign_visitor_to_agent(session: ChatSession) -> bool:
        # just delegate, keep one place for this logic
        return AgentAssignmentService.auto_assign_to_available_agent(session)

    @staticmethod
    def assign_next_to_agent(agent) -> 'ChatSession | None':
        # agent just went available, give him oldest waiting visitor
        try:
            for _ in range(5):  # sometimes queue has stale entries, retry few times
                session_id = AgentAssignmentService.dequeue_next_waiting()
                if not session_id:
                    return None

                try:
                    session = ChatSession.objects.get(
                        id=session_id, status=SessionStatus.WAITING
                    )
                except ChatSession.DoesNotExist:
                    # session already taken or cancelled, skip
                    continue

                session.agent = agent
                session.status = SessionStatus.ACTIVE
                session.save()
                logger.info(f"assigned session {session.id} to {agent.username}")
                return session

            return None
        except Exception as e:
            logger.error(f"assign_next_to_agent error: {e}")
            return None

    @staticmethod
    def auto_assign_to_available_agent(session: 'ChatSession') -> bool:
        # try to find a free agent when new session come in
        # agent must be available AND have no active session right now
        try:
            from django.db.models import Exists, OuterRef

            has_active = ChatSession.objects.filter(
                agent=OuterRef('pk'),
                status=SessionStatus.ACTIVE
            )
            available_agent = (
                User.objects
                .filter(role=UserRole.AGENT, agent_status='available', is_active=True)
                .exclude(Exists(has_active))
                .order_by('created_at')
                .first()
            )

            if not available_agent:
                # no one free, put in queue and wait
                AgentAssignmentService.enqueue_waiting_session(session)
                return False

            session.agent = available_agent
            session.status = SessionStatus.ACTIVE
            session.save()
            return True

        except Exception as e:
            logger.error(f"auto_assign error: {e}")
            # dont lose the session, enqueue it
            try:
                AgentAssignmentService.enqueue_waiting_session(session)
            except Exception:
                pass
            return False

    @staticmethod
    def get_available_agent_count() -> int:
        return User.objects.filter(role=UserRole.AGENT, is_active=True).count()

    @staticmethod
    def get_agent_load(agent_id) -> int:
        return ChatSession.objects.filter(
            agent_id=agent_id, status=SessionStatus.ACTIVE
        ).count()


class MessagePersistenceService:

    _failed_messages = {}  # keep failed ones here, maybe retry later

    @staticmethod
    def save_message(session_id, sender_id, content) -> Message:
        try:
            session = ChatSession.objects.get(id=session_id)
            sender = User.objects.get(id=sender_id)

            message = Message.objects.create(
                session=session,
                sender=sender,
                content=content,
                is_read=False
            )

            # touch session so updated_at refresh
            session.save(update_fields=['updated_at'])
            return message

        except Exception as e:
            logger.error(f"save message fail: {e}")

            # store for later, dont want to lose message
            message_key = f"{session_id}_{sender_id}_{__import__('time').time()}"
            MessagePersistenceService._failed_messages[message_key] = {
                "session_id": str(session_id),
                "sender_id": str(sender_id),
                "content": content,
            }
            return None

    @staticmethod
    def get_session_messages(session_id, limit: int = 1000):
        try:
            return Message.objects.filter(
                session_id=session_id
            ).select_related('sender').order_by('timestamp')[:limit]
        except Exception as e:
            logger.error(f"get messages fail: {e}")
            return []

    @staticmethod
    def mark_messages_as_read(session_id, reader_id) -> int:
        try:
            count = Message.objects.filter(
                session_id=session_id,
                is_read=False
            ).exclude(sender_id=reader_id).update(is_read=True)
            return count
        except Exception as e:
            logger.error(f"mark read fail: {e}")
            return 0

    @staticmethod
    def get_unread_count(session_id, user_id) -> int:
        try:
            return Message.objects.filter(
                session_id=session_id,
                is_read=False
            ).exclude(sender_id=user_id).count()
        except Exception as e:
            logger.error(f"unread count fail: {e}")
            return 0

    @staticmethod
    def get_failed_message_count() -> int:
        return len(MessagePersistenceService._failed_messages)
