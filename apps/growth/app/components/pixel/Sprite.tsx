"use client";

import { useEffect, useRef } from "react";
import type { Frame, Palette } from "@/lib/sprites";

/** Draws one or more stacked pixel frames onto a crisp canvas. */
export default function Sprite({
  layers,
  palette,
  scale = 6,
  className,
  flip = false,
  title,
}: {
  layers: Frame[];
  palette: Palette;
  scale?: number;
  className?: string;
  flip?: boolean;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(...layers.map((l) => Math.max(...l.map((r) => r.length))));
  const h = Math.max(...layers.map((l) => l.length));

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, w, h);
    for (const layer of layers)
      layer.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const col = palette[row[x]];
          if (!col) continue;
          g.fillStyle = col;
          g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
        }
      });
  }, [layers, palette, w, h, flip]);

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ width: w * scale, height: h * scale, imageRendering: "pixelated" }}
    />
  );
}
