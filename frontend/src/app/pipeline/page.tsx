"use client";

import { useEffect, useState } from "react";
import { api, Job, Candidate, PipelineSummary } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const STAGE_ORDER = [
  "uploaded",
  "resume_processed",
  "evaluated",
  "ranked",
  "test_sent",
  "test_completed",
  "shortlisted",
  "interview_scheduled",
];

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  uploaded: { label: "Uploaded", color: "border-gray-300", bg: "bg-gray-50" },
  resume_processed: { label: "Resume Processed", color: "border-blue-300", bg: "bg-blue-50" },
  evaluated: { label: "AI Evaluated", color: "border-purple-300", bg: "bg-purple-50" },
  ranked: { label: "Ranked", color: "border-amber-300", bg: "bg-amber-50" },
  test_sent: { label: "Test Sent", color: "border-cyan-300", bg: "bg-cyan-50" },
  test_completed: { label: "Test Done", color: "border-teal-300", bg: "bg-teal-50" },
  shortlisted: { label: "Shortlisted", color: "border-green-300", bg: "bg-green-50" },
  interview_scheduled: { label: "Interview", color: "border-emerald-300", bg: "bg-emerald-50" },
};

export default function PipelinePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pipeline, setPipeline] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listJobs().then((j) => {
      setJobs(j);
      if (j.length > 0) setSelectedJobId(j[0].id);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    Promise.all([
      api.listCandidates({ job_id: selectedJobId, limit: 200 }),
      api.getPipelineSummary(selectedJobId),
    ]).then(([c, p]) => {
      setCandidates(c.candidates);
      setPipeline(p);
    }).catch(console.error);
  }, [selectedJobId]);

  const candidatesByStage = STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = candidates.filter((c) => c.pipeline_stage === stage);
    return acc;
  }, {} as Record<string, Candidate[]>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground mt-1">Kanban view of candidate progression</p>
        </div>
        <Select value={selectedJobId} onValueChange={(v) => v && setSelectedJobId(v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a job..." />
          </SelectTrigger>
          <SelectContent>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedJobId ? (
        <p className="text-muted-foreground">Select a job to view its pipeline.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGE_ORDER.map((stage) => {
            const conf = STAGE_CONFIG[stage];
            const stageCandidates = candidatesByStage[stage] || [];
            return (
              <div key={stage} className="min-w-[250px] flex-shrink-0">
                <div className={`rounded-lg border-2 ${conf.color} ${conf.bg} p-3`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">{conf.label}</h3>
                    <Badge variant="secondary" className="text-xs">{stageCandidates.length}</Badge>
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {stageCandidates.map((c) => (
                      <Link key={c.id} href={`/candidates/${c.id}`}>
                        <div className="bg-white rounded-md p-3 border shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                          <p className="font-medium text-sm">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.college || c.branch || c.email}</p>
                          {c.scores?.composite_score != null && (
                            <div className="mt-1">
                              <span className="text-xs font-mono font-bold">
                                Score: {(c.scores.composite_score * 100).toFixed(1)}%
                              </span>
                              {c.scores.rank && (
                                <Badge variant="outline" className="ml-2 text-[10px]">#{c.scores.rank}</Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                    {stageCandidates.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No candidates</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
