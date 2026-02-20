# Django Backend Migration Guide

## Overview

The FastAPI backend has been successfully replaced with Django + Channels while maintaining 100% API compatibility. This guide explains the changes and how to use the new backend.

## What Changed

### ✅ What Stayed the Same
- **Database Schema**: Same PostgreSQL tables (User, ChatSession, Message)
- **REST Endpoints**: Identical API routes and response formats
- **WebSocket Protocol**: Same message format and connection handling
- **Authentication**: JWT tokens work the same way
- **Message Persistence**: Triple-layer guarantee remains identical
- **Agent Assignment**: Load-balancing algorithm unchanged
- **Port**: Still runs on port 8000

### 🔄 What Changed
- **Framework**: FastAPI (async Python web framework) → Django (classic framework)
- **WebSocket Library**: FastAPI's built-in WebSockets → Django Channels
- **ASGI Server**: Uvicorn → Daphne
- **ORM**: SQLAlchemy → Django ORM
- **Authentication**: Custom JWT → SimpleJWT library
- **REST Framework**: Starlette → Django REST Framework
- **Project Structure**: Flat FastAPI structure → Django app structure

## Frontend Changes Required

Since the API endpoints are identical, frontend changes are minimal:

1. **Update API URL** (if different):
```javascript
// OLD (FastAPI)
const API_URL = 'http://localhost:8000';

// NEW (Django) - same if port is same
const API_URL = 'http://localhost:8000';
```

2. **Update WebSocket URL** (endpoint changed):
```javascript
// OLD (FastAPI)
const socket = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);

// NEW (Django)
const socket = new WebSocket(`ws://localhost:8000/ws/chat/${sessionId}/`);
```

3. **JWT Token Handling** - No changes needed, same format

## Backend File Structure

### FastAPI Structure (OLD)
```
backend/
├── app/
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│   └── ...
└── requirements.txt
```

### Django Structure (NEW)
```
backend/
├── chatproject/          # Project configuration
│   ├── settings.py       # Configuration (replaces .env)
│   ├── asgi.py          # ASGI server (Daphne + Channels)
│   ├── urls.py          # API routing (replaces main.py)
│   └── __init__.py
├── chatapp/              # Application
│   ├── models.py        # Database models (same schema)
│   ├── views.py         # REST API ViewSets
│   ├── consumers.py     # WebSocket consumers
│   ├── routing.py       # WebSocket routing
│   ├── services.py      # Business logic
│   ├── serializers.py   # Request/Response transformation
│   ├── admin.py         # Admin panel
│   ├── signals.py       # Event handlers
│   ├── tests.py         # Unit tests
│   ├── management/      # Custom commands
│   │   └── commands/
│   │       └── seed_agents.py
│   ├── migrations/      # Database migrations
│   └── __init__.py
├── manage.py            # Django CLI
├── requirements.txt     # Python dependencies
├── Dockerfile           # Container configuration
├── .env.example         # Environment variables template
└── README.md            # Documentation
```

## Key Component Mapping

### Models: SQLAlchemy → Django ORM

**FastAPI (SQLAlchemy)**:
```python
class User(Base):
    __tablename__ = "users"
    id = Column(UUID, primary_key=True)
    username = Column(String, unique=True)
    role = Column(Enum(UserRole))
```

**Django**:
```python
class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid4)
    role = models.CharField(max_length=10, choices=UserRole.choices)
```

### Views: FastAPI Routes → Django ViewSets

**FastAPI**:
```python
@app.get("/api/sessions/")
async def list_sessions(user: User = Depends(get_current_user)):
    return sessions
```

**Django**:
```python
class ChatSessionViewSet(viewsets.ModelViewSet):
    def list(self, request):
        return Response(serializer.data)
```

### WebSocket: FastAPI WebSocket → Channels Consumer

**FastAPI**:
```python
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    data = await websocket.receive_text()
```

**Django**:
```python
class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
    
    async def receive(self, text_data):
        data = json.loads(text_data)
