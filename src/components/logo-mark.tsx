/** PROSANTI brand lockup — the arch/crescent emblem + wordmark. */
export default function LogoMark({
  className = "h-9 w-9",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="15" fill="#1b3a2d" />
      <path
        d="M13.5 52 V36 a17.5 17.5 0 0 1 37 0 V52"
        fill="none"
        stroke="#f6f1e6"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M32 25.6 c0.8 3.4 3.6 6.2 7.4 7.6 c-3.8 1.4 -6.6 4.2 -7.4 7.6 c-0.8 -3.4 -3.6 -6.2 -7.4 -7.6 c3.8 -1.4 6.6 -4.2 7.4 -7.6 Z"
        fill="#c2a065"
      />
      <circle cx="32" cy="41.2" r="7.4" fill="#f6f1e6" />
      <circle cx="36.6" cy="38.6" r="8.2" fill="#1b3a2d" />
    </svg>
  );
}
