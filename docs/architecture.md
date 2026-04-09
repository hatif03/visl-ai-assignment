# Architecture Document: AI Candidate Screening Platform

## 1. System Overview

The AI Candidate Screening Platform automates the end-to-end recruitment workflow using a multi-stage pipeline powered by AI evaluation, semantic similarity matching, and mathematical scoring frameworks.

### High-Level Architecture

```
┌──────────────────────┐     ┌──────────────────────────────┐     ┌─────────────────┐
│   Next.js Frontend   │────▶│     FastAPI Backend           │────▶│   Supabase       │
│   (React + shadcn)   │     │   (Python 3.11+)             │     │   (PostgreSQL)   │
│   Vercel Hosting     │     │   Railway Hosting             │     │                  │
└──────────────────────┘     └──────────┬───────────────────┘     └─────────────────┘
                                        │
                        ┌───────────────┼───────────────────┐
                        │               │                   │
                   ┌────▼────┐   ┌──────▼──────┐   ┌───────▼───────┐
                   │  LLM    │   │  GitHub     │   │  Google       │
                   │  (via   │   │  REST API   │   │  Calendar +   │
                   │ LiteLLM)│   │             │   │  Meet         │
                   └─────────┘   └─────────────┘   └───────────────┘
```

## 2. Technology Stack

| Component     | Technology            | Justification                                    |
|---------------|----------------------|--------------------------------------------------|
| Frontend      | Next.js 14, Tailwind, shadcn/ui | Modern React with SSR, component library |
| Backend       | FastAPI (Python)     | Async, type-safe, native AI/ML ecosystem          |
| Database      | Supabase (PostgreSQL)| Managed Postgres, RLS, real-time, free tier       |
| LLM           | LiteLLM              | Unified API to swap between OpenAI/Groq/Gemini   |
| Embeddings    | OpenAI text-embedding-3-small | High quality, cost-effective embeddings  |
| Email         | SMTP (Gmail)         | Direct control, no third-party dependency         |
| Calendar      | Google Calendar API  | Real integration with Meet link auto-generation   |

## 3. Pipeline Architecture

The recruitment workflow is modeled as a **state machine** with 8 stages:

```
UPLOADED → RESUME_PROCESSED → EVALUATED → RANKED → TEST_SENT → TEST_COMPLETED → SHORTLISTED → INTERVIEW_SCHEDULED
```

Each candidate record carries a `pipeline_stage` field. Transitions are triggered by backend operations. The frontend renders this as both a horizontal progress indicator and a Kanban board.

### Stage Transitions

1. **UPLOADED**: CSV parsed, candidate rows created in `candidates` table
2. **RESUME_PROCESSED**: Google Drive resume downloaded, PDF text extracted via `pdfplumber`
3. **EVALUATED**: LLM evaluation + semantic embedding comparison + GitHub analysis complete
4. **RANKED**: Composite scores computed using weighted multi-attribute model
5. **TEST_SENT**: Automated email with assessment link sent via SMTP
6. **TEST_COMPLETED**: Test results CSV uploaded, scores linked to candidates
7. **SHORTLISTED**: Final ranking computed incorporating test scores
8. **INTERVIEW_SCHEDULED**: Google Calendar event created with Meet link

## 4. AI Evaluation Approach

### 4.1 Semantic Similarity (Vector Space Model)

Text fields (resume, AI project description, research work) are compared against the job description using **cosine similarity on dense embeddings**.

```
similarity = dot(A, B) / (||A|| × ||B||)
```

Where A is the candidate text embedding and B is the job description embedding. This produces a bounded score in [0, 1] representing semantic alignment.

**Implementation**: Each text field is embedded independently. The JD match score combines:
- Resume similarity (50% weight)
- Project similarity (30% weight)  
- Research similarity (20% weight)

### 4.2 LLM Qualitative Evaluation

Each candidate is evaluated by the LLM against the job description using structured output (JSON mode). The LLM scores four dimensions (0-10 scale) with natural language justifications:

