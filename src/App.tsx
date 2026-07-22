import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { TabBar, type Tab } from './components/TabBar';
import { Toast } from './components/Toast';
import { Today } from './screens/Today';
import { Lift } from './screens/Lift';
import { Progress } from './screens/Progress';
import { History } from './screens/History';
import { Summary } from './screens/Summary';
import { Run } from './screens/Run';
import { RunSummary } from './screens/RunSummary';

export type Screen = Tab | 'summary' | 'run' | 'runsummary';
export interface View {
  screen: Screen;
  /** Workout id for 'summary', run id for 'runsummary'. */
  summaryId?: number;
}
export type Go = (screen: Screen, summaryId?: number) => void;

export default function App() {
  const [view, setView] = useState<View>({ screen: 'today' });

  // resolve theme (settings → <html data-theme>); both themes are OLED black,
  // so the status-bar color never changes
  const settings = useLiveQuery(() => db.settings.get(1));
  const theme = settings?.theme ?? 'ember';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const go = useCallback<Go>((screen, summaryId) => {
    setView({ screen, summaryId });
  }, []);

  const activeTab: Tab =
    view.screen === 'summary' || view.screen === 'runsummary' ? 'history'
    : view.screen === 'run' ? 'today'
    : view.screen;

  return (
    <div className="app">
      <Toast />
      <div className="screens">
        {view.screen === 'today' && <Today go={go} />}
        {view.screen === 'lift' && <Lift go={go} />}
        {view.screen === 'progress' && <Progress go={go} />}
        {view.screen === 'history' && <History go={go} />}
        {view.screen === 'run' && <Run go={go} />}
        {view.screen === 'summary' && view.summaryId != null && (
          <Summary go={go} workoutId={view.summaryId} />
        )}
        {view.screen === 'runsummary' && view.summaryId != null && (
          <RunSummary go={go} runId={view.summaryId} />
        )}
      </div>
      <TabBar active={activeTab} onSelect={(t) => go(t)} />
    </div>
  );
}
