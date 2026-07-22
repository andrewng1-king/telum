import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { exportBackup, importBackup, isStoragePersisted } from '../db/backup';
import { agoLabel, fmtW } from '../lib/format';
import { toastBus } from '../lib/ui';
import { Sheet } from '../components/Sheet';
import type { ThemeMode } from '../types';

const THEMES: { id: ThemeMode; cap: string }[] = [
  { id: 'ember', cap: 'Ember' },
  { id: 'teal', cap: 'Teal' },
];

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const settings = useLiveQuery(() => db.settings.get(1));
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isStoragePersisted().then(setPersisted);
  }, []);

  if (!settings) return null;

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="srow">
        <div><div className="k">Your name</div><div className="sub">For the greeting</div></div>
        <input
          className="tin"
          defaultValue={settings.name}
          maxLength={20}
          onBlur={(e) => db.settings.update(1, { name: e.target.value.trim() })}
        />
      </div>
      <div className="srow">
        <div><div className="k">Gym name</div><div className="sub">Shown on share cards</div></div>
        <input
          className="tin"
          defaultValue={settings.gymName}
          maxLength={28}
          placeholder="Optional"
          onBlur={(e) => db.settings.update(1, { gymName: e.target.value.trim() })}
        />
      </div>
      <div className="srow">
        <div><div className="k">Weekly target</div><div className="sub">Sessions per week</div></div>
        <div className="stepbtns">
          <button onClick={() => db.settings.update(1, { weeklyTarget: Math.max(1, settings.weeklyTarget - 1) })}>−</button>
          <span className="val num">{settings.weeklyTarget}</span>
          <button onClick={() => db.settings.update(1, { weeklyTarget: Math.min(7, settings.weeklyTarget + 1) })}>+</button>
        </div>
      </div>
      <div className="srow">
        <div><div className="k">Bar weight</div><div className="sub">For plate math</div></div>
        <div className="stepbtns">
          <button onClick={() => db.settings.update(1, { barKg: Math.max(10, settings.barKg - 5) })}>−</button>
          <span className="val num">{fmtW(settings.barKg)}</span>
          <button onClick={() => db.settings.update(1, { barKg: Math.min(30, settings.barKg + 5) })}>+</button>
        </div>
      </div>
      <div className="srow" style={{ borderBottom: 'none', paddingBottom: 8 }}>
        <div>
          <div className="k">Theme</div>
          <div className="sub">Both OLED black — share cards stay ember, that’s the brand</div>
        </div>
      </div>
      <div className="segbtns">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={(settings.theme ?? 'ember') === t.id ? 'sel' : ''}
            onClick={() => db.settings.update(1, { theme: t.id })}
          >
            {t.cap}
          </button>
        ))}
      </div>

      <div className="srow" style={{ borderBottom: 'none' }}>
        <div>
          <div className="k">Storage</div>
          <div className="sub">
            {persisted === null ? 'Checking…' : persisted ? 'Persistent — iOS won’t evict your logs' : 'Not persistent yet — keep backups'}
          </div>
        </div>
        <span className="pill" style={persisted ? { color: 'var(--ember-hi)' } : undefined}>{persisted ? 'Safe' : 'Best effort'}</span>
      </div>

      <div style={{ height: 16 }} />
      <span className="eyebrow" style={{ display: 'block', margin: '0 2px 8px' }}>
        Last backup · {settings.lastBackupAt ? agoLabel(settings.lastBackupAt) : 'never'}
      </span>
      <button className="btn ghost" onClick={async () => { if (await exportBackup()) toastBus.show('✓ Backup exported'); }}>
        Export data · JSON
      </button>
      <div style={{ height: 10 }} />
      <button
        className={confirmImport ? 'btn danger' : 'btn ghost'}
        onClick={() => {
          if (!confirmImport) { setConfirmImport(true); return; }
          fileRef.current?.click();
        }}
      >
        {confirmImport ? 'Tap again — replaces ALL current data' : 'Import backup'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          setConfirmImport(false);
          if (!f) return;
          try {
            await importBackup(f);
            toastBus.show('✓ Backup restored');
            onClose();
          } catch {
            toastBus.show('Import failed — not a Telum backup');
          }
        }}
      />
    </Sheet>
  );
}
