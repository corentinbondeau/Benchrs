"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MediaUpload } from "./MediaUpload";
import { MediaViewer } from "./MediaViewer";
import { Badge } from "@/components/ui/badge";
import { Play } from "lucide-react";
import type { Event } from "@/types";

interface GalleryMedia {
  id: string;
  url: string;
  media_type: string;
  caption: string | null;
  event_id: string | null;
  created_at: string;
  event?: { id: string; title: string; event_date: string } | null;
  uploader?: { first_name: string; last_name: string } | null;
}

export function GalleryGrid() {
  const [media, setMedia] = useState<GalleryMedia[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      const [mediaRes, eventsRes] = await Promise.all([
        supabase
          .from("gallery_media")
          .select("*, event:events!gallery_media_event_id_fkey(id, title, event_date), uploader:profiles!gallery_media_uploaded_by_fkey(first_name, last_name)")
          .order("created_at", { ascending: false }),
        supabase
          .from("events")
          .select("*")
          .order("event_date", { ascending: false }),
      ]);

      setMedia((mediaRes.data as GalleryMedia[]) || []);
      setEvents((eventsRes.data as Event[]) || []);
      setLoading(false);
    }

    fetchData();
  }, []);

  function handleUploaded() {
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("gallery_media")
      .select("*, event:events!gallery_media_event_id_fkey(id, title, event_date), uploader:profiles!gallery_media_uploaded_by_fkey(first_name, last_name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setMedia((data as GalleryMedia[]) || []);
        setLoading(false);
      });
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MediaUpload events={events} onUploaded={handleUploaded} />

      {media.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          <p className="text-sm">Aucun média dans la galerie</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {media.map((item, index) => (
            <div
              key={item.id}
              className="group relative aspect-square overflow-hidden rounded-lg cursor-pointer border hover:shadow-md transition-shadow"
              onClick={() => setViewerIndex(index)}
            >
              {item.media_type === "video" ? (
                <>
                  <video
                    src={item.url}
                    className="h-full w-full object-cover"
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                    <Play className="h-10 w-10 text-white drop-shadow-lg" />
                  </div>
                </>
              ) : (
                <img
                  src={item.url}
                  alt={item.caption || ""}
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              )}

              {item.event && (
                <Badge className="absolute top-2 left-2 text-[10px] bg-black/60 text-white border-0">
                  {item.event.title}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {viewerIndex !== null && (
        <MediaViewer
          media={media}
          currentIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
        />
      )}
    </div>
  );
}
