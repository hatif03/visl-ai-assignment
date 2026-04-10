"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function BackButton({ href, label = "Back" }: { href?: string; label?: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2 mb-2"
      onClick={() => (href ? router.push(href) : router.back())}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
