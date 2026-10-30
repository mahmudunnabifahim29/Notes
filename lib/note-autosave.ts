import type { Note } from "./examples";

export type SaveState = {
  draft: Note;
  dirty: boolean;
  saving: boolean;
  error: string;
  conflict: boolean;
  savedAt: string | null;
};
export type NoteWrite = {
  path: string;
  method: "POST" | "PATCH";
  payload: Record<string, unknown>;
};
function fields(note: Note) {
  return { title: note.title, content: note.content, category: note.category, color: note.color, folderId: note.folderId ?? null, tags: note.tags ?? [] };
}
function fingerprint(note: Note) {
  return JSON.stringify({ ...fields(note), title: note.title.trim() || "Untitled note" });
}

// Owns one editor's write queue. React rerenders never start a second creation
// request, and edits made during a request are saved using the returned version.
export class NoteAutosave {
  state: SaveState;
  private saved: string;
  private clientId: string;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<boolean> | null = null;
  private paused = false;
  private disposed = false;

  constructor(note: Note, private write: (request: NoteWrite) => Promise<Note>,
    private onSaved: (note: Note) => void, private delay = 1200) {
    this.state = { draft: { ...note }, dirty: false, saving: false, error: "", conflict: false, savedAt: null };
    this.saved = fingerprint(note);
    this.clientId = crypto.randomUUID();
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(change: Partial<SaveState>) {
    this.state = { ...this.state, ...change };
    if (!this.disposed) this.listeners.forEach(listener => listener());
  }
  private clearTimer() { clearTimeout(this.timer); this.timer = undefined; }
  private schedule() {
    this.clearTimer();
    const { draft, dirty, error, conflict } = this.state;
    if (this.disposed || this.paused || !dirty || error || conflict || this.inFlight) return;
    if (draft.id === "new" && !draft.title.trim() && !draft.content.trim()) return;
    this.timer = setTimeout(() => { void this.save(); }, this.delay);
  }
  update(change: Partial<Pick<Note, "title" | "content" | "category" | "color" | "folderId" | "tags">>) {
    const draft = { ...this.state.draft, ...change };
    this.emit({ draft, dirty: fingerprint(draft) !== this.saved || draft.id === "new" });
    this.schedule();
  }
  pause() { this.paused = true; this.clearTimer(); }
  resume() { this.paused = false; this.schedule(); }
  // StrictMode may detach and reattach the same editor instance.
  activate() { this.disposed = false; this.schedule(); }
  dispose() { this.disposed = true; this.clearTimer(); }
  replace(note: Note) {
    if (this.inFlight) return;
    this.saved = fingerprint(note);
    this.emit({ draft: { ...note }, dirty: false, saving: false, error: "", conflict: false, savedAt: null });
    this.resume();
  }
  save(): Promise<boolean> {
    this.clearTimer();
    if (this.inFlight) return this.inFlight;
    if (this.disposed || this.state.conflict) return Promise.resolve(false);
    this.emit({ error: "" });
    this.inFlight = this.persist().finally(() => { this.inFlight = null; this.schedule(); });
    return this.inFlight;
  }
  private async persist(): Promise<boolean> {
    // A deliberate Save can create an empty note. Merely opening one cannot.
    while (!this.disposed && (this.state.dirty || this.state.draft.id === "new")) {
      const snapshot = { ...this.state.draft };
      this.emit({ saving: true });
      try {
        const note = await this.write({
          path: snapshot.id === "new" ? "notes" : `notes/${snapshot.id}`,
          method: snapshot.id === "new" ? "POST" : "PATCH",
          payload: { ...fields(snapshot), ...(snapshot.id === "new"
            ? { clientId: this.clientId } : { expectedUpdatedAt: snapshot.updatedAt }) },
        });
        if (this.disposed) return false;
        // Keep newer keystrokes. A retried creation may return the earlier saved
        // text; retain our draft and follow it with a version-checked PATCH.
        const current = this.state.draft;
        const canUseResponse = fingerprint(current) === fingerprint(snapshot) && fingerprint(note) === fingerprint(snapshot);
        const draft = canUseResponse ? note : { ...note, ...fields(current) };
        this.saved = fingerprint(note);
        this.emit({ draft, dirty: fingerprint(draft) !== this.saved, savedAt: note.updatedAt });
        this.onSaved(note);
      } catch (error) {
        this.emit({ error: error instanceof Error ? error.message : "Could not save. Please try again.",
          conflict: (error as { status?: number })?.status === 409, dirty: true, saving: false });
        return false;
      }
      // A confirmation pauses subsequent writes; an in-flight write still completes.
      if (this.paused) break;
    }
    this.emit({ saving: false });
    return !this.state.dirty;
  }
}
