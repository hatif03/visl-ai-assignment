// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, Candidate, Evaluation, Score } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { GitFork, Mail, GraduationCap, FileText, ExternalLink, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";
import { PageSkeleton } from "@/components/loading";
import { toast } from "sonner";

const DIMENSION_LABELS: Record<string, string> = {
  jd_match: "JD Match",
  github: "GitHub",
  test_code: "Code Test",
  test_la: "Logic Test",
  project_relevance: "Project",
  research_relevance: "Research",
  cgpa: "CGPA",
};

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#14b8a6", "#f59e0b", "#ec4899", "#84cc16"];

export default function CandidateDetailPage() {
  const params = useParams();
  const candidateId = params.id as string;
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getCandidate(candidateId),
      api.getCandidateEvaluation(candidateId),
    ])
      .then(([c, evalData]) => {
        setCandidate(c);
        setEvaluation(evalData.evaluation);
        setScore(evalData.score);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [candidateId]);

  if (loading) return <PageSkeleton rows={4} />;
  if (!candidate) return <p className="text-destructive">Candidate not found.</p>;

  const breakdown = score?.score_breakdown;
  const radarData = breakdown
    ? Object.entries(breakdown).map(([key, val]) => ({
        dimension: DIMENSION_LABELS[key] || key,
        value: Math.round(val.raw * 100),
        fullMark: 100,
      }))
    : [];

  const barData = breakdown
    ? Object.entries(breakdown).map(([key, val], i) => ({
        name: DIMENSION_LABELS[key] || key,
        raw: Math.round(val.raw * 100),
        weighted: Math.round(val.weighted * 100),
        weight: Math.round(val.weight * 100),
        color: COLORS[i % COLORS.length],
      }))
    : [];

  const llmEval = evaluation?.explanation as Record<string, unknown> | undefined;
  const llmResult = llmEval?.llm_evaluation as Record<string, unknown> | undefined;
  const githubAnalysis = llmEval?.github_analysis as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <BackButton label="Back" />
          <h1 className="text-3xl font-bold tracking-tight">{candidate.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{candidate.email}</span>
            {candidate.college && <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />{candidate.college}</span>}
          </div>
        </div>
        {score?.rank && (
          <div className="text-center">
            <div className="text-4xl font-bold">#{score.rank}</div>
            <div className="text-sm text-muted-foreground">Rank</div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">
              {score?.composite_score != null ? `${(score.composite_score * 100).toFixed(1)}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Composite Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{candidate.cgpa?.toFixed(2) || "—"}</div>
            <p className="text-xs text-muted-foreground">CGPA</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{candidate.branch || "—"}</div>
            <p className="text-xs text-muted-foreground">Branch</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold capitalize">{candidate.pipeline_stage.replace("_", " ")}</div>
            <p className="text-xs text-muted-foreground">Stage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center flex flex-col items-center gap-1">
            {candidate.github_url ? (
              <a href={candidate.github_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                <GitFork className="h-5 w-5" /> Profile
              </a>
            ) : <span className="text-muted-foreground">No GitHub</span>}
            {candidate.resume_url && (
              <a href={candidate.resume_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 text-sm">
                <FileText className="h-3.5 w-3.5" /> Resume
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Radar Chart */}
        {radarData.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Score Radar</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" className="text-xs" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} />
                  <Radar name="Score" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Bar Chart */}
        {barData.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Weighted Score Breakdown</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="name" type="category" width={80} className="text-xs" />
                  <Tooltip formatter={(value: number) => `${value}%`} />
                  <Bar dataKey="raw" name="Raw Score" radius={[0, 4, 4, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* AI Evaluation Details */}
      {llmResult && (() => {
        const evalFailed = ["technical_depth", "project_complexity", "research_quality", "jd_alignment"].every(
          (dim) => {
            const d = llmResult[dim] as { score?: number; justification?: string } | undefined;
            return d && d.score === 0 && d.justification?.toLowerCase().includes("failed");
          }
        );
        return (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI Evaluation (Explainable)</CardTitle>
              {evalFailed && candidate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={async () => {
                    try {
                      toast.info("Re-running evaluation...");
                      await api.retryEvaluation(candidate.id);
                      toast.success("Evaluation re-queued — refresh in a moment");
                    } catch {
                      toast.error("Failed to re-trigger evaluation");
                    }
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Retry Evaluation
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {evalFailed && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 mb-2">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Evaluation failed for this candidate</p>
                  <p className="text-sm opacity-80">This was likely caused by an API rate limit or connection timeout. Use the retry button above to re-run.</p>
                </div>
              </div>
            )}
            {["technical_depth", "project_complexity", "research_quality", "jd_alignment"].map((dim) => {
              const d = llmResult[dim] as { score?: number; justification?: string } | undefined;
              if (!d) return null;
              const isFailed = d.score === 0 && d.justification?.toLowerCase().includes("failed");
              return (
                <div key={dim} className={`p-4 rounded-lg ${isFailed ? "bg-red-50/50 border border-red-100" : "bg-muted/50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-semibold capitalize">{dim.replace("_", " ")}</h4>
                    <Badge variant={isFailed ? "destructive" : "secondary"}>{isFailed ? "Failed" : `${d.score}/10`}</Badge>
                  </div>
                  <p className={`text-sm ${isFailed ? "text-red-600" : "text-muted-foreground"}`}>{d.justification}</p>
                </div>
              );
            })}
            {llmResult.overall_assessment && !evalFailed && (
              <>
                <Separator />
                <div>
                  <h4 className="font-semibold mb-2">Overall Assessment</h4>
                  <p className="text-sm text-muted-foreground">{llmResult.overall_assessment as string}</p>
                </div>
              </>
            )}
            {!evalFailed && (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.isArray(llmResult.strengths) && llmResult.strengths.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-green-700">Strengths</h4>
                  <ul className="space-y-1">
                    {(llmResult.strengths as string[]).map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(llmResult.concerns) && llmResult.concerns.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-amber-700">Concerns</h4>
                  <ul className="space-y-1">
                    {(llmResult.concerns as string[]).map((c, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-amber-600 mt-0.5">!</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            )}
          </CardContent>
        </Card>
        );
      })()}

      {/* GitHub Analysis */}
      {githubAnalysis && (githubAnalysis as Record<string, unknown>).repos && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitFork className="h-5 w-5" /> GitHub Analysis
              {(githubAnalysis as Record<string, unknown>).username && (
                <a
                  href={`https://github.com/${(githubAnalysis as Record<string, unknown>).username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-normal text-blue-600 hover:underline flex items-center gap-1"
                >
                  @{(githubAnalysis as Record<string, unknown>).username as string} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {((githubAnalysis as Record<string, unknown>).repos as Array<Record<string, unknown>>).slice(0, 6).map((repo, i) => (
                <div key={i} className="p-3 rounded-lg border">
                  <h5 className="font-medium text-sm">{repo.name as string}</h5>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{(repo.description as string) || "No description"}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    {repo.language && <Badge variant="outline" className="text-[10px]">{repo.language as string}</Badge>}
                    <span>⭐ {repo.stars as number}</span>
                    <span>🍴 {repo.forks as number}</span>
                    <span className="text-muted-foreground">Impact: {(repo.impact_score as number)?.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project & Research */}
      <div className="grid gap-6 lg:grid-cols-2">
        {candidate.best_ai_project && (
          <Card>
            <CardHeader><CardTitle>Best AI Project</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{candidate.best_ai_project}</p>
            </CardContent>
          </Card>
        )}
        {candidate.research_work && (
          <Card>
            <CardHeader><CardTitle>Research Work</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{candidate.research_work}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
