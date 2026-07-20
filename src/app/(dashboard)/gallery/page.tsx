"use client";

import { GalleryGrid } from "@/components/gallery/GalleryGrid";

export default function GalleryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Galerie</h2>
        <p className="text-muted-foreground mt-1">
          Photos et vidéos de l&apos;équipe
        </p>
      </div>
      <GalleryGrid />
    </div>
  );
}
