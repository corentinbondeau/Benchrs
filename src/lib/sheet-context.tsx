"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface SheetContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SheetContext = createContext<SheetContextType>({
  open: false,
  setOpen: () => {},
});

export function SheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SheetContext.Provider value={{ open, setOpen }}>
      {children}
    </SheetContext.Provider>
  );
}

export function useSheet() {
  return useContext(SheetContext);
}
