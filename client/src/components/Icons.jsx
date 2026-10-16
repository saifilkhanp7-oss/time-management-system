const S = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const SunIcon = () => (
  <svg {...S}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const MoonIcon = () => (
  <svg {...S}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);
export const TrashIcon = () => (
  <svg {...S} width={16} height={16}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
);
export const EditIcon = () => (
  <svg {...S} width={16} height={16}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);
export const PinIcon = ({ filled }) => (
  <svg {...S} width={16} height={16} fill={filled ? 'currentColor' : 'none'}><path d="M12 17v5M5 17h14l-2-4V5h1V3H6v2h1v8z" /></svg>
);
export const SearchIcon = () => (
  <svg {...S} width={18} height={18}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const LogoMark = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="44" fill="var(--accent)" />
    <path d="M50 22v30l18 12" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" />
  </svg>
);

const TAB_PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  tracker: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></>,
  planner: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="m8.5 12.5 2.5 2.5 4.5-5M9 2v4M15 2v4" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  reminders: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  analyst: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" /><circle cx="12" cy="12" r="3" /></>,
};
export const TabIcon = ({ name }) => <svg {...S} width={22} height={22}>{TAB_PATHS[name]}</svg>;
