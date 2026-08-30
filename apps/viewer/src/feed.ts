import { SequencedEvent } from '@agentopia/core';

export interface FeedHandlers {
  onCatchup(event: SequencedEvent): void;
  onLive(event: SequencedEvent): void;
  onStatus(text: string): void;
}

/** Subscribe to the office server's SSE stream. Reconnects are the browser's. */
export function connectFeed(session: string | null, handlers: FeedHandlers): EventSource {
  const url = session ? `/events?session=${encodeURIComponent(session)}` : '/events';
  const source = new EventSource(url);

  source.onopen = () => handlers.onStatus('live');
  source.onerror = () => handlers.onStatus('reconnecting…');
  source.onmessage = (message) => {
    const payload = JSON.parse(message.data) as SequencedEvent & { live: boolean };
    if (payload.live) {
      handlers.onLive(payload);
    } else {
      handlers.onCatchup(payload);
    }
  };

  return source;
}
