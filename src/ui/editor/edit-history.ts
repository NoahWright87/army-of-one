/** Bounded undo and redo for immutable editor documents. */
export class EditHistory<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  record(previous: T): void {
    this.undoStack.push(previous);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current: T): T | undefined {
    const previous = this.undoStack.pop();
    if (previous !== undefined) this.redoStack.push(current);
    return previous;
  }

  redo(current: T): T | undefined {
    const next = this.redoStack.pop();
    if (next !== undefined) this.undoStack.push(current);
    return next;
  }
}
