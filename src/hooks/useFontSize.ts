"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

export type FontSizeLevel = "S" | "M" | "L" | "XL";

const FONT_SIZE_MULTIPLIERS: Record<FontSizeLevel, number> = {
  S: 0.8,
  M: 1,
  L: 1.2,
  XL: 1.5,
};

export function useFontSize() {
  const [fontSize, setFontSize] = useState<FontSizeLevel>("M");
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Charger la préférence au montage
  useEffect(() => {
    const loadFontSize = async () => {
      // D'abord, vérifier le localStorage
      const savedSize = localStorage.getItem("fontSize") as FontSizeLevel | null;
      if (savedSize && FONT_SIZE_MULTIPLIERS[savedSize]) {
        setFontSize(savedSize);
        applyFontSize(savedSize);
        setLoading(false);
        return;
      }

      // Si utilisateur connecté, charger depuis Supabase
      if (user?.id) {
        try {
          const supabase = createClient();
          const { data } = await supabase
            .from("user_preferences")
            .select("font_size_level")
            .eq("user_id", user.id)
            .single();

          if (data?.font_size_level) {
            const size = data.font_size_level as FontSizeLevel;
            setFontSize(size);
            localStorage.setItem("fontSize", size);
            applyFontSize(size);
          }
        } catch (error) {
          console.error("Erreur chargement font-size:", error);
        }
      }

      setLoading(false);
    };

    loadFontSize();
  }, [user?.id]);

  const changeFontSize = useCallback(
    async (newSize: FontSizeLevel) => {
      setFontSize(newSize);
      localStorage.setItem("fontSize", newSize);
      applyFontSize(newSize);

      // Sauvegarder en Supabase si utilisateur connecté
      if (user?.id) {
        try {
          const supabase = createClient();
          await supabase
            .from("user_preferences")
            .upsert({
              user_id: user.id,
              font_size_level: newSize,
            });
        } catch (error) {
          console.error("Erreur sauvegarde font-size:", error);
        }
      }
    },
    [user?.id]
  );

  return { fontSize, changeFontSize, loading };
}

function applyFontSize(size: FontSizeLevel) {
  const multiplier = FONT_SIZE_MULTIPLIERS[size];
  document.documentElement.style.setProperty(
    "--font-size-multiplier",
    multiplier.toString()
  );
}
