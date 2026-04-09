"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api, Job, Candidate, PipelineSummary } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import Link from "next/link";
import {
  Upload,
  Brain,
  Send,
  Calendar,
  FileText,
  GitFork,
  Trophy,
  ChevronRight,
  Loader2,
} from "lucide-react";

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  uploaded: { label: "Uploaded", color: "bg-gray-100 text-gray-700" },
  resume_processed: { label: "Resume Processed", color: "bg-blue-100 text-blue-700" },
  evaluated: { label: "AI Evaluated", color: "bg-purple-100 text-purple-700" },
  ranked: { label: "Ranked", color: "bg-amber-100 text-amber-700" },
  test_sent: { label: "Test Sent", color: "bg-cyan-100 text-cyan-700" },
  test_completed: { label: "Test Done", color: "bg-teal-100 text-teal-700" },
  shortlisted: { label: "Shortlisted", color: "bg-green-100 text-green-700" },
  interview_scheduled: { label: "Interview", color: "bg-emerald-100 text-emerald-700" },
};

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pipeline, setPipeline] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form states
  const [testLink, setTestLink] = useState("");
  const [interviewerEmail, setInterviewerEmail] = useState("");
  const [startDate, setStartDate] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [j, c, p] = await Promise.all([
        api.getJob(jobId),
        api.listCandidates({ job_id: jobId, limit: 200 }),
        api.getPipelineSummary(jobId),
      ]);
      setJob(j);
      setCandidates(c.candidates);
      setPipeline(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionLoading("upload");
    try {
      const result = await api.uploadCandidates(jobId, file);
      toast.success(`Uploaded ${result.count} candidates. Resume processing started.`);
      setTimeout(refresh, 2000);
    } catch (err) {
      toast.error("Upload failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setActionLoading(null);
      e.target.value = "";
    }
  };

  const handleTestUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionLoading("test-upload");
    try {
      const result = await api.uploadTestResults(jobId, file);
      toast.success(`Updated test results for ${result.count} candidates. Re-ranking...`);
      setTimeout(refresh, 3000);
    } catch (err) {
      toast.error("Upload failed");
    } finally {
      setActionLoading(null);
      e.target.value = "";
    }
  };

  const runAction = async (action: string, fn: () => Promise<unknown>) => {
    setActionLoading(action);
    try {
      await fn();
      toast.success(`${action} started! This may take a few minutes.`);
      setTimeout(refresh, 5000);
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading job details...</p>;
  if (!job) return <p className="text-destructive">Job not found.</p>;

  const rankedCandidates = [...candidates].sort((a, b) => {
    const ra = a.scores?.rank ?? 999;
    const rb = b.scores?.rank ?? 999;
    return ra - rb;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
        <p className="text-muted-foreground mt-1 line-clamp-2">{job.description.slice(0, 200)}...</p>
      </div>

      {/* Pipeline overview */}
      {pipeline && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {Object.entries(STAGE_CONFIG).map(([stage, conf], i) => (
            <div key={stage} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
              <div className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${conf.color}`}>
                {conf.label}: {pipeline.stages[stage] || 0}
              </div>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="workflow" className="space-y-4">
        <TabsList>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="candidates">Candidates ({candidates.length})</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
        </TabsList>

        {/* Workflow Tab */}
        <TabsContent value="workflow" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Step 1: Upload CSV */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" /> 1. Upload Candidates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Upload a CSV/Excel file with candidate data.</p>
                <label className="cursor-pointer block">
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} className="hidden" />
                  <div className="w-full inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer">
                    {actionLoading === "upload" ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading...</> : "Choose File"}
                  </div>
                </label>
              </CardContent>
            </Card>

            {/* Step 2: Process Resumes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> 2. Process Resumes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Download and extract text from candidate resumes.</p>
                <Button
                  variant="outline" className="w-full"
                  disabled={actionLoading === "resumes" || candidates.length === 0}
                  onClick={() => runAction("Resume processing", () => api.processResumes(jobId))}
                >
                  {actionLoading === "resumes" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Process Resumes
                </Button>
              </CardContent>
            </Card>

            {/* Step 3: AI Evaluation */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4" /> 3. AI Evaluation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Run LLM evaluation + GitHub analysis + semantic scoring.</p>
                <Button
                  className="w-full"
                  disabled={actionLoading === "evaluate" || candidates.length === 0}
                  onClick={() => runAction("AI evaluation", () => api.runEvaluations(jobId))}
                >
                  {actionLoading === "evaluate" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
                  Run AI Evaluation
                </Button>
              </CardContent>
            </Card>

            {/* Step 4: Rank */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4" /> 4. Rank Candidates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Compute composite scores and rank candidates.</p>
                <Button
                  variant="outline" className="w-full"
                  disabled={actionLoading === "rank" || candidates.length === 0}
                  onClick={() => runAction("Ranking", () => api.rankCandidates(jobId))}
                >
                  {actionLoading === "rank" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Compute Rankings
                </Button>
              </CardContent>
            </Card>

            {/* Step 5: Send Test Emails */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="h-4 w-4" /> 5. Send Test Links
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Test Link URL</Label>
                  <Input placeholder="https://..." value={testLink} onChange={(e) => setTestLink(e.target.value)} />
                </div>
                <Button
                  variant="outline" className="w-full"
                  disabled={!testLink || candidates.length === 0}
                  onClick={() => runAction("Sending test emails", () =>
                    api.sendTestEmails({
                      job_id: jobId,
                      candidate_ids: rankedCandidates.slice(0, 10).map((c) => c.id),
                      test_link: testLink,
                    })
                  )}
                >
                  Send to Top Candidates
                </Button>
              </CardContent>
            </Card>

            {/* Step 6: Upload Test Results */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> 6. Upload Test Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Upload CSV/Excel with test_la and test_code scores.</p>
                <label className="cursor-pointer block">
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleTestUpload} className="hidden" />
                  <div className="w-full inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer">
                    {actionLoading === "test-upload" ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading...</> : "Upload Test Results"}
                  </div>
                </label>
              </CardContent>
            </Card>

            {/* Step 7: Schedule Interviews */}
            <Card className="md:col-span-2 lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> 7. Schedule Interviews
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Interviewer Email</Label>
                  <Input placeholder="interviewer@company.com" value={interviewerEmail} onChange={(e) => setInterviewerEmail(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <Button
                  className="w-full"
                  disabled={!interviewerEmail || !startDate || candidates.length === 0}
                  onClick={() => runAction("Scheduling interviews", () =>
                    api.scheduleInterviews({
                      job_id: jobId,
                      candidate_ids: rankedCandidates.slice(0, 5).map((c) => c.id),
                      interviewer_email: interviewerEmail,
                      start_date: startDate,
                    })
                  )}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Top 5
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Candidates Tab */}
        <TabsContent value="candidates">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>College</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>CGPA</TableHead>
                    <TableHead>GitHub</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => {
                    const stageConf = STAGE_CONFIG[c.pipeline_stage] || { label: c.pipeline_stage, color: "bg-gray-100 text-gray-700" };
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.s_no}</TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm">{c.college || "—"}</TableCell>
                        <TableCell className="text-sm">{c.branch || "—"}</TableCell>
                        <TableCell>{c.cgpa?.toFixed(2) || "—"}</TableCell>
                        <TableCell>
                          {c.github_url ? (
                            <a href={c.github_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              <GitFork className="h-4 w-4" />
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageConf.color}`}>
                            {stageConf.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {c.scores?.composite_score != null ? (
                            <span className="font-mono font-bold">{(c.scores.composite_score * 100).toFixed(1)}%</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Link href={`/candidates/${c.id}`}>
                            <Button size="sm" variant="ghost">View</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rankings Tab */}
        <TabsContent value="rankings">
          <Card>
            <CardHeader>
              <CardTitle>Candidate Rankings</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>JD Match</TableHead>
                    <TableHead>GitHub</TableHead>
                    <TableHead>Code Test</TableHead>
                    <TableHead>Logic Test</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>CGPA</TableHead>
                    <TableHead className="font-bold">Composite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedCandidates.map((c) => {
                    const bd = c.scores?.score_breakdown;
                    return (
                      <TableRow key={c.id} className={c.scores?.rank === 1 ? "bg-amber-50" : ""}>
                        <TableCell>
                          <span className="font-bold text-lg">
                            {c.scores?.rank != null ? `#${c.scores.rank}` : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link href={`/candidates/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{bd?.jd_match ? (bd.jd_match.raw * 100).toFixed(0) + "%" : "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{bd?.github ? (bd.github.raw * 100).toFixed(0) + "%" : "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{bd?.test_code ? (bd.test_code.raw * 100).toFixed(0) + "%" : "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{bd?.test_la ? (bd.test_la.raw * 100).toFixed(0) + "%" : "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{bd?.project_relevance ? (bd.project_relevance.raw * 100).toFixed(0) + "%" : "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{bd?.cgpa ? (bd.cgpa.raw * 100).toFixed(0) + "%" : "—"}</TableCell>
                        <TableCell>
                          {c.scores?.composite_score != null ? (
                            <Badge variant="default" className="font-mono">
                              {(c.scores.composite_score * 100).toFixed(1)}%
                            </Badge>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
