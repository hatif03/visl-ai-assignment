"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Candidate } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { GitFork } from "lucide-react";

const STAGE_COLORS: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-700",
  resume_processed: "bg-blue-100 text-blue-700",
  evaluated: "bg-purple-100 text-purple-700",
  ranked: "bg-amber-100 text-amber-700",
  test_sent: "bg-cyan-100 text-cyan-700",
  test_completed: "bg-teal-100 text-teal-700",
  shortlisted: "bg-green-100 text-green-700",
  interview_scheduled: "bg-emerald-100 text-emerald-700",
};

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listCandidates({ limit: 200 })
      .then((r) => setCandidates(r.candidates))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">All Candidates</h1>
        <p className="text-muted-foreground mt-1">Browse all candidates across all jobs</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-muted-foreground">Loading candidates...</p>
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
                  <TableHead>GitHub</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.s_no}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-sm">{c.college || "—"}</TableCell>
                    <TableCell>{c.cgpa?.toFixed(2) || "—"}</TableCell>
                    <TableCell>
                      {c.github_url ? (
                        <a href={c.github_url} target="_blank" rel="noopener noreferrer">
                          <GitFork className="h-4 w-4 text-blue-600" />
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STAGE_COLORS[c.pipeline_stage] || "bg-gray-100 text-gray-700"}`}>
                        {c.pipeline_stage}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
