# AI Candidate Screening Platform

An AI-powered recruitment pipeline that automates candidate evaluation, scoring, and interview scheduling.

## Features

- **CSV Upload**: Upload candidate data from CSV/Excel files
- **Resume Processing**: Automatic download and text extraction from Google Drive links
- **AI Evaluation**: LLM-powered candidate assessment with explainable scoring
- **GitHub Analysis**: Repository-level analysis with time-weighted impact scoring
- **Semantic Matching**: Embedding-based similarity between candidates and job descriptions
- **Statistical Ranking**: Z-score normalization with configurable weighted composite scoring
- **Automated Emails**: Send assessment links to shortlisted candidates via SMTP
- **Interview Scheduling**: Google Calendar integration with auto-generated Meet links
- **Recruiter Dashboard**: Pipeline visualization, candidate cards, and score breakdowns

## Tech Stack

- **Frontend**: Next.js 14 + Tailwind CSS + shadcn/ui + Recharts
- **Backend**: FastAPI (Python 3.11+)
- **Database**: Supabase (PostgreSQL)
- **AI/LLM**: LiteLLM (supports OpenAI, Groq, Gemini)
- **Embeddings**: OpenAI text-embedding-3-small

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Supabase account (free tier)
- LLM API key (OpenAI, Groq, or Gemini)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your Supabase URL, keys, and API keys

# Run the server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install

# Configure API URL
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local

# Run the dev server
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `LITELLM_MODEL` | LLM model (e.g., `gemini/gemini-2.0-flash`) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `OPENAI_API_KEY` | OpenAI API key (for embeddings) |
| `GITHUB_TOKEN` | GitHub personal access token |
| `SMTP_USER` | Gmail address for sending emails |
| `SMTP_PASSWORD` | Gmail app password |
| `GOOGLE_CREDENTIALS_JSON` | Google Calendar service account JSON |

## Workflow

1. **Create a Job** with title, description, and scoring weight configuration
2. **Upload Candidates** via CSV/Excel file
3. **Process Resumes** to extract text from Google Drive links
4. **Run AI Evaluation** for LLM scoring + semantic matching + GitHub analysis
5. **Compute Rankings** using the weighted multi-attribute scoring engine
6. **Send Test Links** to shortlisted candidates via email
7. **Upload Test Results** from a separate CSV
8. **Schedule Interviews** with automatic Google Calendar + Meet link creation

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full system design and AI evaluation approach.

## Scoring Engine

The ranking engine uses four mathematical frameworks:

1. **Cosine Similarity** on dense embeddings for text-to-JD matching
2. **Z-Score Normalization** with normal CDF for numeric field standardization
3. **Exponential Decay** for time-weighted GitHub repository impact
4. **Weighted Sum Model** for configurable multi-attribute composite scoring

All scores are explainable with detailed breakdowns shown in the candidate detail view.
