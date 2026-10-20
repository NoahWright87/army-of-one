/**
 * Simple pooling so we never create/destroy game objects per frame.
 *
 * KeyedPool: one object per entity id, kept while the id is drawn each frame. Usage per frame:
 *   pool.begin(); …pool.get(id)… ; pool.end();   // end() hides and recycles untouched ids
 */
interface Hideable {
  setVisible(v: boolean): unknown;
  visible: boolean;
}

export class KeyedPool<T extends Hideable> {
  private readonly active = new Map<string, T>();
  private readonly free: T[] = [];
  private readonly used = new Set<string>();

  constructor(private readonly create: () => T) {}

  begin(): void {
    this.used.clear();
  }

  get(id: string): T {
    let o = this.active.get(id);
    if (!o) {
      o = this.free.pop() ?? this.create();
      this.active.set(id, o);
    }
    if (!o.visible) o.setVisible(true);
    this.used.add(id);
    return o;
  }

  end(): void {
    for (const [id, o] of this.active) {
      if (this.used.has(id)) continue;
      o.setVisible(false);
      this.active.delete(id);
      this.free.push(o);
    }
  }

  get activeCount(): number {
    return this.active.size;
  }

  get totalCount(): number {
    return this.active.size + this.free.length;
  }
}

/** Unkeyed pool for short-lived effects. */
export class FreeList<T extends Hideable> {
  private readonly free: T[] = [];
  constructor(private readonly create: () => T) {}
  take(): T {
    const o = this.free.pop() ?? this.create();
    o.setVisible(true);
    return o;
  }
  give(o: T): void {
    o.setVisible(false);
    this.free.push(o);
  }
}
