"use client";
import { useEffect } from "react";
import { initErrorTracking } from "@/lib/errorLogger";

export function ErrorTracker() {
  useEffect(() => { initErrorTracking(); }, []);
  return null;
}
