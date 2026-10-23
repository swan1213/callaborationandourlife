// Line icons (24×24, stroke = currentColor) used across the Live view.
const PATHS = {
  logo: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5zM8.5 9h7M8.5 12h4.5',
  play: 'M8 5.5v13l10.5-6.5z',
  stop: 'M7 7h10v10H7z',
  sparkles:
    'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  captions:
    'M3.5 6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5zM10.5 10a2 2 0 1 0 0 4M17 10a2 2 0 1 0 0 4',
  send: 'M4 12l16-8-6 16-2.5-6.5z',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  eraser: 'M8 20h12M5.5 14.5l8.5-8.5 5 5-6.5 6.5H9z',
  answer: 'M5 12h11M12 6l6 6-6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.5 12h2M19.5 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4',
  folder: 'M3.5 7A2 2 0 0 1 5.5 5H10l2 2.5h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  message: 'M5 5h14v10H9l-4 4z',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4M12 8v4.5l3 1.5',
  code: 'M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  copy: 'M9 9h10v11H9zM5 15V4h10',
};

export default function Icon({ name, className = 'icon' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
