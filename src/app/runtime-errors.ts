import { campaignFrame } from './campaign-frame';
import { str } from '../content/strings';

let failed = false;
let phase = 'boot';
let context: () => unknown = () => ({});
const stopHandlers = new Set<() => void>();
let loading: HTMLElement | null = null;
let loadingOwner = '';

/** Installed by the small entry module, before importing Phaser or generating a level. */
export function installErrorHandling(): void {
  window.addEventListener('error', (event) => {
    if (event instanceof ErrorEvent) reportFatalError(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => reportFatalError(event.reason));
  window.addEventListener('vite:preloadError', (event) => {
    reportFatalError((event as Event & { payload: unknown }).payload);
  });
}

export function runtimeContext(read: () => unknown, stop: () => void): void {
  context = read;
  stopHandlers.add(stop);
  if (failed) stop();
}

export function runtimePhase(next: string): void {
  phase = next;
}

export function showLoading(text: string | null, owner = 'boot'): void {
  if (failed) return;
  if (text === null) {
    if (loadingOwner !== owner) return;
    loading?.remove();
    loading = null;
    return;
  }
  loadingOwner = owner;
  if (!loading) {
    loading = document.createElement('div');
    loading.setAttribute('role', 'status');
    loading.style.cssText =
      'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#111418;color:#eee;font:18px system-ui;text-align:center;padding:24px;pointer-events:none';
    document.body.append(loading);
  }
  loading.textContent = text;
}

/** An inactivity deadline also covers image/audio decode callbacks that never arrive.
 * Background tabs get a fresh deadline when visible; mobile app switching isn't a failure. */
export function watchForStall(
  label: string,
  timeoutMs = 60_000,
  fail: (error: Error) => void = reportFatalError,
): {
  progress(): void;
  stop(): void;
} {
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const progress = () => {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(() => {
      if (document.hidden) progress();
      else {
        stopped = true;
        document.removeEventListener('visibilitychange', visible);
        fail(new Error(`Timed out waiting for ${label}`));
      }
    }, timeoutMs);
  };
  const visible = () => {
    if (!document.hidden) progress();
  };
  document.addEventListener('visibilitychange', visible);
  progress();
  return {
    progress,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    },
  };
}

/** A DOM recovery screen survives renderer failures. Never delete saves to recover graphics. */
export function reportFatalError(error: unknown): void {
  if (failed) return;
  failed = true;
  console.error('[Army of One]', phase, error);
  let extra = 'unavailable';
  try {
    extra = JSON.stringify(context()) ?? extra;
  } catch {
    // Diagnostics must not prevent the recovery screen from opening.
  }
  for (const stop of stopHandlers) {
    try {
      stop();
    } catch {
      // A partially constructed renderer may itself fail during cleanup.
    }
  }
  loading?.remove();
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const details = [
    error instanceof Error ? `${error.name}: ${error.message}` : message.slice(0, 500),
    `Phase: ${phase}`,
    `Page: ${location.origin}${location.pathname}${location.search}`,
    `Build: ${import.meta.url}`,
    `Browser: ${navigator.userAgent}`,
    `Display: ${innerWidth}x${innerHeight}, DPR ${devicePixelRatio}`,
    `Context: ${extra}`,
    message.slice(0, 8_000),
  ].join('\n');
  const root = document.createElement('section');
  root.id = 'aoo-fatal-error';
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'aoo-fatal-title');
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;overflow:auto;box-sizing:border-box;padding:32px 20px;background:#111418;color:#eee;font:16px/1.5 system-ui;touch-action:auto';
  const card = document.createElement('div');
  card.style.cssText = 'max-width:640px;margin:0 auto';
  const title = document.createElement('h1');
  title.id = 'aoo-fatal-title';
  title.textContent = str('error.title');
  title.style.fontSize = '24px';
  const description = document.createElement('p');
  description.textContent = str('error.description');
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin:24px 0';
  const button = (text: string, run: () => void) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText =
      'font:inherit;padding:12px 16px;border:1px solid #aaa;border-radius:6px;background:#28333b;color:white;touch-action:manipulation;cursor:pointer';
    b.onclick = run;
    actions.append(b);
    return b;
  };
  const reload = button(str('error.reload'), () => location.reload());
  const campaign = new URLSearchParams(location.search).get('from') === 'campaign';
  button(str(campaign ? 'error.campaign' : 'error.menu'), () => {
    const url = new URL(location.href);
    url.search = campaign ? '?scene=campaign' : '?mission=mission-03';
    url.hash = '';
    const frame = campaignFrame();
    if (campaign && frame) frame.returnToMap(null);
    else location.assign(url.href);
  });
  const label = document.createElement('label');
  label.textContent = str('error.details');
  const report = document.createElement('textarea');
  report.readOnly = true;
  report.value = details;
  report.setAttribute('aria-label', str('error.details'));
  report.style.cssText =
    'display:block;box-sizing:border-box;width:100%;height:200px;margin-top:8px;background:#080a0c;color:#ddd;border:1px solid #68747d;font:12px/1.5 monospace';
  label.append(report);
  const copy = button(str('error.copy'), () => {
    void navigator.clipboard?.writeText(details).then(
      () => (copy.textContent = str('error.copied')),
      () => {
        report.focus();
        report.select();
      },
    );
    if (!navigator.clipboard) {
      report.focus();
      report.select();
    }
  });
  card.append(title, description, actions, label);
  root.append(card);
  document.body.append(root);
  campaignFrame()?.failed();
  reload.focus();
}
