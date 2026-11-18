const PATHS = {
  files: "M4 3h9l5 5v13H4zM13 3v5h5M8 13h8M8 17h8",
  outline: "M4 6h16M8 12h12M12 18h8",
  book: "M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z",
  check: "M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
  alert: "M12 3l10 18H2zM12 10v4M12 17.5v.5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 12h-1M21 12h-1M12 4V3M12 21v-1M6.3 6.3l-.7-.7M18.4 18.4l-.7-.7M6.3 17.7l-.7.7M18.4 5.6l-.7.7",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  play: "M6 4l14 8-14 8z",
  stop: "M6 6h12v12H6z",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff: "M3 3l18 18M10 6a10 10 0 0 1 12 6 12 12 0 0 1-3 3.5M6.5 6.5A12 12 0 0 0 2 12s4 7 10 7a9 9 0 0 0 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  folder: "M3 6h6l2 2h10v11H3z",
  folderOpen: "M3 7h6l2 2h10v2H6l-3 8z M3 7v12",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  image: "M4 5h16v14H4zM8 10a1.5 1.5 0 1 0 0 .01M4 17l5-5 4 4 3-3 4 4",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  download: "M12 4v12M6 11l6 6 6-6M4 20h16",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  sync: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M17 4v3h-3M7 20v-3h3",
  bold: "M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z",
  italic: "M10 4h8M6 20h8M14 4l-4 16",
  heading: "M5 4v16M19 4v16M5 12h14",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.5M4 12h.5M4 18h.5",
  listOl: "M10 6h10M10 12h10M10 18h10M4 4h1v4M4 8h2M4 12h2l-2 3h2M4 17h2v3H4z",
  quote: "M7 7h4v4H7zM7 11c0 3 1 4 4 5M14 7h4v4h-4zM14 11c0 3 1 4 4 5",
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4M14 4l-4 16",
  table: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14",
  figure: "M4 4h16v16H4zM4 15l4-4 4 4 3-3 5 5",
  cite: "M6 5h12v14H6zM9 9h6M9 12h6M9 15h4",
  ref: "M10 14a3 3 0 0 0 4 0l3-3a3 3 0 0 0-4-4l-1 1M14 10a3 3 0 0 0-4 0l-3 3a3 3 0 0 0 4 4l1-1",
  math: "M4 6h6l4 12 6-14M5 18h4",
  footnote: "M6 4h8M10 4v16M17 6h3M18.5 4.5v3",
  todo: "M5 12l4 4L19 6",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  filter: "M4 5h16l-6 7v6l-4 2v-8z",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  edit: "M4 20h4l11-11-4-4L4 16zM13 7l4 4",
  copy: "M8 8h12v12H8zM4 16V4h12",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8v.5",
  link: "M9 15l6-6M8 12l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11v2",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M5 12l7 7 7-7",
  arrowLeft: "M19 12H5M12 5l-7 7 7 7",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  layout: "M3 4h18v16H3zM9 4v16M15 4v16",
  pdf: "M6 3h8l4 4v14H6zM14 3v4h4M9 17v-6h2a1.5 1.5 0 0 1 0 3H9",
  leaf: "M20 4C11 4 4 11 4 19c0 .6.4 1 1 1 8 0 15-7 15-15 0-.6-.4-1-1-1zM7 17c4-3 7-7 9-11",
  mount: "M4 6h6l2 2h8v11H4zM12 12v5M9.5 14.5L12 12l2.5 2.5",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  spell: "M4 16l4-11 4 11M5.5 12h5M14 6h4a2 2 0 0 1 0 4h-4zM14 10h5a2 2 0 0 1 0 4h-5zM4 20l4 0",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  flag: "M5 21V4h12l-2 4 2 4H5",
  git: "M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM18 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 8v8M18 12c0 3-3 4-6 4H8",
  markdown: "M3 6h18v12H3zM6 15V9l3 3 3-3v6M17 9v6M15 13l2 2 2-2",
  columns: "M3 4h18v16H3zM12 4v16",
  wand: "M15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM4 20l9-9M6 4l.5 1L8 6l-1.5.5L6 8l-.5-1.5L4 6l1.5-.5z",
  warning: "M12 3l10 18H2zM12 10v4M12 17.5v.5",
  error: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6",
  hint: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.5 1 2.5h6c0-1 .3-1.9 1-2.5A6 6 0 0 0 12 3z",
  pin: "M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v6",
  menu: "M4 7h16M4 12h16M4 17h16",
};

export default function Icon({ name, size = 16, stroke = 1.8, className = "", style }) {
  const d = PATHS[name] || PATHS.file;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={d} />
    </svg>
  );
}

export function Leaf({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="var(--brand)" d="M39 8C24 8 10 20 10 34c0 6 4 10 10 10 14 0 26-14 26-29 0-3-2-7-7-7z" />
      <path d="M18 36c8-6 14-14 18-24" stroke="var(--brand-contrast)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
