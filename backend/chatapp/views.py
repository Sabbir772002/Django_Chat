import logging
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q
from datetime import datetime

from chatapp.models import ChatSession, Message, User, SessionStatus
from chatapp.serializers import (
    ChatSessionSerializer,
    MessageSerializer,
    UserSerializer,
    UserRegisterSerializer,
    UserLoginSerializer
)
from chatapp.services import (
    MessagePersistenceService,
    AgentAssignmentService
)

logger = logging.getLogger('chatapp')


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def register_user(request):
    serializer = UserRegisterSerializer(data=request.data)
    
    if serializer.is_valid():
        user = serializer.save()
        logger.info(f"user registered: {user.username} ({user.role})")
        refresh = RefreshToken.for_user(user)
        user_data = UserSerializer(user).data
        
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': user_data,
            'message': 'Registration successful. Logged in.'
        }, status=status.HTTP_201_CREATED)
    
    logger.warning(f"registration fail: {serializer.errors}")
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def login_user(request):
    from django.contrib.auth import authenticate
    
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return Response(
            {'error': 'Username and password required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user = authenticate(username=username, password=password)
        
        if user is None:
            logger.warning(f"failed login for: {username}")
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        refresh = RefreshToken.for_user(user)
        user_data = UserSerializer(user).data
        logger.info(f"user login: {user.username}")
        
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': user_data,
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"login error: {e}")
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )


