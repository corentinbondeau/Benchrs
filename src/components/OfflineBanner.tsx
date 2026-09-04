"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  // Ne jamais afficher au premier render — ne réagir qu'aux vrais événements offline/online
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-white text-center py-1.5 text-xs font-medium flex items-center justify-center gap-2">
      <WifiOff className="h-3.5 w-3.5" />
      Hors-ligne — les modifications seront synchronisées au retour
    </div>
  );
}
