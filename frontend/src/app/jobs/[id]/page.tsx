// @ts-nocheck
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, Job, Candidate, PipelineSummary } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { PageSkeleton } from "@/components/loading";
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
  Trash2,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
} from "lucide-react";

const STAGE_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  uploaded: { label: "Uploaded", color: "bg-gray-100 text-gray-700", icon: Clock },
  resume_processed: { label: "Resume Processed", color: "bg-blue-100 text-blue-700", icon: FileText },
  evaluating: { label: "Evaluating...", color: "bg-yellow-100 text-yellow-700 animate-pulse", icon: Brain },
  evaluated: { label: "AI Evaluated", color: "bg-purple-100 text-purple-700", icon: CheckCircle2 },
  ranked: { label: "Ranked", color: "bg-amber-100 text-amber-700", icon: Trophy },
  test_sent: { label: "Test Sent", color: "bg-cyan-100 text-cyan-700", icon: Send },
  test_completed: { label: "Test Done", color: "bg-teal-100 text-teal-700", icon: CheckCircle2 },
  shortlisted: { label: "Shortlisted", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  interview_scheduled: { label: "Interview", color: "bg-emerald-100 text-emerald-700", icon: Calendar },
  error: { label: "Error", color: "bg-red-100 text-red-700", icon: AlertCircle },
};

