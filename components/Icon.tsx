export type IconName =
  | 'leaf'
  | 'water'
  | 'moon'
  | 'flame'
  | 'hand'
  | 'book'
  | 'arrow'
  | 'close'
  | 'menu';

const paths: Record<IconName, React.ReactNode> = {
  leaf: (
    <>
      <path d="M4 20c0-8 6-14 16-15 1 11-4 17-13 17-1 0-3-1-3-2Z" />
      <path d="M4 20c3-5 7-8 12-10" />
    </>
  ),
  water: (
    <>
      <path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" />
      <path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  moon: (
    <>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      <path d="M17 4.5h3M18.5 3v3" />
    </>
  ),
  flame: (
    <>
      <path d="M12 21c3.9 0 6.5-2.5 6.5-6 0-4.5-4-6-4.5-10.5C11 6 8 8 8 12c0 1.2.5 2 .5 2S7 13.5 6 15c-.5 1-.5 2.5-.5 2.5C5.5 19.5 8 21 12 21Z" />
      <path d="M12 21c-1.8 0-3-1.2-3-2.8 0-2 2-2.8 2.2-5.2 1.4.8 3.8 2.4 3.8 5.2 0 1.6-1.2 2.8-3 2.8Z" />
    </>
  ),
  hand: (
    <>
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14" />
      <path d="M9 11V9.5a1.5 1.5 0 0 0-3 0v5.5c0 3.3 2.7 6 6 6h1.5a5.5 5.5 0 0 0 5.5-5.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H11v18H5.5A1.5 1.5 0 0 1 4 19.5Z" />
      <path d="M20 4.5A1.5 1.5 0 0 0 18.5 3H13v18h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 8h16M4 16h16" />,
};

export default function Icon({
  name,
  className = 'h-6 w-6',
  strokeWidth = 1.25,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
