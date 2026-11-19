import { SequencedEvent } from '@agentopia/core';

export interface FeedHandlers {
  onCatchup(event: SequencedEvent): void;
  onLive(event: SequencedEvent): void;
  onStatus(text: string): void;
  /** The stream is open: first, and again after each reconnect. */
  onOpen?(): void;
}

/**
 * Subscribe to the office server's SSE stream. With a session, one bus; with
 * none, the floor — every live bus on one stream, each event tagged with its
 * bus. Reconnects are the browser's.
 */
export function connectFeed(session: string | null, handlers: FeedHandlers): EventSource {
  const url = session ? `/events?session=${encodeURIComponent(session)}` : '/events';
  const source = new EventSource(url);

  source.onopen = () => {
    handlers.onStatus('live');
    handlers.onOpen?.();
  };
  source.onerror = () => handlers.onStatus('reconnecting…');
  source.onmessage = (message) => {
    const { live, ...sequenced } = JSON.parse(message.data) as SequencedEvent & { live: boolean };
    if (live) {
      handlers.onLive(sequenced);
    } else {
      handlers.onCatchup(sequenced);
    }
  };

  return source;
}
