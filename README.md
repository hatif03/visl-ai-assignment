# AI Candidate Screening Platform

An AI-powered recruitment pipeline that automates candidate evaluation, scoring, and interview scheduling with full explainability.

## Features

- **Multi-Sheet Excel Upload**: Upload candidate data and test scores from multi-sheet Excel files with intelligent sheet detection
- **Resume Processing**: Automatic download and text extraction from Google Drive PDF links via `pdfplumber`
- **AI Evaluation**: LLM-powered candidate assessment (Gemini/Groq) with structured JSON output and natural language justifications
- **Semantic Matching**: Cosine similarity on Gemini embeddings (`gemini-embedding-001`) between candidate profiles and job descriptions
- **GitHub Analysis**: Repository-level analysis with exponential decay time-weighting
- **Statistical Ranking**: Z-score normalization → percentile conversion with recruiter-configurable weighted composite scoring
- **Fuzzy Name Matching**: Multi-tier name matching (case, spacing, punctuation, word reorder) for robust test score linking
- **Automated Emails**: HTML assessment invitations and interview notifications via SMTP
- **Interview Scheduling**: Google Calendar events with Jitsi Meet video links
- **Recruiter Dashboard**: Real-time pipeline visualization, Kanban board, score breakdown tooltips, and configurable top-N candidate selection with manual overrides
- **Error Recovery**: Per-candidate retry buttons for failed resume processing or AI evaluation
- **Multi-Model Fallback**: Automatic failover across Gemini models, API keys, and Groq for uninterrupted operation

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS v4 + shadcn/ui + Recharts + Sonner
- **Backend**: FastAPI (Python 3.11+) with async I/O
- **Database**: Supabase (PostgreSQL with RLS)
- **LLM**: LiteLLM (Gemini 2.0 Flash → Gemini 1.5 Flash → Groq Llama 3.3)
- **Embeddings**: Google GenAI SDK (`gemini-embedding-001`, 768-dim)
- **Deployment**: Railway (backend) + Vercel (frontend) + Docker

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- Supabase account (free tier)
- Gemini API key (free tier)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your credentials (see Environment Variables below)

uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install

echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local

npm run dev
```

### Docker (Alternative)

```bash
docker-compose up --build
```

This starts both backend (port 8000) and frontend (port 3000).

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon key (frontend reads) |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (backend writes) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key (primary) |
| `GOOGLE_API_KEY` | No | Fallback Gemini API key |
| `GROQ_API_KEY` | No | Groq API key (fallback LLM provider) |
| `LITELLM_MODEL` | No | Primary LLM model (default: `gemini/gemini-2.0-flash`) |
| `EMBEDDING_MODEL` | No | Embedding model (default: `gemini-embedding-001`) |
| `GITHUB_TOKEN` | Yes | GitHub personal access token (for repo analysis) |
| `SMTP_HOST` | Yes | SMTP host (default: `smtp.gmail.com`) |
| `SMTP_PORT` | Yes | SMTP port (default: `587`) |
| `SMTP_USER` | Yes | SMTP username (email address) |
| `SMTP_PASSWORD` | Yes | SMTP password (Gmail App Password) |
| `FROM_EMAIL` | Yes | Sender email address |
| `GOOGLE_CREDENTIALS_JSON` | No | Google Calendar service account JSON (single line) |
| `GOOGLE_CALENDAR_ID` | No | Calendar ID (default: `primary`) |
| `FRONTEND_URL` | No | Frontend URL for CORS (default: `http://localhost:3000`) |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL (e.g., `http://localhost:8000/api`) |

## Workflow

1. **Create a Job** — Title, description, and scoring weight configuration via sliders
2. **Upload Candidates** — CSV or multi-sheet Excel (candidate data + optional test scores)
3. **Process Resumes** — Background download and PDF text extraction
4. **Run AI Evaluation** — LLM scoring + semantic embedding + GitHub analysis (with live progress)
5. **Compute Rankings** — Weighted composite scoring with Z-score normalization
6. **Send Test Links** — Select top-N candidates + manual additions, send HTML email invitations
7. **Upload Test Results** — Fuzzy name matching links scores to candidates across data quality issues
8. **Schedule Interviews** — Google Calendar events + Jitsi Meet links for selected candidates

