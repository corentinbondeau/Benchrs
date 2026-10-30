"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <CardTitle>Quelque chose s&apos;est mal passé</CardTitle>
          {error.message && (
            <CardDescription>{error.message}</CardDescription>
          )}
        </CardHeader>

        {error.digest && (
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Code : {error.digest}
            </p>
          </CardContent>
        )}

        <CardFooter>
          <Button onClick={reset} variant="default" className="w-full">
            Réessayer
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
