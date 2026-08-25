"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[auth-error]", error);
  }, [error]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Une erreur est survenue</CardTitle>
        <CardDescription>
          Quelque chose s&apos;est mal passé. Vous pouvez réessayer ou revenir à l&apos;accueil.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center"
        >
          {error.message || "Erreur inattendue."}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button onClick={() => reset()} className="w-full">
          Réessayer
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline", className: "w-full" })}>
          Retour à l&apos;accueil
        </Link>
      </CardFooter>
    </Card>
  );
}