function ScoreCell({ entry, label }: { entry?: { raw: number; weight: number; weighted: number }; label: string }) {
  if (!entry) {
    return <TableCell className="font-mono text-sm text-muted-foreground">—</TableCell>;
  }
  return (
    <TableCell className="font-mono text-sm">
      <Tooltip>
        <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4 decoration-muted-foreground/40">
          {(entry.raw * 100).toFixed(0)}%
        </TooltipTrigger>
        <TooltipContent side="top" className="text-left">
          <p className="font-semibold mb-1">{label}</p>
          <div className="space-y-0.5 text-[11px] font-mono">
            <div className="flex justify-between gap-4">
              <span className="opacity-70">Raw score</span>
              <span>{(entry.raw * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="opacity-70">Weight</span>
              <span>{(entry.weight * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between gap-4 border-t border-white/20 pt-0.5 font-semibold">
              <span>Contribution</span>
              <span>{(entry.weighted * 100).toFixed(1)}%</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

function CandidatePicker({
  candidates,
  selectedIds,
  onToggle,
  topN,
  onSetTopN,
  onApplyTopN,
  open,
  onToggleOpen,
}: {
  candidates: Candidate[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  topN: number;
  onSetTopN: (n: number) => void;
  onApplyTopN: () => void;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const [nameSearch, setNameSearch] = useState("");

  const filteredCandidates = nameSearch.trim()
    ? candidates.filter((c) => c.name.toLowerCase().includes(nameSearch.trim().toLowerCase()))
    : candidates;

  const selectedNotInFiltered = nameSearch.trim()
    ? candidates.filter((c) => selectedIds.has(c.id) && !c.name.toLowerCase().includes(nameSearch.trim().toLowerCase()))
    : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5">
          <Label className="text-xs whitespace-nowrap">Top</Label>
          <Input
            type="number"
            min={1}
            max={candidates.length || 10}
            value={topN}
            onChange={(e) => onSetTopN(Math.max(1, parseInt(e.target.value) || 1))}
            className="h-7 w-16 text-xs"
          />
          <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={onApplyTopN}>
            Apply
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onToggleOpen}>
          {open ? "Hide" : "Edit"} ({selectedIds.size})
        </Button>
      </div>
      {open && (
        <div className="space-y-2">
          <Input
            placeholder="Search by name to add..."
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            className="h-7 text-xs"
          />
          <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1 bg-muted/30">
            {filteredCandidates.map((c) => {
              const checked = selectedIds.has(c.id);
              const rank = c.scores?.rank;
              return (
                <label key={c.id} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm hover:bg-accent ${checked ? "bg-accent/50" : ""}`}>
                  <Checkbox checked={checked} onCheckedChange={() => onToggle(c.id)} />
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.scores?.composite_score != null && (
                    <span className="text-xs font-mono text-muted-foreground">{(c.scores.composite_score * 100).toFixed(1)}%</span>
                  )}
                  {rank && <span className="text-[10px] text-muted-foreground">#{rank}</span>}
                </label>
              );
            })}
            {filteredCandidates.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No candidates match "{nameSearch}"</p>
            )}
          </div>
          {selectedNotInFiltered.length > 0 && (
            <p className="text-[10px] text-muted-foreground">+ {selectedNotInFiltered.length} selected not shown (filtered out)</p>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{selectedIds.size} candidate{selectedIds.size !== 1 ? "s" : ""} selected</p>
    </div>
  );
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const [job, setJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pipeline, setPipeline] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const [testLink, setTestLink] = useState("");
  const [testTopN, setTestTopN] = useState(5);
  const [testSelectedIds, setTestSelectedIds] = useState<Set<string>>(new Set());
  const [testPickerOpen, setTestPickerOpen] = useState(false);

  const [interviewerEmail, setInterviewerEmail] = useState("");
  const [startDate, setStartDate] = useState("");
  const [interviewTopN, setInterviewTopN] = useState(5);
  const [interviewSelectedIds, setInterviewSelectedIds] = useState<Set<string>>(new Set());
  const [interviewPickerOpen, setInterviewPickerOpen] = useState(false);

  const toggleTestCandidate = (id: string) => {
    setTestSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleInterviewCandidate = (id: string) => {
    setInterviewSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const prevCandidatesRef = useRef<Candidate[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [j, c, p] = await Promise.all([
        api.getJob(jobId),
        api.listCandidates({ job_id: jobId, limit: 200 }),
        api.getPipelineSummary(jobId),
      ]);
      setJob(j);
      setPipeline(p);

      // Detect transitions and fire toasts
      const prev = prevCandidatesRef.current;
      if (prev.length > 0) {
        const prevMap = new Map(prev.map((x) => [x.id, x]));
        let newlyCompleted = 0;
        let newlyFailed = 0;
        for (const cand of c.candidates) {
          const old = prevMap.get(cand.id);
          if (!old) continue;
          if (old.pipeline_stage === "evaluating" && cand.pipeline_stage === "evaluated") newlyCompleted++;
          if (old.pipeline_stage !== "error" && cand.pipeline_stage === "error") newlyFailed++;
        }
        if (newlyCompleted > 0) toast.success(`${newlyCompleted} candidate${newlyCompleted > 1 ? "s" : ""} evaluation complete`);
        if (newlyFailed > 0) toast.error(`${newlyFailed} candidate${newlyFailed > 1 ? "s" : ""} failed — check error details`);

        const allDone = c.candidates.every((x) => x.pipeline_stage !== "evaluating" && !(x.status_message && x.status_message.includes("Processing")));
        const wasBusy = prev.some((x) => x.pipeline_stage === "evaluating" || (x.status_message && x.status_message.includes("Processing")));
        if (wasBusy && allDone && c.candidates.length > 0) {
          const errCount = c.candidates.filter((x) => x.pipeline_stage === "error").length;
          if (errCount === 0) toast.success("All processing complete!");
          else toast.warning(`Processing finished with ${errCount} error${errCount > 1 ? "s" : ""}`);
        }
      }

      prevCandidatesRef.current = c.candidates;
      setCandidates(c.candidates);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh while any candidate is in a processing state
  useEffect(() => {
    const hasProcessing = candidates.some(
      (c) => c.pipeline_stage === "evaluating" || c.pipeline_stage === "uploaded" ||
             (c.status_message && c.status_message.includes("Processing"))
    );
    if (hasProcessing) {
      autoRefreshRef.current = setInterval(refresh, 3000);
    } else if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [candidates, refresh]);

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
      toast.success(`Updated test results for ${result.count} candidates.`);
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
      toast.success(`${action} started!`);
      setTimeout(refresh, 3000);
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteJob = async () => {
    try {
      await api.deleteJob(jobId);
      toast.success("Job deleted");
      router.push("/jobs");
    } catch (err) {
      toast.error("Delete failed: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleDeleteCandidate = async (id: string, name: string) => {
    try {
      await api.deleteCandidate(id);
      toast.success(`Deleted ${name}`);
      refresh();
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  const handleRetryResume = async (id: string) => {
    try {
      await api.retryResume(id);
      toast.success("Resume retry started");
      setTimeout(refresh, 2000);
    } catch (err) {
      toast.error("Retry failed");
    }
  };

  const handleRetryEvaluation = async (id: string) => {
    try {
      await api.retryEvaluation(id);
      toast.success("Evaluation retry started");
      setTimeout(refresh, 3000);
    } catch (err) {
      toast.error("Retry failed");
    }
  };

  if (loading) return <PageSkeleton rows={4} />;
  if (!job) return <p className="text-destructive">Job not found.</p>;

  const rankedCandidates = [...candidates].sort((a, b) => {
    const ra = a.scores?.rank ?? 999;
    const rb = b.scores?.rank ?? 999;
    return ra - rb;
  });

  const applyTestTopN = () => {
    setTestSelectedIds(new Set(rankedCandidates.slice(0, testTopN).map((c) => c.id)));
  };

  const applyInterviewTopN = () => {
    setInterviewSelectedIds(new Set(rankedCandidates.slice(0, interviewTopN).map((c) => c.id)));
  };

  const processingCount = candidates.filter(
    (c) => c.pipeline_stage === "evaluating" || (c.status_message && c.status_message.includes("Processing"))
  ).length;
  const errorCount = candidates.filter((c) => c.pipeline_stage === "error").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <BackButton href="/jobs" label="Back to Jobs" />
          <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
          <p className="text-muted-foreground mt-1 line-clamp-2">{job.description.slice(0, 200)}...</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 px-3"
          >
            <Trash2 className="h-4 w-4" /> Delete Job
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this job?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{job.title}" and all {candidates.length} candidates. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteJob} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Live status banner */}
      {(processingCount > 0 || errorCount > 0) && (
        <div className="flex items-center gap-3 flex-wrap">
          {processingCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              {processingCount} candidate{processingCount > 1 ? "s" : ""} processing — auto-refreshing...
            </div>
          )}
          {errorCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <AlertCircle className="h-4 w-4" />
              {errorCount} candidate{errorCount > 1 ? "s" : ""} with errors — use retry buttons below
            </div>
          )}
        </div>
      )}

      {/* Pipeline overview */}
      {pipeline && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {Object.entries(STAGE_CONFIG).map(([stage, conf], i) => {
            const count = pipeline.stages[stage] || 0;
            if (count === 0 && stage !== "uploaded") return null;
            return (
              <div key={stage} className="flex items-center gap-2">
                {i > 0 && count > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${conf.color}`}>
                  {conf.label}: {count}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Tabs defaultValue="candidates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="candidates">
            Candidates ({candidates.length})
            {processingCount > 0 && <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />}
          </TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
        </TabsList>

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
                    <TableHead>CGPA</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => {
                    const stageConf = STAGE_CONFIG[c.pipeline_stage] || { label: c.pipeline_stage, color: "bg-gray-100 text-gray-700", icon: Info };
                    const StageIcon = stageConf.icon;
                    const isError = c.pipeline_stage === "error";
                    const isProcessing = c.pipeline_stage === "evaluating" || (c.status_message && c.status_message.includes("Processing"));
                    return (
                      <TableRow key={c.id} className={isError ? "bg-red-50/50" : isProcessing ? "bg-yellow-50/30" : ""}>
                        <TableCell className="font-mono text-xs">{c.s_no}</TableCell>
                        <TableCell>
                          <Link href={`/candidates/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{c.college || "—"}</TableCell>
                        <TableCell>{c.cgpa?.toFixed(2) || "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${stageConf.color}`}>
                            <StageIcon className="h-3 w-3" />
                            {stageConf.label}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          {c.status_message ? (
                            <span className={`text-xs ${isError ? "text-red-600" : "text-muted-foreground"} truncate block`} title={c.status_message}>
                              {c.status_message}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.scores?.composite_score != null ? (
                            <span className="font-mono font-bold">{(c.scores.composite_score * 100).toFixed(1)}%</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {isError && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => handleRetryResume(c.id)} title="Retry resume processing">
                                  <RotateCcw className="h-3 w-3" /> Resume
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => handleRetryEvaluation(c.id)} title="Retry evaluation">
                                  <RotateCcw className="h-3 w-3" /> Eval
                                </Button>
                              </>
                            )}
                            {!isError && !isProcessing && (c.pipeline_stage === "resume_processed" || c.pipeline_stage === "evaluated") && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => handleRetryEvaluation(c.id)} title="Re-run evaluation">
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                            <Link href={`/candidates/${c.id}`}>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">View</Button>
                            </Link>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => handleDeleteCandidate(c.id, c.name)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflow Tab */}
        <TabsContent value="workflow" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                <CandidatePicker
                  candidates={rankedCandidates}
                  selectedIds={testSelectedIds}
                  onToggle={toggleTestCandidate}
                  topN={testTopN}
                  onSetTopN={setTestTopN}
                  onApplyTopN={applyTestTopN}
                  open={testPickerOpen}
                  onToggleOpen={() => setTestPickerOpen(!testPickerOpen)}
                />
                <Button
                  variant="outline" className="w-full"
                  disabled={!testLink || testSelectedIds.size === 0}
                  onClick={() => runAction("Sending test emails", () =>
                    api.sendTestEmails({
                      job_id: jobId,
                      candidate_ids: [...testSelectedIds],
                      test_link: testLink,
                    })
                  )}
                >
                  Send to {testSelectedIds.size} Candidate{testSelectedIds.size !== 1 ? "s" : ""}
                </Button>
              </CardContent>
            </Card>

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
                <CandidatePicker
                  candidates={rankedCandidates}
                  selectedIds={interviewSelectedIds}
                  onToggle={toggleInterviewCandidate}
                  topN={interviewTopN}
                  onSetTopN={setInterviewTopN}
                  onApplyTopN={applyInterviewTopN}
                  open={interviewPickerOpen}
                  onToggleOpen={() => setInterviewPickerOpen(!interviewPickerOpen)}
                />
                <Button
                  className="w-full"
                  disabled={!interviewerEmail || !startDate || interviewSelectedIds.size === 0}
                  onClick={() => runAction("Scheduling interviews", () =>
                    api.scheduleInterviews({
                      job_id: jobId,
                      candidate_ids: [...interviewSelectedIds],
                      interviewer_email: interviewerEmail,
                      start_date: startDate,
                    })
                  )}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule {interviewSelectedIds.size} Interview{interviewSelectedIds.size !== 1 ? "s" : ""}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Rankings Tab */}
        <TabsContent value="rankings">
          <Card>
            <CardHeader>
              <CardTitle>Candidate Rankings</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TooltipProvider>
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
                        <ScoreCell entry={bd?.jd_match} label="JD Match" />
                        <ScoreCell entry={bd?.github} label="GitHub" />
                        <ScoreCell entry={bd?.test_code} label="Code Test" />
                        <ScoreCell entry={bd?.test_la} label="Logic Test" />
                        <ScoreCell entry={bd?.project_relevance} label="Project" />
                        <ScoreCell entry={bd?.cgpa} label="CGPA" />
                        <TableCell>
                          {c.scores?.composite_score != null ? (
                            <Tooltip>
                              <TooltipTrigger className="cursor-help">
                                <Badge variant="default" className="font-mono">
                                  {(c.scores.composite_score * 100).toFixed(1)}%
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-left">
                                <p className="font-semibold mb-1">Composite Score</p>
                                <p className="text-[11px] opacity-80">Weighted sum of all scores below</p>
                                {bd && (
                                  <div className="mt-1 space-y-0.5 text-[11px] font-mono">
                                    {Object.entries(bd).map(([key, val]) => (
                                      <div key={key} className="flex justify-between gap-3">
                                        <span className="opacity-70">{key.replace(/_/g, " ")}</span>
                                        <span>{((val as any)?.weighted * 100).toFixed(1)}%</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </TooltipProvider>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
