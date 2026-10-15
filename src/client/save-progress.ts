type Channel = 'ground' | 'flight';
export interface SaveTicket { channel: Channel; epoch: number; revision: number }
interface Progress { epoch: number; revision: number; acknowledged: number; sending: Set<SaveTicket> }
export type SavePhase = 'pending' | 'saving' | 'saved';

/** Tracks acknowledgement of a captured batch, never of movement made after it.
 * A recovery retires old tickets; late replies cannot clear a new visit's work. */
export class SaveProgress {
  private channels = new Map<Channel, Progress>();
  private shown: SavePhase = 'saved';
  constructor(private changed: () => void = () => {}) {}
  private channel(name: Channel) {
    let progress = this.channels.get(name);
    if (!progress) { progress = { epoch: 0, revision: 0, acknowledged: 0, sending: new Set() }; this.channels.set(name, progress); }
    return progress;
  }
  get phase(): SavePhase {
    const values = [...this.channels.values()];
    if (values.some(p => p.sending.size)) return 'saving';
    return values.some(p => p.revision > p.acknowledged) ? 'pending' : 'saved';
  }
  private publish() { const phase = this.phase; if (phase !== this.shown) { this.shown = phase; this.changed(); } }
  dirty(name: Channel) { this.channel(name).revision++; this.publish(); }
  begin(name: Channel): SaveTicket {
    const progress = this.channel(name), ticket = { channel: name, epoch: progress.epoch, revision: progress.revision };
    progress.sending.add(ticket); this.publish(); return ticket;
  }
  acknowledge(ticket: SaveTicket) {
    const progress = this.channel(ticket.channel);
    if (progress.epoch !== ticket.epoch || !progress.sending.delete(ticket)) return;
    progress.acknowledged = Math.max(progress.acknowledged, ticket.revision); this.publish();
  }
  reset(name: Channel) {
    const progress = this.channel(name); progress.epoch++; progress.revision = progress.acknowledged = 0;
    progress.sending.clear(); this.publish();
  }
}
