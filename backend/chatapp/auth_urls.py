from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from chatapp.views import register_user

app_name = 'auth'

urlpatterns = [
    path('register/', register_user, name='register'),
]
