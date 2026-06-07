import { useState, useEffect, useRef } from "react";

// Smart sticky-header behaviour shared by the landing site, the client
// portal and the admin dashboard. Tracks window scroll and returns:
//   hidden   — true while scrolling DOWN past the page top (hide the bar);
//              flips back to false the moment the user scrolls UP.
//   scrolled — true once the page has moved at all (for an elevation shadow).
// Passive listener; only re-renders when one of the two booleans actually
// flips, so it's effectively free even on fast scrolls.
export function useSmartHeader({ threshold = 6, revealAtTop = 72 } = {}) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(0);
  const hiddenRef = useRef(false);
  const scrolledRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    last.current = window.scrollY || 0;
    const onScroll = () => {
      const y = window.scrollY || 0;
      const dy = y - last.current;

      const nextScrolled = y > 4;
      if (nextScrolled !== scrolledRef.current) {
        scrolledRef.current = nextScrolled;
        setScrolled(nextScrolled);
      }

      let nextHidden = hiddenRef.current;
      if (y < revealAtTop) nextHidden = false;
      else if (Math.abs(dy) > threshold) nextHidden = dy > 0;
      if (nextHidden !== hiddenRef.current) {
        hiddenRef.current = nextHidden;
        setHidden(nextHidden);
      }

      last.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold, revealAtTop]);

  return { hidden, scrolled };
}