class ChatSessionViewSet(viewsets.ModelViewSet):
    queryset = ChatSession.objects.all()
    serializer_class = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        
        if user.role == 'visitor':
            return ChatSession.objects.filter(visitor=user).order_by('-created_at')
        elif user.role == 'agent':
            return ChatSession.objects.filter(agent=user).order_by('-created_at')
        
        return ChatSession.objects.none()
    
    def create(self, request, *args, **kwargs):
        if request.user.role != 'visitor':
            return Response(
                {'error': 'Only visitors can create sessions'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            # Reuse any existing waiting or active session
            existing = ChatSession.objects.filter(
                visitor=request.user,
                status__in=[SessionStatus.WAITING, SessionStatus.ACTIVE]
            ).order_by('-created_at').first()

            if existing:
                logger.info(f"reusing session {existing.id} ({existing.status})")
                serializer = self.get_serializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)

            session = ChatSession.objects.create(
                visitor=request.user,
                status=SessionStatus.WAITING
            )

            AgentAssignmentService.auto_assign_to_available_agent(session)
            session.refresh_from_db()

            if session.status == SessionStatus.ACTIVE and session.agent_id:
                try:
                    from channels.layers import get_channel_layer
                    from asgiref.sync import async_to_sync
                    _cl = get_channel_layer()
                    if _cl:
                        async_to_sync(_cl.group_send)(
                            f'chat_{session.id}',
                            {
                                'type': 'agent_assigned',
                                'agent_id': str(session.agent_id),
                                'agent_name': session.agent.username,
                                'session_id': str(session.id),
                                'timestamp': datetime.now().isoformat(),
                            }
                        )
                except Exception as ws_err:
                    logger.warning(f"WS broadcast agent_assigned (create) failed: {ws_err}")

            logger.info(f"session created {session.id} status={session.status}")

            if session.status == SessionStatus.WAITING:
                try:
                    from channels.layers import get_channel_layer
                    from asgiref.sync import async_to_sync
                    _cl = get_channel_layer()
                    if _cl:
                        async_to_sync(_cl.group_send)(
                            'agents_room',
                            {
                                'type': 'new_waiting_session',
                                'session_id': str(session.id),
                                'visitor_name': request.user.username,
                            }
                        )
                except Exception as ws_err:
                    logger.warning(f"WS broadcast new_waiting_session failed: {ws_err}")

            serializer = self.get_serializer(session)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"create session error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'], url_path='my-session')
    def my_session(self, request):
        if request.user.role != 'visitor':
            return Response(
                {'error': 'Only visitors can use this endpoint'},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            session = ChatSession.objects.filter(
                visitor=request.user,
                status__in=[SessionStatus.WAITING, SessionStatus.ACTIVE]
            ).order_by('-created_at').first()
            if not session:
                return Response({'session': None})
            serializer = self.get_serializer(session)
            return Response({'session': serializer.data})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        session = self.get_object()
        user = request.user

        if session.visitor_id != user.id and session.agent_id != user.id:
            return Response(
                {'error': 'You do not have permission to complete this session'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if session.status == SessionStatus.CLOSED:
            return Response(
                {'error': 'Session is already closed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            agent = session.agent
            session.status = SessionStatus.CLOSED
            session.save()
            logger.info(f"session {session.id} completed by {user.username}")

            # Real-time: notify the visitor on this session immediately
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            _cl = get_channel_layer()
            if _cl:
                try:
                    async_to_sync(_cl.group_send)(
                        f'chat_{session.id}',
                        {
                            'type': 'session_completed',
                            'session_id': str(session.id),
                            'timestamp': datetime.now().isoformat(),
                        }
                    )
                except Exception as ws_err:
                    logger.warning(f"WS broadcast session_completed failed: {ws_err}")

            if agent and agent.role == 'agent':
                agent.agent_status = 'offline'
                agent.save(update_fields=['agent_status'])
                logger.info(f"agent {agent.username} now offline")

            serializer = self.get_serializer(session)
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f"complete session error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'], url_path='my-active')
    def my_active(self, request):
        if request.user.role != 'agent':
            return Response(
                {'error': 'Only agents can view their active sessions'},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            sessions = ChatSession.objects.filter(
                agent=request.user,
                status=SessionStatus.ACTIVE
            ).order_by('-updated_at')
            serializer = self.get_serializer(sessions, many=True)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='waiting/list')
    def waiting(self, request):
        if request.user.role != 'agent':
            return Response(
                {'error': 'Only agents can view waiting sessions'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            waiting_sessions = ChatSession.objects.filter(
                status=SessionStatus.WAITING
            ).order_by('-updated_at')

            serializer = self.get_serializer(waiting_sessions, many=True)
            logger.info(f"waiting sessions: {waiting_sessions.count()}")
            
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f"waiting sessions error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        session = self.get_object()
        user = request.user
        
        if user.role != 'agent':
            return Response(
                {'error': 'Only agents can assign sessions'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if session.status != SessionStatus.WAITING:
            return Response(
                {'error': 'Session is not waiting'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            session.agent = user
            session.status = SessionStatus.ACTIVE
            session.save()
            
            logger.info(f"session {session.id} assigned to {user.username}")
            
            serializer = self.get_serializer(session)
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f"assign session error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        session = self.get_object()

        if session.visitor_id != request.user.id and session.agent_id != request.user.id:
            return Response(
                {'error': 'You do not have permission to view these messages'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            messages = MessagePersistenceService.get_session_messages(session.id)
            serializer = MessageSerializer(messages, many=True)
            logger.info(f"fetched {len(messages)} messages for session {session.id}")
            
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f"get messages error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        session = self.get_object()

        if session.visitor_id != request.user.id and session.agent_id != request.user.id:
            return Response(
                {'error': 'No permission'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            count = MessagePersistenceService.mark_messages_as_read(
                session.id,
                request.user.id
            )
            
            return Response({'marked_as_read': count})
            
        except Exception as e:
            logger.error(f"mark read error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        return Message.objects.filter(
            session__in=ChatSession.objects.filter(
                Q(visitor=user) | Q(agent=user)
            )
        ).order_by('-timestamp')
    
    def create(self, request, *args, **kwargs):
        session_id = request.data.get('session')
        content = request.data.get('content', '').strip()
        
        if not content:
            return Response(
                {'error': 'Message content cannot be empty'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not session_id and request.user.role == 'visitor':
            existing = ChatSession.objects.filter(
                visitor=request.user,
                status__in=[SessionStatus.WAITING, SessionStatus.ACTIVE]
            ).order_by('-created_at').first()
            if existing:
                session_id = str(existing.id)
            else:
                new_session = ChatSession.objects.create(
                    visitor=request.user,
                    status=SessionStatus.WAITING
                )
                AgentAssignmentService.auto_assign_to_available_agent(new_session)
                new_session.refresh_from_db()
                session_id = str(new_session.id)
                logger.info(f"Auto-created session {new_session.id} for visitor message with no session")

        if not session_id:
            return Response(
                {'error': 'session is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            session = ChatSession.objects.get(id=session_id)
            
            if session.visitor_id != request.user.id and session.agent_id != request.user.id:
                return Response(
                    {'error': 'You do not have permission to send messages in this session'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            message = MessagePersistenceService.save_message(
                session_id,
                request.user.id,
                content
            )
            
            if not message:
                return Response(
                    {'error': 'Failed to save message'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            logger.info(f"message {message.id} saved in {session_id}")
            
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f'chat_{session_id}',
                    {
                        'type': 'chat_message',
                        'message_id': str(message.id),
                        'sender_id': str(message.sender_id),
                        'sender_name': message.sender.username,
                        'sender_role': message.sender.role,
                        'content': message.content,
                        'timestamp': message.timestamp.isoformat(),
                        'is_read': message.is_read,
                    }
                )
            
            serializer = self.get_serializer(message)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except ChatSession.DoesNotExist:
            return Response(
                {'error': 'Session not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"create message error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'])
    def session_messages(self, request):
        session_id = request.query_params.get('session_id')
        
        if not session_id:
            return Response(
                {'error': 'session_id query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            session = ChatSession.objects.get(id=session_id)

            if session.visitor_id != request.user.id and session.agent_id != request.user.id:
                return Response(
                    {'error': 'No permission'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            messages = MessagePersistenceService.get_session_messages(session_id)
            serializer = MessageSerializer(messages, many=True)
            
            return Response(serializer.data)
            
        except ChatSession.DoesNotExist:
            return Response(
                {'error': 'Session not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"session messages error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return User.objects.filter(role='agent', is_active=True)

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my-messages')
    def my_messages(self, request):
        if request.user.role != 'visitor':
            return Response(
                {'error': 'Only visitors can use this endpoint'},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            session_ids = ChatSession.objects.filter(
                visitor=request.user
            ).values_list('id', flat=True)
            messages = Message.objects.filter(
                session_id__in=session_ids
            ).order_by('timestamp')
            serializer = MessageSerializer(messages, many=True)
            return Response({'messages': serializer.data})
        except Exception as e:
            logger.error(f"my_messages error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def agents(self, request):
        agents = User.objects.filter(role='agent', is_active=True)
        
        agents_data = []
        for agent in agents:
            load = AgentAssignmentService.get_agent_load(agent.id)
            serializer = UserSerializer(agent)
            agent_info = serializer.data
            agent_info['active_sessions'] = load
            agents_data.append(agent_info)
        
        logger.info(f"agents fetched: {len(agents_data)}")
        
        return Response(agents_data)
    
    @action(detail=False, methods=['get'])
    def agent_stats(self, request):
        total_agents = AgentAssignmentService.get_available_agent_count()
        active_sessions = ChatSession.objects.filter(
            status=SessionStatus.ACTIVE
        ).count()
        waiting_sessions = ChatSession.objects.filter(
            status=SessionStatus.WAITING
        ).count()
        
        return Response({
            'total_agents': total_agents,
            'active_sessions': active_sessions,
            'waiting_sessions': waiting_sessions,
            'failed_messages': MessagePersistenceService.get_failed_message_count()
        })
    
    @action(detail=False, methods=['get'], url_path='active-users')
    def active_users(self, request):
        try:
            active_users = User.objects.filter(
                Q(visitor_sessions__status=SessionStatus.ACTIVE) |
                Q(agent_sessions__status=SessionStatus.ACTIVE)
            ).distinct()
            
            serializer = UserSerializer(active_users, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"active users error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def update_status(self, request):
        from chatapp.models import AgentStatus
        
        if request.user.role != 'agent':
            return Response(
                {'error': 'Only agents can update status'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        new_status = request.data.get('status')
        
        if not new_status:
            return Response(
                {'error': 'Status is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        valid_statuses = [choice[0] for choice in AgentStatus.choices]
        if new_status not in valid_statuses:
            return Response(
                {'error': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = request.user
            user.agent_status = new_status
            user.save(update_fields=['agent_status'])
            
            logger.info(f"agent {user.username} status -> {new_status}")
            
            next_session = None
            next_session_data = None

            if new_status == 'available':
                # only assign if no active session already
                already_active = ChatSession.objects.filter(
                    agent=user, status=SessionStatus.ACTIVE
                ).first()
                if not already_active:
                    next_session = AgentAssignmentService.assign_next_to_agent(user)
                else:
                    next_session = already_active

            if next_session:
                from chatapp.serializers import ChatSessionSerializer as CSS
                next_session_data = CSS(next_session).data
                if getattr(next_session, 'agent_id', None) == user.id and next_session.status == SessionStatus.ACTIVE:
                    try:
                        from channels.layers import get_channel_layer
                        from asgiref.sync import async_to_sync
                        _cl = get_channel_layer()
                        if _cl:
                            async_to_sync(_cl.group_send)(
                                f'chat_{next_session.id}',
                                {
                                    'type': 'agent_assigned',
                                    'agent_id': str(user.id),
                                    'agent_name': user.username,
                                    'session_id': str(next_session.id),
                                    'timestamp': datetime.now().isoformat(),
                                }
                            )
                    except Exception as ws_err:
                        logger.warning(f"WS broadcast agent_assigned (status) failed: {ws_err}")

            serializer = self.get_serializer(user)
            return Response({
                'message': f'Status updated to {new_status}',
                'user': serializer.data,
                'next_session': next_session_data,
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"update_status error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'], url_path='all-visitors')
    def all_visitors(self, request):
        if request.user.role != 'agent':
            return Response(
                {'error': 'Only agents can view all visitors'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            visitors = User.objects.filter(
                role='visitor',
                is_active=True
            ).annotate(
                session_count=Q(visitor_sessions__isnull=False)
            ).distinct()
            
            visitors_data = []
            for visitor in visitors:
                # Get latest session with this visitor
                latest_session = ChatSession.objects.filter(
                    visitor=visitor
                ).order_by('-updated_at').first()
                
                visitor_info = UserSerializer(visitor).data
                if latest_session:                    visitor_info['latest_session_id'] = str(latest_session.id)
                    visitor_info['latest_session_status'] = latest_session.status
                    visitor_info['last_contacted'] = latest_session.updated_at.isoformat()
                
                session_count = ChatSession.objects.filter(visitor=visitor).count()
                visitor_info['total_sessions'] = session_count
                
                visitors_data.append(visitor_info)
            
            logger.info(f"visitors fetched: {len(visitors_data)}")
            return Response(visitors_data)
            
        except Exception as e:
            logger.error(f"all_visitors error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'], url_path='visitor-messages')
    def visitor_messages(self, request):
        if request.user.role != 'agent':
            return Response(
                {'error': 'Only agents can view visitor messages'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        visitor_id = request.query_params.get('visitor_id')
        if not visitor_id:
            return Response(
                {'error': 'visitor_id query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            sessions = ChatSession.objects.filter(visitor_id=visitor_id).values_list('id', flat=True)
            messages = Message.objects.filter(
                session_id__in=sessions
            ).order_by('timestamp')
            
            serializer = MessageSerializer(messages, many=True)
            logger.info(f"visitor {visitor_id}: {len(messages)} messages")
            
            return Response({
                'visitor_id': visitor_id,
                'total_messages': len(messages),
                'messages': serializer.data
            })
            
        except Exception as e:
            logger.error(f"visitor_messages error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

