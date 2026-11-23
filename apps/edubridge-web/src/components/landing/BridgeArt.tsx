/** Quiet line drawing of a suspension bridge — students on one bank, sponsors on the other. */
export function BridgeArt({ className }: { className?: string }) {
  const deckY = 238;
  const p0 = { x: 56, y: deckY };
  const p1 = { x: 240, y: 30 };
  const p2 = { x: 424, y: deckY };
  const at = (t: number) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y,
  });
  const hangers = Array.from({ length: 11 }, (_, i) => at((i + 1) / 12));

  return (
    <svg viewBox="0 0 480 340" className={className} role="img" aria-label="Line drawing of a bridge connecting two banks">
      {/* water */}
      {[268, 286, 304].map((y, i) => (
        <path
          key={y}
          d={`M${90 + i * 18} ${y}h${300 - i * 36}`}
          stroke="var(--border-strong)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={i === 1 ? '2 10' : '28 14'}
          fill="none"
        />
      ))}
      {/* banks */}
      <path d={`M8 ${deckY + 1}h60l14 40H8z`} fill="var(--surface-sunken)" stroke="var(--border-strong)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d={`M472 ${deckY + 1}h-60l-14 40h74z`} fill="var(--surface-sunken)" stroke="var(--border-strong)" strokeWidth="1.5" strokeLinejoin="round" />
      {/* hangers */}
      {hangers.map((h) => (
        <line key={h.x} x1={h.x} y1={h.y} x2={h.x} y2={deckY} stroke="var(--border-strong)" strokeWidth="1.5" />
      ))}
      {/* arch */}
      <path d={`M${p0.x} ${p0.y}Q${p1.x} ${p1.y} ${p2.x} ${p2.y}`} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
      {/* deck */}
      <path d={`M40 ${deckY}H440`} stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round" />
      {/* anchors */}
      <circle cx={p0.x} cy={deckY} r="5" fill="var(--background)" stroke="var(--primary)" strokeWidth="2" />
      <circle cx={p2.x} cy={deckY} r="5" fill="var(--background)" stroke="var(--primary)" strokeWidth="2" />
      <text x="45" y={deckY + 66} textAnchor="middle" fontFamily="var(--font-serif)" fontSize="15" fontStyle="italic" fill="var(--muted-foreground)">
        students
      </text>
      <text x="435" y={deckY + 66} textAnchor="middle" fontFamily="var(--font-serif)" fontSize="15" fontStyle="italic" fill="var(--muted-foreground)">
        sponsors
      </text>
    </svg>
  );
}
