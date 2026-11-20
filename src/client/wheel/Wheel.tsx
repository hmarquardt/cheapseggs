import { useEffect, useRef, useState } from "preact/hooks";
import type { SpinSegmentDto } from "../../domain/wheel";

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 104;
const WEDGE_COLORS = ["#c53058", "#7b2445", "#95294c", "#5d1b38"];
const IDLE_WEDGES = 8;
/** Captions sit at the rim and run inward, so they never cross into a neighbour. */
const LABEL_RADIUS = 90;
const LABEL_WIDTH = 13;

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
function captionLines(label: string, width = 13): string[] {
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

  // Before the first spin the machine still has to look like a machine.
  const idle = segments.length === 0;
  const wedgeCount = idle ? IDLE_WEDGES : segments.length;
  const step = 360 / (wedgeCount || 1);
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
          {wedgeCount === 1 ? (
            <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={WEDGE_COLORS[0]} />
          ) : (
            Array.from({ length: wedgeCount }, (_, index) => {
              const center = -90 + index * step;
              return (
                <path
                  key={`wedge-${index}`}
                  class={idle ? "wheel-wedge is-idle" : "wheel-wedge"}
                  d={wedgePath(center - step / 2, center + step / 2)}
                  fill={WEDGE_COLORS[index % WEDGE_COLORS.length]}
                  stroke="#2a0f1c"
                  stroke-width="0.8"
                />
              );
            })
          )}
          {wedgeCount > 1 &&
            segments.map((segment, index) => {
              const angle = -90 + index * step;
              // Radial captions, flipped on the left half so none of them read upside down.
              const flipped = Math.cos((angle * Math.PI) / 180) < 0;
              const lines = captionLines(segment.label, LABEL_WIDTH);
              return (
                <g
                  key={`label-${segment.id}`}
                  transform={`rotate(${flipped ? angle + 180 : angle} ${CENTER} ${CENTER})`}
                >
                  {lines.map((line, lineIndex) => (
                    <text
                      key={line}
                      class="wheel-caption"
                      x={flipped ? CENTER - LABEL_RADIUS : CENTER + LABEL_RADIUS}
                      y={CENTER + (lines.length === 1 ? 3 : lineIndex === 0 ? -2 : 9)}
                      text-anchor={flipped ? "start" : "end"}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          <circle cx={CENTER} cy={CENTER} r={22} class="wheel-hub-ring" />
          <text class="wheel-hub-label" x={CENTER} y={CENTER + 5} text-anchor="middle">
            {idle ? "SPIN" : "CS"}
          </text>
        </svg>
      </div>
    </div>
  );
}
