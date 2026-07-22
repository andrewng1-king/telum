import { db } from './db';

interface BackupFile {
  app: 'telum';
  version: 1 | 2 | 3;
  exportedAt: string;
  workouts: unknown[];
  sets: unknown[];
  settings: unknown[];
  programs: unknown[];
  /** Added in version 2 — absent in v1 backups. */
  bodylog?: unknown[];
  /** Added in version 3 — absent in older backups. */
  runs?: unknown[];
}

/** @returns false when the user closed the share sheet without saving. */
export async function exportBackup(): Promise<boolean> {
  const payload: BackupFile = {
    app: 'telum',
    version: 3,
    exportedAt: new Date().toISOString(),
    workouts: await db.workouts.toArray(),
    sets: await db.sets.toArray(),
    settings: await db.settings.toArray(),
    programs: await db.programs.toArray(),
    bodylog: await db.bodylog.toArray(),
    runs: await db.runs.toArray(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const file = new File([blob], `telum-backup-${stamp}.json`, { type: 'application/json' });
  // share sheet on iOS = one tap into Files/iCloud; anchor download elsewhere
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false; // user closed the sheet — not backed up
      throw err;
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
  await db.settings.update(1, { lastBackupAt: Date.now() });
  return true;
}

/** Replaces all data. Caller must confirm with the user first. v1 backups import fine (no bodylog). */
export async function importBackup(file: File): Promise<void> {
  const data = JSON.parse(await file.text()) as BackupFile;
  if (data.app !== 'telum' || !Array.isArray(data.workouts) || !Array.isArray(data.sets)) {
    throw new Error('Not a Telum backup file');
  }
  await db.transaction('rw', [db.workouts, db.sets, db.settings, db.programs, db.bodylog, db.runs], async () => {
    await Promise.all([db.workouts.clear(), db.sets.clear(), db.settings.clear(), db.programs.clear(), db.bodylog.clear(), db.runs.clear()]);
    await db.workouts.bulkAdd(data.workouts as never[]);
    await db.sets.bulkAdd(data.sets as never[]);
    await db.settings.bulkAdd(data.settings as never[]);
    await db.programs.bulkAdd(data.programs as never[]);
    if (Array.isArray(data.bodylog)) await db.bodylog.bulkAdd(data.bodylog as never[]);
    if (Array.isArray(data.runs)) await db.runs.bulkAdd(data.runs as never[]);
  });
}

export async function isStoragePersisted(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) ?? false; } catch { return false; }
}
