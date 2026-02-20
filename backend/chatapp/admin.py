from django.contrib import admin
from django.utils.html import format_html
from chatapp.models import User, ChatSession, Message


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'role', 'created_at', 'is_active')
    list_filter = ('role', 'is_active', 'created_at')
    search_fields = ('username', 'email')
    readonly_fields = ('id', 'created_at')
    fieldsets = (
        ('Account Info', {
            'fields': ('id', 'username', 'email', 'password')
        }),
        ('Role', {
            'fields': ('role',)
        }),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser')
        }),
        ('Timestamps', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'visitor', 'agent', 'status_colored', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('visitor__username', 'agent__username')
    readonly_fields = ('id', 'created_at', 'updated_at')
    
    def status_colored(self, obj):
        colors = {
            'waiting': '#FFA500',
            'active': '#00AA00',
            'closed': '#FF0000',
        }
        color = colors.get(obj.status, '#000000')
        return format_html(
            '<span style="color: white; background-color: {}; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.get_status_display()
        )
    status_colored.short_description = 'Status'
    
    fieldsets = (
        ('Session Info', {
            'fields': ('id', 'visitor', 'agent', 'status')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'session', 'sender', 'content_preview', 'timestamp', 'is_read')
    list_filter = ('is_read', 'timestamp')
    search_fields = ('session__id', 'sender__username', 'content')
    readonly_fields = ('id', 'timestamp')
    
    def content_preview(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = 'Content'
    
    fieldsets = (
        ('Message Info', {
            'fields': ('id', 'session', 'sender', 'is_read')
        }),
        ('Content', {
            'fields': ('content',)
        }),
        ('Timestamp', {
            'fields': ('timestamp',),
            'classes': ('collapse',)
        }),
    )
