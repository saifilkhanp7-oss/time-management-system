import { useApp } from '../AppContext.jsx';
import { SunIcon, MoonIcon } from './Icons.jsx';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useApp();
  return (
    <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle light / dark mode">
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
