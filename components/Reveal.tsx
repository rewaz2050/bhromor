'use client';

import { useEffect, useRef, useState } from 'react';

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Delay in ms before the reveal transition begins. */
  delay?: number;
  /** Render as this element. Defaults to a div. */
  as?: 'div' | 'section' | 'li' | 'article' | 'header' | 'figure' | 'span';
  id?: string;
};

/**
 * Fades and lifts children into view on first intersection.
 * Falls back to immediately-visible content if IntersectionObserver
 * is unavailable, so nothing is ever permanently hidden.
 */
export default function Reveal({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
  id,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      id={id}
      className={`${className} ${shown ? 'reveal-in' : 'reveal-init'}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
