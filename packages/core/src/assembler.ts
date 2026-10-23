export interface SpokenPiece {
  /** Bee's utterance id; the same utterance can be delivered twice. */
  id?: number | string;
  text: string;
  /** When it was spoken (epoch ms). Arrival order is not speaking order. */
  spokenAt: number;
}

/**
 * Collects the utterances of one spoken note. Bee's speech-to-text delivers sentences
 * out of order, can split a time ("at 5." then "30."), and can repeat an utterance, so
 * pieces are de-duplicated, ordered by when they were spoken, and expire after a window.
 */
export class NoteAssembler {
  private pieces: SpokenPiece[] = [];
  private seen = new Set<string>();

  constructor(private windowMs = 45_000) {}

  add(p: SpokenPiece): void {
    const key = p.id !== undefined ? String(p.id) : `${p.spokenAt}|${p.text}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.pieces.push(p);
    const newest = Math.max(...this.pieces.map((x) => x.spokenAt));
    this.pieces = this.pieces.filter((x) => newest - x.spokenAt <= this.windowMs);
    if (this.seen.size > 500) this.seen = new Set(this.pieces.map((x) => (x.id !== undefined ? String(x.id) : `${x.spokenAt}|${x.text}`)));
  }

  /** The note so far, in the order it was spoken. */
  text(): string {
    return [...this.pieces]
      .sort((a, b) => a.spokenAt - b.spokenAt)
      .map((x) => x.text)
      .join(" ");
  }

  size(): number {
    return this.pieces.length;
  }

  clear(): void {
    this.pieces = [];
  }
}
