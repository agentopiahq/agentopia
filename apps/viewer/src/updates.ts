import { CORNER_INSET } from './corners';
import { GITHUB_URL } from './credits/credits';
import { FONT } from './kit/iso';
import { SHEET } from './kit/palette';
import { LIT } from './zoom';

/**
 * Noticing that the office was updated under this tab.
 *
 * The CLI updates itself and restarts the server on the new version, which
 * drops the event stream for a moment; the browser reconnects on its own.
 * Each time it does, the tab asks the server who it is (`/api/server`), and a
 * viewer build other than the one the tab loaded with means the server is a
 * new version. A tab nobody is looking at then reloads itself; one in view
 * shows a pill at the bottom of the office, "agentopia 0.4.0 is here", with
 * a key to reload and a link to what changed, and waits for the click (or
 * for the tab to go out of view). Nothing is lost by reloading: every choice
 * the viewer remembers is in this browser, and the floor replays.
 */

export interface ServerHello {
  version: string;
  build: string | null;
}

/** Ask the server who it is; null when it cannot be told. */
export async function fetchHello(url = '/api/server'): Promise<ServerHello | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { version?: unknown; build?: unknown };
    return typeof body.version === 'string'
      ? { version: body.version, build: typeof body.build === 'string' ? body.build : null }
      : null;
  } catch {
    return null;
  }
}

/**
 * Compare the server's build each time the stream opens: the first answer is
 * the tab's own build, and a later different one calls `onUpdate`, once per
 * build. A server that reports no build (an old one) is never taken for new.
 */
export class BuildWatch {
  private own: string | null = null;
  private seen: string | null = null;

  constructor(
    private readonly hello: () => Promise<ServerHello | null>,
    private readonly onUpdate: (hello: ServerHello) => void
  ) {}

  async opened(): Promise<void> {
    const hello = await this.hello();
    if (!hello?.build) {
      return;
    }
    if (this.own === null) {
      this.own = hello.build;
      return;
    }
    if (hello.build !== this.own && hello.build !== this.seen) {
      this.seen = hello.build;
      this.onUpdate(hello);
    }
  }
}

/** Where a version's changes are told: its release on GitHub. */
export function changelogUrl(version: string): string {
  return `${GITHUB_URL}/releases/tag/${encodeURIComponent(`agentopiahq@${version}`)}`;
}

const EXTERNAL_ICON =
  '<svg aria-hidden="true" width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
  'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h4v4M13 3L7 9"/>' +
  '<path d="M11 10v3H3V5h3"/></svg>';

const STYLE = `
.agentopia-update{position:absolute;left:50%;bottom:${CORNER_INSET}px;z-index:3;transform:translateX(-50%);
  display:none;align-items:center;gap:10px;max-width:calc(100vw - ${2 * CORNER_INSET}px);box-sizing:border-box;
  padding:5px 6px 5px 14px;border:1.5px solid ${SHEET.ink};border-radius:999px;background:${SHEET.paper};
  box-shadow:0 2px 0 ${SHEET.ink};color:${SHEET.ink};font:400 15px/1.2 ${FONT.hand};white-space:nowrap;
  user-select:none;animation:agentopia-update-in 160ms ease-out;}
.agentopia-update.shown{display:flex;}
@keyframes agentopia-update-in{from{opacity:0;transform:translate(-50%,4px);}to{opacity:1;transform:translateX(-50%);}}
.agentopia-update-text{overflow:hidden;text-overflow:ellipsis;}
.agentopia-update-text b{font-weight:700;}
.agentopia-update-link{display:inline-flex;align-items:center;gap:3px;color:${SHEET.lead};text-decoration:none;
  border-bottom:1.5px solid transparent;}
.agentopia-update-link:hover,.agentopia-update-link:focus-visible{color:${SHEET.ink};border-bottom-color:${SHEET.ink};outline:none;}
.agentopia-update-link svg{display:block;}
.agentopia-update-reload{box-sizing:border-box;height:26px;padding:0 12px;border:1.5px solid ${LIT};border-radius:999px;
  background:${LIT};color:${SHEET.paper};cursor:pointer;font:700 15px/1 ${FONT.hand};}
.agentopia-update-reload:hover,.agentopia-update-reload:focus-visible{filter:brightness(1.08);outline:none;}
`;

export interface UpdateNotice {
  /** Say `version` is here: reload at once when the tab is out of view, else ask. */
  offer(version: string): void;
}

/** Mount the notice (hidden until an update arrives) over `stage`. */
export function mountUpdateNotice(
  stage: HTMLElement,
  reload: () => void = () => window.location.reload()
): UpdateNotice {
  const style = document.createElement('style');
  style.textContent = STYLE;
  const pill = document.createElement('div');
  pill.className = 'agentopia-update';
  pill.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.className = 'agentopia-update-text';
  const link = document.createElement('a');
  link.className = 'agentopia-update-link';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = "What's new";
  link.insertAdjacentHTML('beforeend', EXTERNAL_ICON);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'agentopia-update-reload';
  button.textContent = 'Reload';
  button.addEventListener('click', () => reload());
  pill.append(text, link, button);
  stage.append(style, pill);

  let waiting = false;
  document.addEventListener('visibilitychange', () => {
    if (waiting && document.hidden) {
      reload();
    }
  });

  return {
    offer: (version) => {
      if (document.hidden) {
        reload();
        return;
      }
      waiting = true;
      text.innerHTML = '';
      const name = document.createElement('b');
      name.textContent = `agentopia ${version}`;
      text.append(name, ' is here');
      link.href = changelogUrl(version);
      pill.classList.add('shown');
    },
  };
}
