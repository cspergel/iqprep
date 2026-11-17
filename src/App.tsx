import { navigate, useRoute } from './app/router';
import { StoreProvider, useStore } from './app/store';
import { Done } from './screens/Done';
import { GameHub } from './screens/GameHub';
import { Grownups } from './screens/Grownups';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Patches } from './screens/Patches';
import { Runner } from './screens/Runner';
import { TestCenter } from './screens/TestCenter';
import { Welcome } from './screens/Welcome';
import { Zone } from './screens/Zone';
import { TopBar } from './ui/TopBar';

function Routes() {
  const route = useRoute();
  const { profile } = useStore();
  const [head, a, b] = route;

  if (!profile && head !== 'welcome') return <Welcome />;
  switch (head) {
    case undefined:
      return <Home />;
    case 'welcome':
      return <Welcome adding={!!profile} />;
    case 'zone':
      return <Zone zone={a} />;
    case 'game':
      return <GameHub subtest={a} />;
    case 'play':
      return <Runner />;
    case 'done':
      return <Done sessionId={a} />;
    case 'tests':
      return <TestCenter />;
    case 'grownups':
      return <Grownups tab={a} param={b} />;
    case 'learn':
      return <Learn subtest={a} />;
    case 'patches':
      return <Patches />;
    default:
      navigate('/');
      return null;
  }
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const route = useRoute();
  const playing = route[0] === 'play';
  return (
    <>
      {!playing && <TopBar />}
      <main>
        <Routes />
      </main>
      {!playing && (
        <footer className="page small muted center" style={{ paddingBottom: 30 }}>
          Brain Camp is an independent practice tool. Not affiliated with or endorsed by Pearson or the Wechsler tests.
          WISC® is a trademark of NCS Pearson, Inc. All practice items are original — not actual test questions.
          Practice results are estimates, not IQ scores. Everything is saved only on this device.
        </footer>
      )}
    </>
  );
}
