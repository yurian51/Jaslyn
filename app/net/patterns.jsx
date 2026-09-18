"use client";

const POINTS = [
  [8, 20], [20, 10], [34, 18], [49, 8], [65, 17], [82, 11], [93, 27],
  [13, 45], [28, 37], [44, 48], [61, 36], [77, 45], [89, 55],
  [7, 72], [21, 61], [38, 76], [54, 62], [71, 73], [86, 67], [96, 84],
  [17, 91], [34, 88], [51, 94], [68, 89], [83, 96],
];

const EDGES = [
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],
  [0,7],[1,8],[2,8],[2,9],[3,9],[3,10],[4,10],[4,11],[5,11],[5,12],
  [7,8],[8,9],[9,10],[10,11],[11,12],
  [7,13],[8,14],[9,15],[10,16],[11,17],[12,18],
  [13,14],[14,15],[15,16],[16,17],[17,18],[18,19],
  [13,20],[14,21],[15,22],[16,23],[17,24],
  [20,21],[21,22],[22,23],[23,24],
];

export default function JaslynPattern({ variant = "mesh", intensity = "normal", active = true }) {
  const edges = variant === "constellation" ? EDGES.filter((_, i) => i % 2 === 0) : EDGES;

  return (
    <div
      className={`jaslynPattern jaslynPattern--${variant} jaslynPattern--${intensity} ${active ? "isActive" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="jaslynLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" />
            <stop offset=".5" />
            <stop offset="1" />
          </linearGradient>
          <filter id="jaslynGlow">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g className="jaslynPattern__edges">
          {edges.map(([a, b], i) => (
            <line key={`e-${i}`} x1={POINTS[a][0]} y1={POINTS[a][1]} x2={POINTS[b][0]} y2={POINTS[b][1]} />
          ))}
        </g>
        <g className="jaslynPattern__nodes" filter="url(#jaslynGlow)">
          {POINTS.map(([x, y], i) => <circle key={`n-${i}`} cx={x} cy={y} r={i % 5 === 0 ? 1.15 : .62} />)}
        </g>
        <g className="jaslynPattern__waves">
          <circle cx="50" cy="50" r="12" />
          <circle cx="50" cy="50" r="22" />
          <circle cx="50" cy="50" r="34" />
        </g>
      </svg>
      <span className="jaslynPattern__pulse p1" />
      <span className="jaslynPattern__pulse p2" />
      <span className="jaslynPattern__pulse p3" />
    </div>
  );
}
