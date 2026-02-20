from rest_framework import serializers
from django.contrib.auth import authenticate
from chatapp.models import User, ChatSession, Message, UserRole


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'role', 'agent_status', 'created_at')
        read_only_fields = ('id', 'created_at')


class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=UserRole.choices, default=UserRole.VISITOR)
    
    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password2', 'role')
    
    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError("Passwords do not match")
        return data
    
    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    
    def validate(self, data):
        user = authenticate(username=data['username'], password=data['password'])
        if not user:
            raise serializers.ValidationError("Invalid credentials")
        data['user'] = user
        return data


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_role = serializers.SerializerMethodField()
    sender_id = serializers.UUIDField(source='sender.id', read_only=True)
    session_id = serializers.UUIDField(source='session.id', read_only=True)

    class Meta:
        model = Message
        fields = ('id', 'session', 'session_id', 'sender', 'sender_id', 'sender_name', 'sender_role', 'content', 'timestamp', 'is_read')
        read_only_fields = ('id', 'sender', 'timestamp')

    def get_sender_name(self, obj):
        return obj.sender.username if obj.sender else 'Unknown'

    def get_sender_role(self, obj):
        return obj.sender.role if obj.sender else None


class ChatSessionSerializer(serializers.ModelSerializer):
    visitor_name = serializers.SerializerMethodField()
    visitor_email = serializers.SerializerMethodField()
    agent_name = serializers.SerializerMethodField()
    messages_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatSession
        fields = ('id', 'visitor', 'visitor_name', 'visitor_email', 'agent', 'agent_name', 'status', 'created_at', 'updated_at', 'messages_count', 'last_message')
        read_only_fields = ('id', 'created_at', 'updated_at')
    
    def get_visitor_name(self, obj):
        return obj.visitor.username if obj.visitor else 'Unknown'
    
    def get_visitor_email(self, obj):
        return obj.visitor.email if obj.visitor else ''
    
    def get_agent_name(self, obj):
        return obj.agent.username if obj.agent else None
    
    def get_messages_count(self, obj):
        return obj.messages.count()
    
    def get_last_message(self, obj):
        msg = obj.messages.order_by('-timestamp').first()
        if not msg:
            return None
        return {
            'content': msg.content[:80] + ('...' if len(msg.content) > 80 else ''),
            'sender_name': msg.sender.username if msg.sender else 'Unknown',
            'timestamp': msg.timestamp.isoformat(),
        }