- **Technical Depth**: Assessment of technical skills and domain knowledge
- **Project Complexity**: Evaluation of the complexity and impact of described projects
- **Research Quality**: Assessment of research work significance and rigor
- **JD Alignment**: Direct match between candidate profile and job requirements

The LLM also provides overall assessment, strengths, and concerns for explainability.

### 4.3 GitHub Repository Analysis (Exponential Decay)

GitHub profiles are analyzed at the repository level. Each repository receives an impact score using an **exponential decay function** that rewards recent activity:

```
I_repo = (stars + w × forks) × e^(-λt)
```

Where:
- `stars` = repository star count
- `forks` = repository fork count
- `w = 2.0` = fork weight multiplier (forks indicate higher engagement)
- `λ = 0.002` = decay constant (~346-day half-life)
- `t` = days since last commit

The total GitHub score sums the top-10 repositories. Language relevance and fork status are also tracked.

### 4.4 Statistical Normalization (Z-Score)

Numeric fields (CGPA, test_la, test_code) are normalized using **Z-score standardization** computed dynamically across the candidate pool:

```
Z = (X - μ) / σ
```

The Z-score is converted to a percentile using the **normal CDF**, producing a [0, 1] score. This prevents scale bias (e.g., CGPA out of 10 vs. test scores out of 100) and evaluates candidates relative to their cohort.

**Key property**: Scores recalibrate automatically when new candidates or test results are uploaded.

### 4.5 Composite Ranking (Multi-Attribute Utility Theory)

The final ranking uses a **weighted sum model** with recruiter-configurable weights:

```
U = Σ(w_i × x_i)
```

Default weights:
| Dimension         | Weight |
|-------------------|--------|
| JD Match          | 25%    |
| GitHub Impact     | 20%    |
| Coding Test       | 20%    |
| Logical Aptitude  | 10%    |
| Project Relevance | 10%    |
| Research Quality  |  5%    |
| CGPA              | 10%    |

Weights are stored per-job and can be adjusted via the frontend slider interface, allowing recruiters to customize evaluation priorities per role.

## 5. Database Schema

### Entity Relationship

```
jobs 1──N candidates 1──1 evaluations
                     1──1 scores
                     1──1 test_results
                     1──N interviews
                     1──N email_logs
```

### Key Design Decisions

- **UUID primary keys**: Prevent enumeration attacks, safe for distributed systems
- **JSONB columns**: `weight_config`, `explanation`, `score_breakdown` store structured data that varies per evaluation
- **Row-Level Security (RLS)**: Service role has full access; anonymous role has read-only access
- **Composite unique constraints**: `(candidate_id, job_id)` on scores prevents duplicate rankings

## 6. Security & Data Handling

- **RLS enabled** on all tables with service key for backend, anon key for frontend reads
- **CORS** configured to allow only the frontend origin
- **Environment variables** for all secrets (API keys, SMTP credentials, Google credentials)
- **Resume download** uses Google Drive direct download URL pattern with redirect handling

## 7. Scalability Considerations

- **Background tasks** for long-running operations (resume processing, AI evaluation, GitHub analysis)
- **Async I/O** throughout the FastAPI backend for concurrent HTTP calls
- **Dynamic Z-score recalculation** handles varying pool sizes without pre-computation
- **Pagination** on all list endpoints (offset/limit pattern)
- **LLM abstraction** via LiteLLM allows seamless provider switching for cost/performance optimization
- **Stateless backend** enables horizontal scaling behind a load balancer

## 8. Explainability

Every score is fully traceable:

1. **Score Breakdown**: Each dimension shows raw score, weight, and weighted contribution
2. **LLM Justifications**: Natural language explanations for each evaluation dimension
3. **GitHub Repository Cards**: Individual repo impact scores with decay factors
4. **Radar Chart**: Visual representation of candidate strengths across all dimensions
5. **Bar Chart**: Weighted contribution visualization showing how each factor affects the final score
