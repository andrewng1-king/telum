import type { JSX } from 'react';

export type Tab = 'today' | 'lift' | 'progress' | 'history';

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: 'today', label: 'Today',
    icon: <path d="M3 9l8-6 8 6v9a1 1 0 01-1 1h-4v-6H8v6H4a1 1 0 01-1-1V9z" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinejoin="round" />,
  },
  {
    id: 'lift', label: 'Lift',
    icon: <path d="M5 8v6M3 9v4M17 8v6M19 9v4M6.5 11h9" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />,
  },
  {
    id: 'progress', label: 'Progress',
    icon: (
      <>
        <path d="M3 16l5-5 3 3 7-8" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 6h4v4" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: 'history', label: 'History',
    icon: (
      <>
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.7" fill="none" />
        <path d="M11 6.5V11l3 2" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
];

export function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab${active === t.id ? ' is-active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          <svg width="22" height="22" viewBox="0 0 22 22">{t.icon}</svg>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
