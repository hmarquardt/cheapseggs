import { useEffect, useRef, useState } from "preact/hooks";
import type { SpinSegmentDto } from "../../domain/wheel";

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 104;
const WEDGE_COLORS = ["#c53058", "#7b2445", "#95294c", "#5d1b38"];

interface Props {
  segments: SpinSegmentDto[];
  selectedIndex: number;
  durationMs: number;
  spinning: boolean;
  spinCount: number;
}

function point(angleDeg: number, radius: number): string {
  const radians = (angleDeg * Math.PI) / 180;
  return `${CENTER + radius * Math.cos(radians)} ${CENTER + radius * Math.sin(radians)}`;
}

function wedgePath(start: number, end: number): string {
  return [
    `M ${CENTER} ${CENTER}`,
    `L ${point(start, RADIUS)}`,
    `A ${RADIUS} ${RADIUS} 0 0 1 ${point(end, RADIUS)}`,
    "Z",
  ].join(" ");
}

/** Two short caption lines; the full title always stays in the list below the wheel. */
function captionLines(label: string, width = 11): string[] {
  const words = label.replace("…", "").split(" ").filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= width)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word.length > width ? `${word.slice(0, width - 1)}…` : word);
    if (lines.length === 2) break;
  }
  return lines.slice(0, 2);
}

export function Wheel({ segments, selectedIndex, durationMs, spinning, spinCount }: Props) {
  const [rotation, setRotation] = useState(0);
  const lastSpin = useRef(0);

  useEffect(() => {
    if (selectedIndex < 0 || segments.length === 0 || spinCount === lastSpin.current) return;
    lastSpin.current = spinCount;
    const step = 360 / segments.length;
    // Cosmetic jitter only: the result was already fixed by the server.
    const jitter = (Math.random() - 0.5) * step * 0.5;
    setRotation((current) => {
      const target = (((-selectedIndex * step + jitter) % 360) + 360) % 360;
      const currentAngle = ((current % 360) + 360) % 360;
      const delta = (target - currentAngle + 360) % 360;
      return current + 360 * 4 + delta;
    });
  }, [selectedIndex, segments, spinCount]);

  const step = segments.length > 0 ? 360 / segments.length : 360;
  const single = segments.length === 1;
  const bulbs = Array.from({ length: 20 }, (_, index) => index);

  return (
    <div class="wheel-stage">
      <div class="wheel-pointer" aria-hidden="true" />
      <div
        class={`wheel-disc ${spinning ? "is-spinning" : ""}`}
        style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${durationMs}ms` }}
      >
        <svg
          class="wheel-svg"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="presentation"
          aria-hidden="true"
          focusable="false"
        >
          {bulbs.map((bulb) => {
            const angle = (bulb / bulbs.length) * 360;
            return (
              <circle
                key={`bulb-${bulb}`}
                class={bulb % 2 === 0 ? "wheel-bulb" : "wheel-bulb is-dim"}
                cx={CENTER + 117 * Math.cos((angle * Math.PI) / 180)}
                cy={CENTER + 117 * Math.sin((angle * Math.PI) / 180)}
                r={2.6}
              />
            );
          })}
          <circle cx={CENTER} cy={CENTER} r={RADIUS + 3} class="wheel-rim" />
          {single ? (
            <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={WEDGE_COLORS[0]} />
          ) : (
            segments.map((segment, index) => {
              const center = -90 + index * step;
              return (
                <path
                  key={segment.id}
                  d={wedgePath(center - step / 2, center + step / 2)}
                  fill={WEDGE_COLORS[index % WEDGE_COLORS.length]}
                  stroke="#2a0f1c"
                  stroke-width="0.8"
                />
              );
            })
          )}
          {segments.length > 1 &&
            segments.map((segment, index) => {
              const center = -90 + index * step;
              const lines = captionLines(segment.label);
              return (
                <g
                  key={`label-${segment.id}`}
                  transform={`rotate(${center + 90} ${CENTER} ${CENTER})`}
                >
                  {lines.map((line, lineIndex) => (
                    <text
                      key={line}
                      class="wheel-caption"
                      x={CENTER}
                      y={CENTER - 46 + lineIndex * 11}
                      textAnchor="middle"
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          <circle cx={CENTER} cy={CENTER} r={22} class="wheel-hub-ring" />
          <text class="wheel-hub-label" x={CENTER} y={CENTER + 5} textAnchor="middle">
            CS
          </text>
        </svg>
      </div>
    </div>
  );
}
