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
  /** id → entry. (06-c) `end()` walks `list`, not the map: no iterator garbage per frame. */
  private readonly active = new Map<string, PoolEntry<T>>();
  private readonly list: PoolEntry<T>[] = [];
  private readonly free: T[] = [];
  private frame = 0;

  constructor(private readonly create: () => T) {}

  begin(): void {
    this.frame++;
  }

  get(id: string): T {
    let e = this.active.get(id);
    if (!e) {
      e = { id, obj: this.free.pop() ?? this.create(), frame: this.frame };
      this.active.set(id, e);
      this.list.push(e);
    }
    if (!e.obj.visible) e.obj.setVisible(true);
    e.frame = this.frame;
    return e.obj;
  }

  end(): void {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]!;
      if (e.frame === this.frame) continue;
      e.obj.setVisible(false);
      this.active.delete(e.id);
      this.free.push(e.obj);
      list[i] = list[list.length - 1]!;
      list.pop();
    }
  }

  get activeCount(): number {
    return this.active.size;
  }

  get totalCount(): number {
    return this.active.size + this.free.length;
  }
}

interface PoolEntry<T> {
  readonly id: string;
  readonly obj: T;
  /** Frame it was last drawn in. */
  frame: number;
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