```

## Configuration Changes

### Environment Variables

**FastAPI (.env)**:
```env
DATABASE_URL=postgresql://user:pass@localhost/db
REDIS_URL=redis://localhost:6379
JWT_SECRET=secret
```

**Django (.env)**:
```env
DB_NAME=chat_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
REDIS_URL=redis://localhost:6379
SECRET_KEY=django-secret
```

### Django Settings (settings.py)

Configuration is now centralized in `settings.py`:
- Database connection
- Installed apps
- Middleware
- Channels configuration
- JWT settings
- CORS
- Logging

See `chatproject/settings.py` for complete configuration.

## Running the Backend

### Development

```bash
# Using Django development server (no WebSocket)
python manage.py runserver

# Using Daphne ASGI (WITH WebSocket)
daphne -b 0.0.0.0 -p 8000 chatproject.asgi:application
```

### Production

```bash
# Using Daphne (behind reverse proxy like nginx)
daphne -b 0.0.0.0 -p 8000 chatproject.asgi:application

# Using Gunicorn with Daphne workers
gunicorn chatproject.asgi:application \
  --workers 4 \
  --worker-class daphne.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

## Database Migration

If migrating from FastAPI backend:

1. **Export FastAPI database**:
```bash
pg_dump chat_db > backup.sql
```

2. **Use same database** (schema is identical):
```bash
# Skip makemigrations if database already exists
# Just apply Django migrations
python manage.py migrate --run-syncdb
```

3. **Verify data integrity**:
```bash
python manage.py shell
# Check User.objects.count(), ChatSession.objects.count(), Message.objects.count()
```

## Testing

### Run All Tests
```bash
python manage.py test
```

### Run Specific Test
```bash
python manage.py test chatapp.tests.ChatSessionAPITest
```

### View Test Coverage
```bash
coverage run --source='chatapp' manage.py test
coverage report
```

## Troubleshooting

### WebSocket Not Working
1. Verify using Daphne: `daphne -b 0.0.0.0 -p 8000 chatproject.asgi:application`
2. Check Channels configuration in `settings.py`
3. Verify Redis is running for Channels layer

### Messages Not Saving
1. Check PostgreSQL connection: `python manage.py dbshell`
2. Run migrations: `python manage.py migrate`
3. Check logs for database errors

### JWT Token Issues
1. Verify token in Authorization header: `Authorization: Bearer {token}`
2. Check token expiration: 30 minutes default
3. Refresh token if expired

### Admin Panel Access
1. Create superuser: `python manage.py createsuperuser`
2. Access at `http://localhost:8000/admin/`

## Performance Optimization

### Database Queries
- Use `select_related()` for foreign keys
- Use `prefetch_related()` for reverse relations
- Index on frequently queried fields (done in models)

### Caching
- Redis used for Channels pub/sub
- Consider Redis caching for agent loads

### WebSocket Scaling
- Use Redis backend for Channels to scale horizontally
- Multiple app instances share same Redis connection pool

## Admin Panel Features

Access `http://localhost:8000/admin/`:

- **User Management**: Create, edit, filter by role
- **Session Management**: View sessions with status coloring
- **Message Browsing**: Search and view message content
- **Inline Editing**: Modify records directly

## Documentation

- **README.md**: Complete backend documentation
- **API Docs**: Swagger UI (auto-generated from DRF)
- **Models**: See `chatapp/models.py` for schema
- **Services**: See `chatapp/services.py` for business logic
- **Tests**: See `chatapp/tests.py` for examples

## Building Forward

### Adding Features

1. **New Model**: Define in `models.py` → Create migration → Add serializer → Create ViewSet
2. **New Endpoint**: Add method to ViewSet → Update routing → Test
3. **New Signal**: Define in `signals.py` → Ready to use
4. **New Management Command**: `management/commands/command_name.py` → Run `python manage.py command_name`

### Extensibility

- Django signals for event handling
- Channels consumer groups for targeted messaging
- Celery for background tasks
- Django admin customization
- Custom serializer validators

## Rollback Plan

If needed to return to FastAPI:

1. Database is identical - works with both backends
2. Restore old FastAPI code
3. Reinstall FastAPI dependencies: `pip install -r requirements_fastapi.txt`
4. Run old main.py: `uvicorn app.main:app`

## Support

For questions or issues:
- Check README.md
- Review test cases in tests.py
- Check Django documentation: https://docs.djangoproject.com/
- Check Channels documentation: https://channels.readthedocs.io/
