"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon } from "lucide-react";
import type { GalleryMedia } from "@/types";

export default function GalleryPage() {
  const [media, setMedia] = useState<GalleryMedia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("gallery_media")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setMedia((data as GalleryMedia[]) || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Galerie</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Galerie</h2>
        <p className="text-muted-foreground mt-1">Photos et videos de l&apos;equipe</p>
      </div>

      {media.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          <div className="text-center">
            <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold text-lg">Aucun media</h3>
            <p className="text-sm mt-1">Les photos et videos apparaitront ici</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {media.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="aspect-square bg-muted">
                <img src={item.url} alt={item.caption || ""} className="w-full h-full object-cover" />
              </div>
              {item.caption && (
                <CardContent className="p-2">
                  <p className="text-xs text-muted-foreground truncate">{item.caption}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
