"use client";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page failed:", error);
  }, [error]);
  return (
    <ErrorState
      error={new Error("We couldn’t open this page. Give it another try.")}
      retry={reset}
    />
  );
}
