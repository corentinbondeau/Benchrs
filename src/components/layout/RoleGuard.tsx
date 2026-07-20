"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { UserRole } from "@/types";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({
  allowedRoles,
  children,
  fallback,
}: RoleGuardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
      </div>
    );
  }

  const userRole = session?.user?.role;
  if (!userRole || !allowedRoles.includes(userRole)) {
    return (
      fallback || (
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
          <div className="text-4xl">🔒</div>
          <h2 className="text-xl font-semibold">Accès restreint</h2>
          <p className="text-muted-foreground">
            Vous n&apos;avez pas les permissions nécessaires pour accéder à cette
            page.
          </p>
        </div>
      )
    );
  }

  return <>{children}</>;
}
