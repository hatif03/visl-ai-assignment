const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Jobs
  createJob: (data: { title: string; description: string; weight_config?: Record<string, number> }) =>
    request("/jobs", { method: "POST", body: JSON.stringify(data) }),
  listJobs: () => request<Job[]>("/jobs"),
  getJob: (id: string) => request<Job>(`/jobs/${id}`),
  updateJob: (id: string, data: { title: string; description: string; weight_config?: Record<string, number> }) =>
    request(`/jobs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteJob: (id: string) => request(`/jobs/${id}`, { method: "DELETE" }),

  // Candidates
  uploadCandidates: (jobId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("job_id", jobId);
    return fetch(`${API_BASE}/candidates/upload`, { method: "POST", body: form }).then((r) => r.json());
  },
  listCandidates: (params?: { job_id?: string; stage?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.job_id) query.set("job_id", params.job_id);
    if (params?.stage) query.set("stage", params.stage);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    return request<{ candidates: Candidate[]; total: number }>(`/candidates?${query}`);
  },
  getCandidate: (id: string) => request<Candidate>(`/candidates/${id}`),
  getPipelineSummary: (jobId: string) => request<PipelineSummary>(`/candidates/pipeline/summary?job_id=${jobId}`),
  processResumes: (jobId: string) =>
    request(`/candidates/process-resumes?job_id=${jobId}`, { method: "POST" }),
  analyzeGithub: (jobId: string) =>
    request(`/candidates/analyze-github?job_id=${jobId}`, { method: "POST" }),

  // Evaluations
  runEvaluations: (jobId: string, candidateIds?: string[]) =>
    request("/evaluations/run", {
      method: "POST",
      body: JSON.stringify({ job_id: jobId, candidate_ids: candidateIds }),
    }),
  rankCandidates: (jobId: string) =>
    request(`/evaluations/rank?job_id=${jobId}`, { method: "POST" }),
  getRankings: (jobId: string) => request<RankingResponse>(`/evaluations/rankings/${jobId}`),
  getEvaluations: (jobId: string) => request<{ evaluations: Evaluation[]; total: number }>(`/evaluations/${jobId}`),
  getCandidateEvaluation: (candidateId: string) =>
    request<{ evaluation: Evaluation | null; score: Score | null }>(`/evaluations/candidate/${candidateId}`),

  // Tests
  uploadTestResults: (jobId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("job_id", jobId);
    return fetch(`${API_BASE}/tests/upload-results`, { method: "POST", body: form }).then((r) => r.json());
  },
  getTestResults: (jobId: string) => request<{ results: TestResult[]; total: number }>(`/tests/results/${jobId}`),

  // Interviews
  scheduleInterviews: (data: {
    job_id: string;
    candidate_ids: string[];
    duration_minutes?: number;
    interviewer_email: string;
    start_date: string;
    start_hour?: number;
    gap_minutes?: number;
  }) => request("/interviews/schedule", { method: "POST", body: JSON.stringify(data) }),
  sendTestEmails: (data: {
    job_id: string;
    candidate_ids: string[];
    test_link: string;
    subject?: string;
  }) => request("/interviews/send-test-emails", { method: "POST", body: JSON.stringify(data) }),
  getInterviews: (jobId: string) => request<{ interviews: Interview[]; total: number }>(`/interviews/${jobId}`),
  getEmailLogs: (jobId: string) => request<{ emails: EmailLog[]; total: number }>(`/interviews/emails/${jobId}`),
};

// Types
export interface Job {
  id: string;
  title: string;
  description: string;
  weight_config: Record<string, number>;
  created_at: string;
  candidate_count?: number;
}

export interface Candidate {
  id: string;
  job_id: string;
  s_no?: number;
  name: string;
  email: string;
  college?: string;
  branch?: string;
  cgpa?: number;
  best_ai_project?: string;
  research_work?: string;
  github_url?: string;
  resume_url?: string;
  resume_text?: string;
  pipeline_stage: string;
  created_at: string;
  scores?: Score | null;
}

export interface Evaluation {
  id: string;
  candidate_id: string;
  job_id: string;
  resume_score?: number;
  project_score?: number;
  research_score?: number;
  github_score?: number;
  jd_match_score?: number;
  explanation?: Record<string, unknown>;
  created_at: string;
  candidates?: { name: string; email: string };
}

export interface Score {
  id: string;
  candidate_id: string;
  job_id: string;
  cgpa_z?: number;
  test_la_z?: number;
  test_code_z?: number;
  semantic_score?: number;
  github_score?: number;
  composite_score?: number;
  rank?: number;
  score_breakdown?: Record<string, { raw: number; weight: number; weighted: number }>;
}

export interface TestResult {
  id: string;
  candidate_id: string;
  test_la?: number;
  test_code?: number;
  uploaded_at: string;
  candidates?: { name: string; email: string };
}

export interface Interview {
  id: string;
  candidate_id: string;
  job_id: string;
  scheduled_at: string;
  duration_minutes: number;
  google_meet_link?: string;
  calendar_event_id?: string;
  status: string;
  created_at: string;
  candidates?: { name: string; email: string };
}

export interface EmailLog {
  id: string;
  candidate_id: string;
  email_type: string;
  status: string;
  sent_at: string;
  candidates?: { name: string; email: string };
}

export interface PipelineSummary {
  job_id: string;
  stages: Record<string, number>;
}

export interface RankingResponse {
  job_id: string;
  rankings: Array<Score & { candidates?: Candidate }>;
  total: number;
}
