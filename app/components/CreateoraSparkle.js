"use client";

import { useEffect, useState } from "react";

/**
 * CreateoraSparkle — Single large animated ✦ symbol for preview sections.
 *
 * States:
 *   idle       — gentle breathing/pulse
 *   generating — full animation (rotation, scale pulse, glow, float)
 *   error      — static, no animation
 *
 * The animation is controlled by REAL generation state, not timers.
 * Respects prefers-reduced-motion automatically.
 */
export default function CreateoraSparkle({
  state = "idle",
  size = 72,
  label = "CreateoraAI generation in progress",
}) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const handler = (event) => setReducedMotion(event.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const isGenerating = state === "generating";
  const isError = state === "error";

  const sparkleStyle = {
    fontSize: `${size}px`,
    lineHeight: 1,
    width: `${size * 1.4}px`,
    height: `${size * 1.4}px`,
    display: "grid",
    placeItems: "center",
    background:
      "linear-gradient(135deg, #ff5a36, #ff704d, #c7462a, #ff8a5c)",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    filter: reducedMotion
      ? "none"
      : isGenerating
        ? "drop-shadow(0 0 24px rgba(255, 90, 54, 0.65))"
        : "drop-shadow(0 0 10px rgba(255, 90, 54, 0.35))",
    animation: reducedMotion
      ? "none"
      : isGenerating
        ? "createoraSparkleGenerate 3.5s ease-in-out infinite"
        : isError
          ? "none"
          : "createoraSparkleIdle 3s ease-in-out infinite",
    transition: "filter 0.4s ease",
  };

  return (
    <div
      className={`createora-sparkle createora-sparkle--${state}`}
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={sparkleStyle}>✦</span>
    </div>
  );
}
