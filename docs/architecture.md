# Architecture Document: AI Candidate Screening Platform

## 1. System Overview

The AI Candidate Screening Platform automates the end-to-end recruitment workflow — from candidate upload through AI evaluation to interview scheduling — using a multi-stage pipeline powered by LLM evaluation, semantic embeddings, statistical normalization, and a configurable weighted scoring model.

### High-Level Architecture

```
┌──────────────────────────┐      ┌──────────────────────────────────┐      ┌──────────────────┐
│   Next.js 16 Frontend    │─────▶│       FastAPI Backend            │─────▶│    Supabase       │
│   React 19 + shadcn/ui   │      │       Python 3.11+               │      │    PostgreSQL     │
│   Vercel Hosting         │◀─────│       Render Hosting              │◀─────│    (Managed)      │
└──────────────────────────┘      └──────────┬───────────┬───────────┘      └──────────────────┘
                                             │           │
                          ┌──────────────────┼───────────┼──────────────────┐
                          │                  │           │                  │
                    ┌─────▼──────┐    ┌──────▼───┐ ┌────▼──────┐   ┌──────▼──────┐
                    │  Gemini    │    │  GitHub   │ │  Google   │   │   Gmail     │
                    │  LLM +    │    │  REST API │ │  Calendar │   │   SMTP      │
                    │  Embeddings│    │           │ │  API      │   │             │
                    └────────────┘    └──────────┘ └───────────┘   └─────────────┘
```

---

## 2. Technology Stack & Decision Rationale

### Backend: FastAPI (Python 3.11+)

| Decision | Rationale |
|----------|-----------|
| **FastAPI over Django/Flask** | Native async/await for concurrent AI API calls; automatic OpenAPI docs; Pydantic validation eliminates boilerplate. Django's ORM and admin are unnecessary overhead for an API-only service. Flask lacks built-in async and type validation. |
| **Background tasks over Celery** | FastAPI's `BackgroundTasks` avoids the operational complexity of a message broker (Redis/RabbitMQ). Sufficient for single-instance deployment; can be migrated to Celery if horizontal scaling is needed. |
| **Pydantic Settings** | Type-safe environment variable loading with `.env` file support. Catches misconfiguration at startup rather than at runtime. |

### Frontend: Next.js 16 + React 19

| Decision | Rationale |
|----------|-----------|
| **Next.js over plain React/Vite** | App Router provides file-based routing, server components for initial load, and seamless Vercel deployment. |
| **shadcn/ui over Material UI/Ant Design** | Copy-paste components with full source control. No CSS-in-JS runtime overhead. Radix UI primitives ensure accessibility (ARIA attributes, keyboard navigation). |
| **Recharts for visualization** | React-native charting (Radar + Bar charts for score breakdowns). Lighter than D3 for the scope needed. |
| **Sonner for toasts** | Lightweight toast library with built-in animations. Replaces heavier notification systems. |
| **Tailwind CSS v4** | Utility-first with zero runtime. JIT compilation produces minimal CSS bundles. |

### Database: Supabase (PostgreSQL)

| Decision | Rationale |
|----------|-----------|
| **Supabase over raw Postgres/Firebase** | Managed PostgreSQL with built-in RLS, REST API, and a generous free tier. Firebase's NoSQL model is a poor fit for relational candidate data with joins. Raw Postgres requires self-managed hosting. |
| **UUID primary keys** | Prevent enumeration attacks, safe for distributed systems, no sequential ID leakage. |
| **JSONB columns** | `weight_config`, `explanation`, `score_breakdown` store flexible structured data that varies per evaluation without requiring schema migrations. |

### AI/ML: Gemini + LiteLLM

