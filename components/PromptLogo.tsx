"use client";

import { useState } from "react";

/**
 * Prompt Group logo.
 * Renders /prompt-logo.png if present (drop the real logo file into /public/).
 * If the file is missing or fails to load, falls back to an inline SVG mark so
 * the app never shows a broken image.
 */
export function PromptLogo({
  size = 28,
  showText = true,
  className = "",
}: {
  size?: number;
  showText?: boolean;
  className?: string;
}) {
  const [imgBroken, setImgBroken] = useState(false);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {!imgBroken ? (
        <img
          src="/prompt-logo.png"
          alt="Prompt Group"
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: "contain" }}
          onError={() => setImgBroken(true)}
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Prompt"
        >
          <defs>
            <linearGradient id="prompt-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#19A05E" />
              <stop offset="100%" stopColor="#0E6CB8" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="44" height="44" rx="10" fill="url(#prompt-bg)" />
          <path
            d="M16 12h11c4.5 0 8 3.1 8 7.5S31.5 27 27 27h-6v9h-5V12zm5 4.5v6h5.5c1.9 0 3.4-1.3 3.4-3s-1.5-3-3.4-3H21z"
            fill="#ffffff"
          />
          <circle cx="34" cy="35" r="2.6" fill="#ffffff" />
        </svg>
      )}
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-white">PROMPT</span>
          <span className="text-[8px] font-medium tracking-wider text-white/70">GROUP</span>
        </div>
      )}
    </div>
  );
}
