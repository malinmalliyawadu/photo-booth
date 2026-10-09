/**
 * The room every screen sits in: the grain and the lamp, and the two
 * frames the booth draws, an invitation's hairline and a viewfinder's
 * film corners. Pure decoration, hidden from assistive tech.
 */

export function Grain() {
  return <div className="grain" aria-hidden />;
}

export function Spotlight() {
  return <div className="spotlight" aria-hidden />;
}

/** Four film-frame brackets at the corners of the nearest positioned parent. */
export function Corners({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute ${className}`} aria-hidden>
      <span className="corner corner-tl" />
      <span className="corner corner-tr" />
      <span className="corner corner-bl" />
      <span className="corner corner-br" />
    </div>
  );
}

/** A hairline frame inset from the screen's edge, like the border of an invitation. */
export function Frame({ inset = "inset-6" }: { inset?: string }) {
  return (
    <div className={`pointer-events-none absolute ${inset} rounded-sm ring-1 ring-gold/35`} aria-hidden>
      <Corners className="-inset-px" />
    </div>
  );
}

/** A gold rule with a small diamond at its centre: the breath between a title and its line. */
export function Rule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-hidden>
      <span className="hairline flex-1" />
      <svg viewBox="0 0 10 10" className="h-2 w-2 text-gold" fill="currentColor">
        <path d="M5 0 10 5 5 10 0 5Z" />
      </svg>
      <span className="hairline flex-1" />
    </div>
  );
}

/** The brass aperture from the icon, as an inline mark. */
export function Aperture({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="none" stroke="currentColor" strokeWidth="22" strokeLinecap="round" aria-hidden>
      <circle cx="256" cy="256" r="136" />
      <line x1="286" y1="204" x2="360.7" y2="333.2" />
      <line x1="226" y1="204" x2="375.2" y2="204" />
      <line x1="196" y1="256" x2="270.6" y2="126.8" />
      <line x1="226" y1="308" x2="151.4" y2="178.8" />
      <line x1="286" y1="308" x2="136.8" y2="308" />
      <line x1="316" y1="256" x2="241.4" y2="385.2" />
    </svg>
  );
}
