# Django Chat Backend

Production-grade real-time chat system with automatic agent assignment and message persistence.

## Features

✅ **Real-Time Communication** - WebSocket support via Django Channels
✅ **Message Persistence** - Triple-layer guarantee (Database → WebSocket → Redis)
✅ **Automatic Agent Assignment** - Load-balanced agent assignment with LRU algorithm
✅ **JWT Authentication** - SimpleJWT token-based authentication
✅ **REST API** - Comprehensive HTTP API using Django REST Framework
✅ **Multi-Role Support** - Separate visitor and agent roles
✅ **Admin Panel** - Django admin with custom filters and inline editing
✅ **Redis Integration** - Pub/Sub for real-time messaging and caching

## Architecture

```
HTTP Request → Django URLRouter → ViewSets → Serializers → Models → PostgreSQL
WebSocket → Channels → Consumers → Services → Redis/Database
```

### Components

- **Views** (DRF ViewSets): Handle HTTP requests and business logic
- **Consumers** (Channels): Handle WebSocket connections and real-time messaging
- **Services**: Handle persistence, assignment, and Redis operations
- **Models**: Database schema (User, ChatSession, Message)
- **Serializers**: Request/Response data transformation
- **Signals**: Django signals for event handling

## Tech Stack

- **Framework**: Django 4.2.10
- **WebSocket**: Django Channels 4.0.0 with Daphne ASGI server
- **API**: Django REST Framework with SimpleJWT authentication
- **Database**: PostgreSQL 15 with psycopg2-binary
- **Cache/PubSub**: Redis 7
- **Password**: Argon2-cffi for secure hashing
- **Async**: Celery for background tasks
- **Port**: 8000 (same as FastAPI)

## Setup and Installation

### Prerequisites

- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Docker (optional)

### Local Development

1. **Create virtual environment**:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install dependencies**:
```bash
pip install -r requirements.txt
```

3. **Create .env file**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Run migrations**:
```bash
python manage.py makemigrations
python manage.py migrate
```

5. **Create superuser for admin panel**:
```bash
python manage.py createsuperuser
```

6. **Seed initial agents**:
```bash
python manage.py seed_agents
```

7. **Run development server**:
```bash
python manage.py runserver
# OR for Daphne ASGI (includes WebSocket support):
daphne -b 0.0.0.0 -p 8000 chatproject.asgi:application
```

### Docker Setup

1. **Build image**:
```bash
docker build -t django-chat-backend .
```

2. **Run container**:
```bash
docker run -p 8000:8000 \
  --env DB_HOST=postgres \
  --env DB_NAME=chat_db \
  --env DB_USER=postgres \
  --env DB_PASSWORD=postgres \
  --env REDIS_URL=redis://redis:6379 \
  django-chat-backend
```

3. **Using Docker Compose** (recommended):
```bash
docker-compose up -d backend
```

## API Endpoints

### Authentication

- `POST /api/auth/register/` - Register new user
- `POST /api/auth/login/` - Get JWT tokens
- `POST /api/auth/refresh/` - Refresh access token

### Sessions

- `GET /api/sessions/` - List user's sessions
- `POST /api/sessions/` - Create new session (for visitors)
- `GET /api/sessions/{id}/` - Get session details
- `POST /api/sessions/{id}/complete/` - Complete session
- `GET /api/sessions/{id}/messages/` - Get session messages
- `POST /api/sessions/{id}/mark_read/` - Mark messages as read

### Messages

