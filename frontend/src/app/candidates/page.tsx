"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Candidate } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/loading";
import { toast } from "sonner";
import { GitFork, Trash2, RotateCcw, AlertCircle } from "lucide-react";

const STAGE_COLORS: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-700",
  resume_processed: "bg-blue-100 text-blue-700",
  evaluating: "bg-yellow-100 text-yellow-700 animate-pulse",
  evaluated: "bg-purple-100 text-purple-700",
  ranked: "bg-amber-100 text-amber-700",
  test_sent: "bg-cyan-100 text-cyan-700",
  test_completed: "bg-teal-100 text-teal-700",
  shortlisted: "bg-green-100 text-green-700",
  interview_scheduled: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700",
};

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCandidates = () => {
    api.listCandidates({ limit: 200 })
      .then((r) => setCandidates(r.candidates))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCandidates(); }, []);

  const handleDelete = async (id: string, name: string) => {
    try {
      await api.deleteCandidate(id);
      toast.success(`Deleted ${name}`);
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast.error("Delete failed");
    }
  };

  const handleRetryResume = async (id: string) => {
    try {
      await api.retryResume(id);
      toast.success("Resume retry started");
      setTimeout(loadCandidates, 2000);
    } catch {
      toast.error("Retry failed");
    }
  };

  const handleRetryEval = async (id: string) => {
    try {
      await api.retryEvaluation(id);
      toast.success("Evaluation retry started");
      setTimeout(loadCandidates, 3000);
    } catch {
      toast.error("Retry failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">All Candidates</h1>
        <p className="text-muted-foreground mt-1">Browse all candidates across all jobs</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4"><TableSkeleton cols={8} rows={6} /></div>
          ) : candidates.length === 0 ? (
            <p className="p-6 text-muted-foreground text-center">No candidates yet. Upload a CSV from a job page.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
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
                  const isError = c.pipeline_stage === "error";
                  return (
                    <TableRow key={c.id} className={isError ? "bg-red-50/50" : ""}>
                      <TableCell className="font-mono text-xs">{c.s_no}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.email}</TableCell>
                      <TableCell className="text-sm">{c.college || "—"}</TableCell>
                      <TableCell>{c.cgpa?.toFixed(2) || "—"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STAGE_COLORS[c.pipeline_stage] || "bg-gray-100 text-gray-700"}`}>
                          {isError && <AlertCircle className="h-3 w-3" />}
                          {c.pipeline_stage}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className={`text-xs ${isError ? "text-red-600" : "text-muted-foreground"} truncate block`} title={c.status_message || ""}>
                          {c.status_message || "—"}
                        </span>
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
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => handleRetryResume(c.id)}>
                                <RotateCcw className="h-3 w-3" /> Resume
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => handleRetryEval(c.id)}>
                                <RotateCcw className="h-3 w-3" /> Eval
                              </Button>
                            </>
                          )}
                          <Link href={`/candidates/${c.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">View</Button>
                          </Link>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(c.id, c.name)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
