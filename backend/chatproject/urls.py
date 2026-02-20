from django.urls import path, include
from django.http import HttpResponse
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from chatapp.views import (
    MessageViewSet, UserViewSet, ChatSessionViewSet, 
    login_user, register_user
)

router = DefaultRouter()
router.register(r'sessions', ChatSessionViewSet, basename='session')
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'users', UserViewSet, basename='user')

agents_router = DefaultRouter()

def health_check(request):
    return HttpResponse('OK')

urlpatterns = [
    path('api/auth/login/', login_user, name='login'),
    path('api/auth/register/', register_user, name='register'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/chat/', include(router.urls)),
    path('health/', health_check),
]
