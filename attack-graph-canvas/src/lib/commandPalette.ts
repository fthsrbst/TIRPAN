/** Global command palette (⌘K) open channel — lets any component trigger it. */
export const COMMAND_PALETTE_EVENT = "tirpan:command-palette";

/** Open the global command palette from anywhere (search button, dock, etc.). */
export const openCommandPalette = () => {
  window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT));
};
