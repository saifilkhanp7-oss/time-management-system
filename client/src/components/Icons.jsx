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