## Deployment

### Backend on Railway

1. Create a new Railway project
2. Connect your GitHub repository
3. Set the root directory to `backend/`
4. Add all environment variables from `backend/.env.example`
5. Railway auto-detects the Dockerfile and deploys

### Frontend on Vercel

1. Import the repository on Vercel
2. Set the root directory to `frontend/`
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api`
4. Deploy — Vercel auto-detects Next.js

### Supabase Setup

Create these tables in your Supabase project (SQL editor):

```sql
-- Jobs
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  weight_config JSONB DEFAULT '{"jd_match":0.25,"github":0.20,"test_code":0.20,"test_la":0.10,"project_relevance":0.10,"research_relevance":0.05,"cgpa":0.10}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Candidates
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  s_no INTEGER,
  name TEXT NOT NULL,
  email TEXT,
  college TEXT,
  branch TEXT,
  cgpa FLOAT,
  best_ai_project TEXT,
  research_work TEXT,
  github_url TEXT,
  resume_url TEXT,
  resume_text TEXT,
  pipeline_stage TEXT DEFAULT 'uploaded',
  status_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Evaluations
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  resume_score FLOAT,
  project_score FLOAT,
  research_score FLOAT,
  github_score FLOAT,
  jd_match_score FLOAT,
  explanation JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(candidate_id, job_id)
);

-- Scores
CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  cgpa_z FLOAT,
  test_la_z FLOAT,
  test_code_z FLOAT,
  semantic_score FLOAT,
  github_score FLOAT,
  composite_score FLOAT,
  rank INTEGER,
  score_breakdown JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(candidate_id, job_id)
);

-- Test Results
CREATE TABLE test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  test_la FLOAT,
  test_code FLOAT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Interviews
CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 30,
  google_meet_link TEXT,
  calendar_event_id TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Email Logs
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  email_type TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Policies: service role has full access, anon has read access
CREATE POLICY "Service full access" ON jobs FOR ALL USING (true);
CREATE POLICY "Anon read" ON jobs FOR SELECT USING (true);
CREATE POLICY "Service full access" ON candidates FOR ALL USING (true);
CREATE POLICY "Anon read" ON candidates FOR SELECT USING (true);
CREATE POLICY "Service full access" ON evaluations FOR ALL USING (true);
CREATE POLICY "Anon read" ON evaluations FOR SELECT USING (true);
CREATE POLICY "Service full access" ON scores FOR ALL USING (true);
CREATE POLICY "Anon read" ON scores FOR SELECT USING (true);
CREATE POLICY "Service full access" ON test_results FOR ALL USING (true);
CREATE POLICY "Anon read" ON test_results FOR SELECT USING (true);
CREATE POLICY "Service full access" ON interviews FOR ALL USING (true);
CREATE POLICY "Anon read" ON interviews FOR SELECT USING (true);
CREATE POLICY "Service full access" ON email_logs FOR ALL USING (true);
CREATE POLICY "Anon read" ON email_logs FOR SELECT USING (true);
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the complete system design, including:

- AI evaluation approach (semantic similarity, LLM structured evaluation, GitHub decay model)
- Statistical normalization framework (Z-score → percentile)
- Composite ranking with Multi-Attribute Utility Theory
- Technology decision rationale (why Gemini over OpenAI, why Jitsi over Google Meet, etc.)
- Resilience patterns (multi-model fallback chain, retry with exponential backoff)
- Database schema with ER diagram
- Scalability roadmap

## Scoring Engine

The ranking engine combines four mathematical frameworks:

1. **Cosine Similarity** on 768-dim Gemini embeddings for text-to-JD matching
2. **Z-Score Normalization** with normal CDF for cohort-relative numeric scoring
3. **Exponential Decay** (`e^(-λt)`) for time-weighted GitHub repository impact
4. **Weighted Sum Model** with recruiter-configurable weights for composite ranking

All scores are explainable — hover over any score in the rankings table to see raw score, weight, and weighted contribution.

## License

MIT
