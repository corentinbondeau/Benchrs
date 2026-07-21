"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";

export default function CotisationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Cotisations</h2>
        <p className="text-muted-foreground mt-1">Suivi des paiements</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Gestion des cotisations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            <div className="text-center">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="font-semibold text-lg">Bientot disponible</h3>
              <p className="text-sm mt-1">Le suivi des cotisations sera implemente prochainement</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
