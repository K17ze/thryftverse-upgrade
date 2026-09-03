import type { CreatorDocument } from './composition';

export interface HistoryEntry {
  document: CreatorDocument;
  label: string;
  timestamp: number;
}

const MAX_HISTORY = 50;
// Rapid same-label pushes within this window coalesce into a single undo step.
const COALESCE_WINDOW_MS = 600;

export class HistoryStack {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(initialDoc: CreatorDocument) {
    this.undoStack = [{ document: initialDoc, label: 'Initial state', timestamp: Date.now() }];
  }

  push(doc: CreatorDocument, label: string): void {
    const now = Date.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (top.label === label && now - top.timestamp < COALESCE_WINDOW_MS) {
      top.document = doc;
      top.timestamp = now;
    } else {
      this.undoStack.push({ document: doc, label, timestamp: now });
      if (this.undoStack.length > MAX_HISTORY) {
        this.undoStack.shift();
      }
    }
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): CreatorDocument | null {
    if (this.undoStack.length <= 1) return null;
    const entry = this.undoStack.pop()!;
    this.redoStack.push(entry);
    return this.undoStack[this.undoStack.length - 1].document;
  }

  redo(): CreatorDocument | null {
    if (this.redoStack.length === 0) return null;
    const entry = this.redoStack.pop()!;
    this.undoStack.push(entry);
    return entry.document;
  }

  current(): CreatorDocument {
    return this.undoStack[this.undoStack.length - 1].document;
  }

  reset(doc: CreatorDocument): void {
    this.undoStack = [{ document: doc, label: 'Initial state', timestamp: Date.now() }];
    this.redoStack = [];
  }

  getUndoLabel(): string | null {
    if (this.undoStack.length <= 1) return null;
    return this.undoStack[this.undoStack.length - 1].label;
  }

  getRedoLabel(): string | null {
    if (this.redoStack.length === 0) return null;
    return this.redoStack[this.redoStack.length - 1].label;
  }
}
