const PATHS: Record<string, string> = {
  play: 'M7 4.5v15l12-7.5z',
  stop: 'M6 6h12v12H6z',
  pause: 'M8 5v14M16 5v14',
  step: 'M5 5v14l10-7zM19 5v14',
  memory: 'M4 7h16v10H4zM8 7v10M12 7v10M16 7v10M7 4v3M12 4v3M17 4v3M7 17v3M12 17v3M17 17v3',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  undo: 'M9 8H4V3M4.5 8A8 8 0 1 1 4 14',
  redo: 'M15 8h5V3M19.5 8A8 8 0 1 0 20 14',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  open: 'M3 7h6l2 2h10v10H3z',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  up: 'M12 19V6M6 11l6-6 6 6',
  down: 'M12 5v13M6 13l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  warn: 'M12 4l9 16H3zM12 10v5M12 17.5v.5',
  close: 'M6 6l12 12M18 6L6 18',
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Logotipo: dois montantes e três degraus. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="4" y="3" width="3" height="22" rx="1" fill="currentColor" />
      <rect x="21" y="3" width="3" height="22" rx="1" fill="currentColor" />
      <rect x="7" y="7.5" width="14" height="3" fill="#2ee283" />
      <rect x="7" y="12.5" width="14" height="3" fill="currentColor" opacity="0.55" />
      <rect x="7" y="17.5" width="14" height="3" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