| Decision | Rationale |
|----------|-----------|
| **Gemini over OpenAI GPT** | Free-tier API quota sufficient for demo/evaluation. Gemini 2.0 Flash provides competitive quality at zero cost for structured evaluation tasks. |
| **LiteLLM for LLM completion** | Unified interface across providers (Gemini, Groq, OpenAI). One function call, swap providers via config. Handles provider-specific auth and response formats. |
| **Google GenAI SDK for embeddings (not LiteLLM)** | LiteLLM's embedding support for Gemini was unreliable (model routing issues, `text-embedding-004` errors). Direct `google-genai` SDK with `gemini-embedding-001` provides stable, high-quality 768-dim embeddings. |
| **Multi-model fallback chain** | Cycles through Gemini 2.0 Flash → 2.0 Flash Lite → 1.5 Flash → Groq Llama 3.3 with multiple API keys. Handles quota exhaustion and rate limits without manual intervention. |
| **Groq as fallback** | Groq's free tier provides LPU-accelerated Llama inference as a safety net when all Gemini models hit quota. |

### Video Conferencing: Jitsi Meet (not Google Meet)

| Decision | Rationale |
|----------|-----------|
| **Jitsi over Google Meet** | Google Meet link generation via Calendar API requires Google Workspace with Domain-Wide Delegation — unavailable for service accounts on standard Google Cloud projects. Jitsi Meet provides free, no-auth-required video rooms with predictable URLs. |
| **Google Calendar for events** | Service account creates calendar events (without attendees, as that also requires DWD) with the Jitsi link in the description. Events are confirmed on the service account's calendar. |

### Email: Gmail SMTP

| Decision | Rationale |
|----------|-----------|
| **SMTP over SendGrid/Mailgun** | Direct control, no third-party signup. Gmail App Passwords work for demo scale. For production, swap to a transactional email provider. |
| **HTML templates** | Inline-styled HTML emails with gradient headers for professional appearance across email clients. |

---

## 3. Pipeline Architecture

The recruitment workflow is a **state machine** with 10 stages:

```
UPLOADED → RESUME_PROCESSED → EVALUATING → EVALUATED → RANKED → TEST_SENT → TEST_COMPLETED → SHORTLISTED → INTERVIEW_SCHEDULED
                                                                                                              ↕
                                                                                                            ERROR
```

Each candidate carries a `pipeline_stage` field and a `status_message` for granular progress tracking. The frontend renders this as:
- A **horizontal progress bar** on the job detail page
- A **Kanban board** on the pipeline page (auto-refreshes every 4 seconds)
- **Real-time status messages** per candidate (e.g., "[3/10] Running LLM evaluation...")

### Stage Transitions

| Stage | Trigger | What Happens |
|-------|---------|-------------|
| `uploaded` | CSV/Excel file upload | Candidate rows created in DB. Multi-sheet Excel parsing extracts candidate data from Sheet 1 and test scores from the dedicated test sheet (if present). |
| `resume_processed` | Background task | Google Drive resume downloaded via direct URL, PDF text extracted with `pdfplumber`. |
| `evaluating` | Background task | Real-time status updates pushed per candidate. |
| `evaluated` | Pipeline completion | LLM structured evaluation + semantic similarity + GitHub analysis stored. |
| `ranked` | Compute Rankings | Weighted composite scores calculated, candidates sorted. |
| `test_sent` | Send Test Links | Personalized HTML emails sent via SMTP. |
| `test_completed` | Upload Test Results | CSV/Excel parsed with **fuzzy name matching** (see Section 6). |
| `interview_scheduled` | Schedule Interviews | Google Calendar event created + Jitsi Meet link generated. |
| `error` | Any failure | Detailed error message stored. Retry buttons available on frontend. |

### Error Recovery

Every stage supports retry:
- **Resume retry**: Re-downloads and re-parses the resume PDF
- **Evaluation retry**: Re-runs the full LLM + semantic + GitHub pipeline for one candidate
- Both available via dedicated buttons on the job detail and candidate detail pages

---

## 4. AI Evaluation Approach

### 4.1 Semantic Similarity (Vector Space Model)

Text fields (resume, AI project, research work) are compared against the job description using **cosine similarity on dense embeddings**.

```
similarity = dot(A, B) / (‖A‖ × ‖B‖)
```

**Embedding model**: `gemini-embedding-001` (768 dimensions) via the `google-genai` SDK.

The JD match score combines three signals with a floor:

```python
jd_match = max(
    resume_sim * 0.5 + project_sim * 0.3 + research_sim * 0.2,
    resume_sim   # floor: resume alone shouldn't score below its raw similarity
)
```

