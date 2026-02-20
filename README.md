# 💬 Real-Time Multi-Agent Chat System

A full-stack real-time chat application with Next.js frontend and FastAPI backend.

**Features**: User authentication • Real-time messaging • WebSocket support • PostgreSQL • Docker ready

---

## 🚀 Quick Start

### With Docker (5 minutes)
```bash
cd D:\DEV\Alphanet
copy .env.example .env
docker-compose up -d
```

Access:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/docs

### Local Development

**Backend**:
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

**Frontend**:
```bash
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

---

## 📁 Project Structure

```
Alphanet/
├── frontend/              # Next.js + React
│   ├── src/pages/
│   ├── src/components/
│   ├── src/hooks/
│   └── package.json
├── backend/               # FastAPI + PostgreSQL
│   ├── app/
│   ├── requirements.txt
│   └── .env.example
├── docker-compose.yml
└── README.md
```

---

## 📚 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User login |
| POST | `/api/chat/sessions` | Create chat session |
| GET | `/api/chat/sessions/{id}/messages` | Get messages |
| POST | `/api/chat/sessions/{id}/messages` | Send message |
| WS | `/ws/{session_id}` | WebSocket connection |

Full docs: http://localhost:8000/docs

---

## 🛠 Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS, Zustand, Axios
- **Backend**: FastAPI, SQLAlchemy, PostgreSQL, Redis
- **Real-time**: WebSocket
- **Container**: Docker & Docker Compose

---

## ⚙️ Environment Setup

**Backend** (`.env`):
```env
DATABASE_URL=postgresql+asyncpg://chatuser:chatpass123@localhost:5432/chatdb
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-secret-key
```

**Frontend** (`.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| WebSocket connection failed | Ensure backend runs on port 8000 |
| Database connection error | Check PostgreSQL is running |
| Module not found | Run `pip install -r requirements.txt` or `npm install` |
| Port already in use | Change port in docker-compose.yml |

---

## 📝 Common Commands

**Backend**:
```bash
cd backend
uvicorn app.main:app --reload         # Start dev server
pytest tests/ -v                      # Run tests
black app/                            # Format code
```

**Frontend**:
```bash
cd frontend
npm run dev                           # Start dev server
npm run build                         # Production build
npm test                              # Run tests
```

---

## 🚀 Deployment

Ready for Docker:
```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- Backend on port 8000
- Frontend on port 3000

---

## 📖 Learning Path

1. Start the app with Docker
2. Visit http://localhost:3000 and create account
3. Check http://localhost:8000/docs for API reference
4. Explore code in `frontend/src` and `backend/app`
5. Make changes and test

---

**Questions?** Check the code comments or visit API docs at `/docs`
