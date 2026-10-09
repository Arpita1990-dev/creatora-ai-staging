"use client";

import CreateoraSparkle from "@/app/components/CreateoraSparkle";

export default function CreateoraLoadingState({
  label,
  className = "",
  size = 72,
}) {
  return (
    <div
      className={`createora-loading-state ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <CreateoraSparkle state="generating" size={size} label={label} />
      <span>{label}</span>
    </div>
  );
}
