# Django Chat — Real-time Multi-Agent Chat System

A full-stack live chat system where visitors can talk to support agents in real time. Built with Django Channels (WebSocket), Next.js, PostgreSQL, and Redis.

---

## Tech Stack

**Backend**
- Django 4.2 + Django REST Framework
- Django Channels 4 (WebSocket via ASGI/Daphne)
- SimpleJWT for authentication
- PostgreSQL 15
- Redis 7 (channel layer + visitor queue)

**Frontend**
- Next.js 14 + TypeScript
- Tailwind CSS
- Zustand (state management)
- Axios

---

## How it works

1. Visitor opens the chat, sends a message — gets added to a Redis queue
2. Agent logs in, sets status to **Available**
3. System auto-assigns the next visitor in queue to the agent
4. Both sides communicate over WebSocket in real time
5. Agent marks session **Complete** when done

---

## Quick Start (Docker)

```bash
git clone https://github.com/Sabbir772002/Django_Chat.git
cd Django_Chat
cp .env.example .env
docker compose up -d
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/
- Health check: http://localhost:8000/health/

---

## Project Structure

```
Django_Chat/
├── backend/
│   ├── chatapp/
│   │   ├── models.py          # User, ChatSession, Message
│   │   ├── consumers.py       # WebSocket consumer
│   │   ├── views.py           # REST API views
│   │   ├── services.py        # Queue logic, auto-assignment
│   │   ├── serializers.py
│   │   ├── signals.py
│   │   └── routing.py
│   ├── chatproject/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── asgi.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── visitor.tsx
│   │   │   └── agent.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── context/
│   │   └── utils/
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register/` | Register user |
| POST | `/api/auth/login/` | Login, returns JWT tokens |
| POST | `/api/auth/refresh/` | Refresh access token |
| GET | `/api/chat/sessions/` | List sessions |
| POST | `/api/chat/sessions/` | Create session |
| GET | `/api/chat/sessions/my_session/` | Visitor's current session |
| POST | `/api/chat/sessions/{id}/complete/` | Mark session complete |
| GET | `/api/chat/sessions/waiting/` | Queue of waiting visitors |
| POST | `/api/chat/sessions/{id}/assign/` | Assign session to agent |
| GET | `/api/chat/sessions/{id}/messages/` | Get session messages |
| GET | `/api/chat/users/me/` | Current user profile |
| PATCH | `/api/chat/users/update_status/` | Agent status (available/busy/offline) |
| WS | `ws://localhost:8000/ws/chat/{session_id}/` | WebSocket connection |

---

## Environment Variables

Copy `.env.example` to `.env`:

```env
SECRET_KEY=your-secret-key
DEBUG=True

DB_NAME=chatdb
DB_USER=chatuser
DB_PASSWORD=chatpass123
DB_HOST=postgres
DB_PORT=5432

REDIS_HOST=redis
REDIS_PORT=6379
```

---

## Local Development (without Docker)

**Backend**

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
# set DB_HOST=localhost and REDIS_HOST=localhost in .env
python manage.py migrate
python manage.py seed_agents
python manage.py runserver
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

PostgreSQL and Redis need to be running locally first.

---

## Common Commands

```bash
# rebuild after code changes
docker compose up -d --build

# view backend logs
docker compose logs -f backend

# run migrations
docker compose exec backend python manage.py migrate

# seed agent accounts
docker compose exec backend python manage.py seed_agents

# stop everything
docker compose down

# fresh start (wipes volumes)
docker compose down -v
```

---

## User Roles

| Role | Description |
|------|-------------|
| `visitor` | Start chat, send messages, end session |
| `agent` | Set availability, accept visitors, reply, close sessions |

Default agent accounts are created by the `seed_agents` management command.
