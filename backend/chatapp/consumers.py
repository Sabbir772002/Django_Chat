import json
import logging
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from datetime import datetime

from chatapp.models import ChatSession, Message, SessionStatus, User
from chatapp.services import MessagePersistenceService, AgentAssignmentService

logger = logging.getLogger('chatapp')


class ChatConsumer(AsyncWebsocketConsumer):
    
    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.room_group_name = f'chat_{self.session_id}'
        
        self.user = self.scope.get('user')
        self.user_id = self.user.id if self.user and self.user.is_authenticated else None

        if not self.user_id:
            self.user_id = await self._authenticate_from_query()

        if not self.user_id:
            logger.warning(f"unauth ws connect to {self.session_id}")
            await self.close()
            return

        session_exists = await self._verify_session_ownership()
        if not session_exists:
            logger.warning(f"unauthorized ws {self.session_id} by {self.user_id}")
            await self.close()
            return
        
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        self.is_agent = False
        user = await self._get_user()
        if user and user.role == 'agent':
            self.is_agent = True
            await self.channel_layer.group_add('agents_room', self.channel_name)

        await self.accept()
        logger.info(f"ws connect: user {self.user_id} session {self.session_id}")

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_connected',
                'user_id': str(self.user_id),
                'timestamp': datetime.now().isoformat()
            }
        )

        user = await self._get_user()
        if user and user.role == 'visitor':
            await self._handle_visitor_connection()
    
    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

            if getattr(self, 'is_agent', False):
                await self.channel_layer.group_discard('agents_room', self.channel_name)

            user_id = getattr(self, 'user_id', None)
            session_id = getattr(self, 'session_id', '?')
            logger.info(f"ws disconnect: user {user_id} session {session_id}")

            if user_id:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'user_disconnected',
                        'user_id': str(user_id),
                        'timestamp': datetime.now().isoformat()
                    }
                )
    
    async def receive(self, text_data):
        # messages usually come via HTTP POST, this is just fallback for direct WS clients
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(json.dumps({'type': 'pong'}))
                return
            message_content = data.get('message', '').strip()
            if not message_content:
                return
            message = await self._save_message(message_content)
            if not message:
                await self.send(json.dumps({'type': 'error', 'message': 'Failed to save message'}))
                return
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'message_id': str(message.id),
                    'sender_id': str(message.sender_id),
                    'sender_name': message.sender.username,
                    'sender_role': message.sender.role,
                    'content': message.content,
                    'timestamp': message.timestamp.isoformat(),
                    'is_read': message.is_read
                }
            )
        except json.JSONDecodeError:
            await self.send(json.dumps({'type': 'error', 'message': 'Invalid JSON'}))
        except Exception as e:
            logger.error(f"ws receive error: {e}")
            await self.send(json.dumps({'type': 'error', 'message': str(e)}))
    
    async def chat_message(self, event):
        await self.send(json.dumps({
            'type': 'message',
            'message_id': event['message_id'],
            'sender_id': event['sender_id'],
            'sender_name': event['sender_name'],
            'sender_role': event.get('sender_role', ''),
            'content': event['content'],
            'timestamp': event['timestamp'],
            'is_read': event['is_read']
        }))
    
    async def user_connected(self, event):
        await self.send(json.dumps({
            'type': 'user_connected',
            'user_id': event['user_id'],
            'timestamp': event['timestamp']
        }))
    
    async def user_disconnected(self, event):
        await self.send(json.dumps({
            'type': 'user_disconnected',
            'user_id': event['user_id'],
            'timestamp': event['timestamp']
        }))
    
    async def session_completed(self, event):
        await self.send(json.dumps({
            'type': 'session_completed',
            'session_id': event['session_id'],
            'timestamp': event['timestamp']
        }))
    
    async def agent_assigned(self, event):
        await self.send(json.dumps({
            'type': 'agent_assigned',
            'agent_id': event['agent_id'],
            'agent_name': event['agent_name'],
            'session_id': event.get('session_id', ''),
            'timestamp': event['timestamp']
        }))

    async def new_waiting_session(self, event):
        await self.send(json.dumps({
            'type': 'new_waiting_session',
            'session_id': event['session_id'],
            'visitor_name': event.get('visitor_name', ''),
        }))
    
    async def _authenticate_from_query(self):
        # pull JWT from ?token= query param
        try:
            from urllib.parse import parse_qs, unquote
            from rest_framework_simplejwt.tokens import AccessToken
            from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
            import uuid
            
            query_bytes = self.scope.get('query_string', b'')
            query_string = query_bytes.decode('utf-8')
            if not query_string:
                return None
            
            params = parse_qs(query_string)
            token_list = params.get('token')
            if not token_list:
                return None

            token = token_list[0]
            
            validated_token = AccessToken(token)
            user_id_raw = validated_token.get('user_id')
            
            if not user_id_raw:
                return None
            
            try:
                user_id = uuid.UUID(str(user_id_raw))
            except (ValueError, AttributeError):
                logger.debug(f"bad uuid in token: {user_id_raw}")
                return None

            user_exists = await self._user_exists(user_id)
            if user_exists:
                logger.debug(f"token auth ok: {user_id}")
                return user_id
                
        except Exception as e:
            logger.debug(f"Token authentication failed: {e}")
        
        return None
    
    @database_sync_to_async
    def _user_exists(self, user_id):
        try:
            return User.objects.filter(id=user_id).exists()
        except Exception:
            return False

    @database_sync_to_async
    def _verify_session_ownership(self):
        try:
            import uuid
            session = ChatSession.objects.get(id=self.session_id)

            user_id_str = str(self.user_id)
            visitor_id_str = str(session.visitor_id) if session.visitor_id else None
            agent_id_str = str(session.agent_id) if session.agent_id else None

            if user_id_str == visitor_id_str:
                return True
            if user_id_str == agent_id_str:
                return True
            if visitor_id_str == user_id_str:
                return True

            return False
        except ChatSession.DoesNotExist:
            logger.warning(f"session {self.session_id} not found")
            return False
    
    @database_sync_to_async
    def _get_user(self):
        try:
            return User.objects.get(id=self.user_id)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_session(self):
        try:
            return ChatSession.objects.get(id=self.session_id)
        except ChatSession.DoesNotExist:
            return None

    @database_sync_to_async
    def _save_message(self, content):
        try:
            return MessagePersistenceService.save_message(
                self.session_id,
                self.user_id,
                content
            )
        except Exception as e:
            logger.error(f"save message error: {e}")
            return None
    
    @database_sync_to_async
    def _handle_visitor_connection(self):
        """
        Previously tried to auto-assign on WS connect — removed.
        Session creation (HTTP POST) already calls auto_assign_to_available_agent
        which correctly requires agent_status='available' and no active sessions.
        Doing it again here would bypass that check and assign to offline agents.
        """
        return None
