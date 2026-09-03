"use client";
import { Component, type ReactNode } from "react";
import { logClientError } from "@/lib/errorLogger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
    logClientError(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center text-sm text-muted-foreground">
          Une erreur est survenue dans cette section.
          <button
            className="block mx-auto mt-2 text-xs text-[var(--color-primary-blue)] underline"
            onClick={() => this.setState({ hasError: false })}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
