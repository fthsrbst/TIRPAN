/**
 * Module-level singleton: persists terminal tab state across
 * popup ↔ full TerminalPage navigation (no backend PTY needed to survive).
 */

export type SavedSession = { localId: string; title: string };
export type SavedSplit   = { mode: "v" | "h"; a: string; b: string };

export interface SavedTerminalState {
  sessions:      SavedSession[];
  activeLocalId: string;
  split:         SavedSplit | null;
}

let _saved: SavedTerminalState | null = null;

export const terminalStore = {
  save(state: { sessions: { localId: string; title: string }[]; activeLocalId: string; split: SavedSplit | null }) {
    _saved = {
      sessions:      state.sessions.map(s => ({ localId: s.localId, title: s.title })),
      activeLocalId: state.activeLocalId,
      split:         state.split ? { ...state.split } : null,
    };
  },

  /** Consume: returns saved state and clears it. */
  load(): SavedTerminalState | null {
    const s = _saved;
    _saved = null;
    return s;
  },
};