- `GET /api/messages/` - List messages (from user's sessions)
- `POST /api/messages/` - Send message in session
- `GET /api/messages/session_messages/` - Get messages by session (query param: session_id)

### Users

- `GET /api/users/me/` - Get current user info
- `GET /api/users/agents/` - List all active agents with load
- `GET /api/users/agent_stats/` - Get system statistics

### Health Check

- `GET /health/` - Health check endpoint

## WebSocket Endpoints

### Chat Connection

```javascript
// Connect to WebSocket
const socket = new WebSocket('ws://localhost:8000/ws/chat/{session_id}/');

// Send message
socket.send(JSON.stringify({
  message: 'Hello, agent!'
}));

// Message format from server
{
  type: 'message',
  message_id: 'uuid',
  sender_id: 'uuid',
  sender_name: 'username',
  content: 'message content',
  timestamp: '2024-01-01T12:00:00Z',
  is_read: false
}
```

## Authentication Flow

1. **Register User**:
```bash
POST /api/auth/register/
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "secure_password",
  "password2": "secure_password",
  "role": "visitor"  # or "agent"
}
```

2. **Login**:
```bash
POST /api/auth/login/
{
  "username": "john_doe",
  "password": "secure_password"
}

Response:
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

3. **Use Access Token**:
```bash
Authorization: Bearer {access_token}
```

4. **Refresh Token**:
```bash
POST /api/auth/refresh/
{
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

## Message Persistence Guarantee

Messages are persisted through three layers:

1. **Database Layer** (Primary)
   - Saved immediately when message is sent
   - Indexed by session and timestamp for fast retrieval

2. **WebSocket Layer** (Broadcast)
   - Broadcast to all connected clients in session via Channels
   - Real-time delivery if clients are connected

3. **Polling Layer** (Fallback)
   - Frontend polls every 3 seconds for missed messages
   - Guarantees delivery even if WebSocket drops

## Agent Assignment

When a visitor creates a session:

1. System queries all active agents
2. Calculates load (active sessions per agent)
3. Assigns to agent with lowest load (LRU algorithm)
4. Updates session status to ACTIVE
5. Notifies both parties via WebSocket

**Example Load Distribution**:
```
Agent Sarah: 2 active sessions → Assign new visitor
Agent John:  4 active sessions
Agent Mike:  3 active sessions
```

## Environment Variables

See `.env.example` for complete list:

```env
# Django
DEBUG=True
SECRET_KEY=your-secret-key-here
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (PostgreSQL)
DB_ENGINE=django.db.backends.postgresql
DB_NAME=chat_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432

# Redis
REDIS_URL=redis://localhost:6379/0

# Channels
CHANNEL_LAYERS_HOST=localhost
CHANNEL_LAYERS_PORT=6379

# JWT
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=0.5  # 30 minutes

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://frontend:3000

# Logging
LOG_LEVEL=DEBUG
```

## Database Models

### User (Custom AbstractUser)
```python
- id (UUID PK)
- username (unique)
- email (unique)
- password (hashed)
- role (visitor|agent)
- is_active (bool)
- created_at (timestamp)
```

### ChatSession
```python
- id (UUID PK)
- visitor (FK to User)
- agent (FK to User, nullable)
- status (waiting|active|closed)
- created_at (timestamp)
- updated_at (timestamp)
```

### Message
```python
- id (UUID PK)
- session (FK to ChatSession)
- sender (FK to User)
- content (text)
- timestamp (datetime, indexed)
- is_read (bool)
```

## Logging

Logs are output to console and include:

- INFO: Normal operations (user login, session creation, messages sent)
- WARNING: Non-critical issues (no available agents, connection timeout)
- ERROR: Critical failures (database errors, message send failures)

Example log format:
```
✅ Message saved - Session: 550e8400-e29b-41d4-a716-446655440000, Sender: john_doe, Length: 42
❌ Failed to save message: Connection refused
⚠️  No available agents for session {session_id}
```

## Admin Panel

Access at `http://localhost:8000/admin/`

Features:
- User management with role filtering
- Session management with status coloring
- Message browsing with content preview
- Inline editing and filtering

## Troubleshooting

### WebSocket Connection Fails
- Check Daphne is running on port 8000
- Verify CORS origin in settings.py
- Ensure Redis is running for Channels layer

### Messages Not Persisting
- Verify PostgreSQL is running
- Check database migration status: `python manage.py showmigrations`
- View logs for database errors

### Agent Not Assigned
- Check if agents exist: `python manage.py seed_agents`
- Verify agents are marked is_active=True in database
- Check assignment logic in services.py

### JWT Token Errors
- Verify token is sent in Authorization header
- Check token expiration time in settings
- Refresh token if expired

## Development Commands

```bash
# Create migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Seed test data
python manage.py seed_agents

# Run development server
python manage.py runserver

# Run Daphne ASGI (includes WebSocket)
daphne -b 0.0.0.0 -p 8000 chatproject.asgi:application

# Shell for interactive testing
python manage.py shell

# View database queries (for debugging)
# In settings.py, set DEBUG=True and use django.db.connection.queries
```

## Testing

```bash
# Run tests
python manage.py test

# Run with verbose output
python manage.py test --verbosity=2

# Run specific app
python manage.py test chatapp

# Run specific test class
python manage.py test chatapp.tests.ChatSessionTest

# Run with coverage
coverage run --source='chatapp' manage.py test
coverage report
```

## Performance Considerations

1. **Message Indexing**: Messages indexed by (session, timestamp) for fast retrieval
2. **Agent Load**: Cached in memory, recalculated on assignment
3. **Redis PubSub**: Channels layer configured with 1500 capacity and 10-second expiry
4. **Database Pooling**: Recommended to use connection pooling in production
5. **WebSocket Scaling**: Use Redis backend with Channels for multi-process scaling

## Migration from FastAPI

This Django backend maintains API-compatibility with the FastAPI version:
- Same REST endpoints (different implementation)
- Same database schema (Django ORM instead of SQLAlchemy)
- Same JWT token format (SimpleJWT instead of custom)
- Same WebSocket message format (Channels instead of WebSockets library)

Frontend code requires minimum changes - update API base URL only.

## Production Deployment

1. **Set DEBUG=False**
2. **Use strong SECRET_KEY**
3. **Configure ALLOWED_HOSTS**
4. **Use environment-specific .env**
5. **Enable HTTPS/WSS**
6. **Use production ASGI server** (typically behind reverse proxy)
7. **Configure Redis with authentication**
8. **Use managed PostgreSQL**
9. **Set up proper logging and monitoring**
10. **Enable CORS for production domain**

## Contributing

- Follow PEP 8 style guide
- Add docstrings to all functions
- Test changes before committing
- Update README for new features

## License

[Your License Here]

## Support

For issues, questions, or contributions, please contact the development team.