This is further blended 50/50 with the LLM's own JD alignment score for robustness:

```python
combined_jd = (semantic_jd_match + llm_jd_score) / 2.0
```

**Why not a vector database?** The candidate pool per job is small (10-100). In-memory cosine similarity on NumPy arrays is faster than a vector DB roundtrip and requires no additional infrastructure.

### 4.2 LLM Qualitative Evaluation

Each candidate is evaluated by the LLM against the job description using **structured JSON output**. The LLM scores four dimensions (0-10 scale) with justifications:

- **Technical Depth**: Assessment of technical skills and domain knowledge
- **Project Complexity**: Evaluation of the complexity and impact of described projects
- **Research Quality**: Assessment of research work significance and rigor
- **JD Alignment**: Direct match between candidate profile and job requirements

The LLM also provides overall assessment, strengths, and concerns for explainability.

**Why structured JSON over free-text?** JSON mode forces consistent, parseable output. Justifications maintain explainability while scores enable mathematical combination.

**Rate limit handling**: 1.5-second delay between candidates to stay under Gemini's free-tier RPM limits.

### 4.3 GitHub Repository Analysis (Exponential Decay)

GitHub profiles are analyzed via the REST API. Each repository receives an impact score using an **exponential decay function**:

```
I_repo = (stars + 2.0 × forks) × e^(-0.002 × days_since_update)
```

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Fork weight | 2.0 | Forks indicate deeper engagement than stars |
| λ (decay) | 0.002 | ~346-day half-life; recent work valued more |
| Base for 0-star repos | 0.5 (original) / 0.1 (fork) | Non-zero to credit any recent coding activity |

Total GitHub score = sum of top-10 repositories by impact. Language distribution is tracked for the candidate profile.

**Why exponential decay over linear?** Exponential decay has the property that very old but heavily-starred repos still contribute meaningfully, while recent repos with moderate stars aren't overwhelmed. A linear penalty would unfairly zero out anything older than a threshold.

### 4.4 Statistical Normalization (Z-Score → Percentile)

Numeric fields (CGPA, test_la, test_code) are normalized using **Z-score standardization** with CDF conversion:

```
Z = (X - μ) / σ
percentile = Φ(Z)    // Normal CDF
```

