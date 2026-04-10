"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Job } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { CardSkeleton } from "@/components/loading";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = () => {
    api.listJobs().then(setJobs).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { loadJobs(); }, []);

  const handleDelete = async (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.deleteJob(jobId);
      toast.success("Job deleted");
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground mt-1">Manage job postings and recruitment pipelines</p>
        </div>
        <Link href="/jobs/new">
          <Button><Plus className="h-4 w-4 mr-2" />Create Job</Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">No jobs yet. Create one to start screening candidates.</p>
            <Link href="/jobs/new"><Button>Create Your First Job</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg pr-2">{job.title}</CardTitle>
                  <AlertDialog>
                    <AlertDialogTrigger
                      className="h-7 w-7 p-0 inline-flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0 rounded-md hover:bg-accent"
                      onClick={(e) => e.preventDefault()}
                    >
                      <Trash2 className="h-4 w-4" />
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{job.title}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this job and all {job.candidate_count || 0} candidates.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => handleDelete(e, job.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{job.description}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{job.candidate_count || 0} candidates</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
