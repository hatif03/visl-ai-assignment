"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

const DEFAULT_WEIGHTS = {
  jd_match: 0.25,
  github: 0.2,
  test_code: 0.2,
  test_la: 0.1,
  project_relevance: 0.1,
  research_relevance: 0.05,
  cgpa: 0.1,
};

const WEIGHT_LABELS: Record<string, string> = {
  jd_match: "JD Match (Resume + Semantic)",
  github: "GitHub Impact",
  test_code: "Coding Test",
  test_la: "Logical Aptitude",
  project_relevance: "AI Project Relevance",
  research_relevance: "Research Quality",
  cgpa: "Academic (CGPA)",
};

export default function NewJobPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [submitting, setSubmitting] = useState(false);

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) {
      toast.error("Title and description are required");
      return;
    }
    setSubmitting(true);
    try {
      const job = await api.createJob({ title, description, weight_config: weights }) as { id: string };
      toast.success("Job created successfully!");
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      toast.error("Failed to create job: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Job</h1>
        <p className="text-muted-foreground mt-1">
          Define a role and configure how candidates are evaluated
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Job Title</Label>
              <Input
                id="title"
                placeholder="e.g., Founding AI Engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="description">Job Description</Label>
              <Textarea
                id="description"
                placeholder="Paste the full job description here. This will be used for AI-powered evaluation..."
                rows={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                The AI will evaluate candidates against this description using semantic similarity and LLM reasoning.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Scoring Weights
              <span className={`text-sm font-normal ${Math.abs(totalWeight - 1) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                Total: {(totalWeight * 100).toFixed(0)}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(weights).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{WEIGHT_LABELS[key] || key}</Label>
                  <span className="text-sm font-mono text-muted-foreground">
                    {(value * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[value * 100]}
                  onValueChange={(val) =>
                    setWeights({ ...weights, [key]: (Array.isArray(val) ? val[0] : val) / 100 })
                  }
                  min={0}
                  max={50}
                  step={5}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Job"}
          </Button>
        </div>
      </form>
    </div>
  );
}