**Why Z-score over min-max?** Z-scores handle outliers gracefully (a 10.0 CGPA doesn't distort the scale) and produce meaningful percentiles. Min-max normalization would make scores sensitive to a single extreme value.

**Dynamic recalculation**: Scores recalibrate automatically when new candidates or test results are added.

**Missing data handling**: Candidates without test results receive a score of 0.0 (not 0.5) — they are penalized for missing data, not assumed average.

### 4.5 Composite Ranking (Weighted Sum Model)

The final ranking uses a **weighted sum model** with recruiter-configurable weights:

```
U = Σ(wᵢ × xᵢ)
```

Default weights (configurable per job via frontend sliders):

| Dimension | Weight | Score Source |
|-----------|--------|-------------|
| JD Match | 25% | Blended semantic + LLM alignment |
| GitHub Impact | 20% | Decay-weighted repo analysis, min-max normalized |
| Coding Test | 20% | Z-score percentile from test_code |
| Logical Aptitude | 10% | Z-score percentile from test_la |
| Project Relevance | 10% | Blended LLM + semantic project score |
| Research Quality | 5% | Blended LLM + semantic research score |
| CGPA | 10% | Z-score percentile |

**Why configurable weights?** Different roles prioritize different skills. A research position should weight research quality higher; a DevOps role should weight GitHub activity higher. The slider UI enables non-technical recruiters to adjust this.

---

## 5. Database Schema

### Entity Relationship

```
jobs ──1:N──▶ candidates ──1:1──▶ evaluations
                         ──1:1──▶ scores
                         ──1:1──▶ test_results
                         ──1:N──▶ interviews
                         ──1:N──▶ email_logs
```

### Key Tables

| Table | Purpose | Notable Columns |
|-------|---------|-----------------|
| `jobs` | Job postings | `weight_config` (JSONB), `description` (TEXT) |
| `candidates` | Candidate data + pipeline state | `pipeline_stage`, `status_message`, `resume_text` |
| `evaluations` | AI evaluation results | `explanation` (JSONB with LLM output + semantic scores + GitHub analysis) |
| `scores` | Computed composite scores | `score_breakdown` (JSONB with per-dimension raw/weight/weighted) |
| `test_results` | Uploaded test scores | `test_la`, `test_code` (FLOAT) |
| `interviews` | Scheduled interviews | `google_meet_link`, `calendar_event_id`, `status` |
| `email_logs` | Email delivery tracking | `email_type`, `status`, `sent_at` |

### Design Decisions

- **Composite unique constraints**: `(candidate_id, job_id)` on `scores` and `evaluations` prevents duplicate entries; upsert pattern used throughout
- **Cascade deletion**: Deleting a job cascades to all related candidates, evaluations, scores, test results, interviews, and email logs
- **Row-Level Security**: Service role has full CRUD; anonymous role has read access for frontend data loading

---

## 6. Fuzzy Name Matching for Test Results

A significant challenge in the dataset is that **all candidates share the same email address**. Email-based matching is therefore unreliable. The system uses **multi-tier fuzzy name matching**:

```
1. Exact normalized match     ("Student 1" == "student 1")         ✓
2. Substring/contains match   ("Student" in "Student 1")           ✓
3. Word-set reorder match     ("Smith John" == "John Smith")       ✓
4. No-space comparison        ("Student1" == "Student 1")          ✓
```

Normalization: lowercase → strip punctuation (`.-_,;:'"`) → collapse multiple spaces → trim.

This handles real-world data quality issues: inconsistent casing, extra spaces, punctuation variations in names between the candidate upload sheet and the test result sheet.

### Multi-Sheet Excel Parsing

The dataset contains two sheets: "Response" (candidate data) and "Test Result" (test scores). Both sheets contain `test_la`/`test_code` columns. The system:
1. Scans all sheets for test columns
2. Prefers the **last matching sheet** (the dedicated test sheet) over the first (main data sheet)
3. Uses fuzzy name matching to link test scores to candidates

---

## 7. Frontend Architecture

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Dashboard with job listing and quick stats |
| `/jobs` | Job management (CRUD) |
| `/jobs/new` | Create job with weight configuration sliders |
| `/jobs/[id]` | Job detail with 3 tabs: Candidates, Workflow, Rankings |
| `/candidates` | Global candidate list across all jobs |
| `/candidates/[id]` | Candidate detail with evaluation breakdown, charts |
| `/pipeline` | Kanban board visualization of candidate pipeline stages |

### Real-Time Features

- **Auto-refresh polling**: Job detail page polls every 3 seconds while candidates are processing; pipeline page every 4 seconds
- **Toast notifications**: Success/failure toasts for batch operations and individual candidate transitions
- **Live status messages**: Per-candidate status messages update in real-time during evaluation ("Running LLM evaluation...", "Analyzing GitHub profile...")
- **Processing banners**: Yellow/red banners show counts of processing/errored candidates

### Configurable Candidate Selection

The "Send Test Links" and "Schedule Interviews" features support:
1. **Top-N selection**: Enter a number, click "Apply" to auto-select the top N ranked candidates
2. **Manual add/remove**: Expand the candidate picker, search by name, and check/uncheck individuals
3. **Name search**: Real-time filtering of the candidate list by name, enabling HR to find and add specific candidates as exceptions to the top-N rule
4. **Independent selection**: Test link and interview candidate sets are fully independent

### Score Tooltips

Every score in the rankings table has a hover tooltip showing:
- Raw score (before weighting)
- Weight (configurable per job)
- Weighted contribution to composite score

The composite score tooltip shows the full breakdown across all dimensions.

---

## 8. Resilience & Error Handling

### LLM Fallback Chain

```
Gemini 2.0 Flash (Key 1) → Gemini 2.0 Flash (Key 2) →
Gemini 2.0 Flash Lite (Key 1) → Gemini 2.0 Flash Lite (Key 2) →
Gemini 1.5 Flash (Key 1) → Gemini 1.5 Flash (Key 2) →
Groq Llama 3.3 70B → Groq Llama 3.1 8B
```

Each model/key combination gets 3 retries with exponential backoff (5s, 10s, 20s). The chain skips forward on:
- Quota exhaustion (HTTP 429 with "limit: 0")
- Permission denied (HTTP 403)
- Model not found (HTTP 404)

### Embedding Retry

Similar fallback across API keys with retry on rate limits. Embeddings are truncated to 8000 characters to stay within model limits.

### Frontend Retry

API client retries failed requests once with 500ms backoff before showing error to user.

---

## 9. Security

- **RLS enabled** on all Supabase tables
- **Service key** used only by the backend; **anon key** for frontend read access
- **CORS** configured with explicit origin (production) or wildcard (development)
- **Environment variables** for all secrets — never committed to version control
- **Google Drive resume download** uses direct download URL pattern with redirect handling
- **App passwords** for SMTP (not primary Gmail credentials)

---

## 10. Deployment Architecture

### Backend: Render (Free Tier)

- **Runtime**: Docker container from `python:3.11-slim`
- **Scaling**: Single instance sufficient for demo; stateless design supports horizontal scaling
- **Environment**: All secrets injected via Render dashboard environment variables
- **Health check**: `GET /api/health` returns `{"status": "healthy", "version": "1.0.1"}`
- **Cold start**: Free tier spins down after 15 min idle; first request takes ~30s to wake. Acceptable for demo/assignment use.

### Frontend: Vercel

- **Framework**: Next.js 16 with automatic edge optimization
- **Build**: `next build` produces optimized static + dynamic pages
- **Environment**: `NEXT_PUBLIC_API_URL` points to Render backend URL
- **Output**: Standalone mode for minimal container size if Docker deployed

### Database: Supabase Cloud

- **Region**: Matches backend region for minimal latency
- **Backups**: Automatic daily backups on Supabase free tier

### Local Development

```bash
# Backend
cd backend && python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

Docker Compose available for containerized local development.

---

## 11. Explainability

Every score is fully traceable:

1. **Score Breakdown Tooltips**: Each dimension shows raw score, weight, and weighted contribution on hover
2. **LLM Justifications**: Natural language explanations for each evaluation dimension (technical depth, project complexity, research quality, JD alignment)
3. **Overall Assessment**: LLM-generated summary with strengths and concerns
4. **GitHub Repository Cards**: Individual repo impact scores with language, stars, forks, and decay factors
5. **Radar Chart**: Visual representation of candidate strengths across all dimensions
6. **Bar Chart**: Weighted contribution visualization showing how each factor affects the final score
7. **Audit Trail**: Email logs and interview records track all HR actions

---

## 12. Scalability Considerations

| Concern | Current Approach | Scale-Up Path |
|---------|-----------------|---------------|
| Long-running AI tasks | FastAPI BackgroundTasks | Celery + Redis for job queuing |
| Concurrent HTTP calls | Python `asyncio` + `httpx` | No change needed |
| Rate limit handling | Exponential backoff + fallback chain | Add API key pool rotation |
| Candidate pool size | In-memory scoring (NumPy) | pgvector for embeddings if >10K candidates per job |
| Frontend polling | 3-4 second interval | WebSocket/SSE for push-based updates |
| Email throughput | Sequential SMTP sends | Batch via SES/SendGrid |
| Static assets | Vercel CDN | No change needed |

---

## 13. Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/              # Route handlers (jobs, candidates, evaluations, tests, interviews)
│   │   ├── core/             # LLM completion, embeddings, shared utilities
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── services/         # Business logic (evaluation, scoring, GitHub, email, calendar)
│   │   ├── config.py         # Pydantic Settings with env loading
│   │   ├── database.py       # Supabase client initialization
│   │   └── main.py           # FastAPI app with CORS and router mounting
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   ├── components/       # shadcn/ui components + custom (sidebar, back-button, loading)
│   │   └── lib/              # API client with types, utility functions
│   ├── Dockerfile
│   └── package.json
├── docs/
│   └── architecture.md       # This document
├── docker-compose.yml
└── README.md
```
