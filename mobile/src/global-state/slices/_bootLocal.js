// Top-level-safe localStorage read for redux slice initialState.
//
// Mirrors smartcommon's getLocal() EXACTLY, but WITHOUT importing it. Reason:
// slice initialState runs at module-evaluation time. With Module Federation,
// @cap-rel/smartcommon is a shared (lazy) singleton, so calling getLocal() at
// top-level races the MF shared-scope init and crashes the prod build with
// "__mf_NNN is not a function". localStorage + JSON are language primitives,
// always available -- so reading boot state through them is race-free.
//
// Keep using smartcommon's setLocal/removeLocal INSIDE reducers (they run after
// mount, well after the shared scope is ready).
export function readBootLocal(key) {
  try {
    const item = localStorage.getItem(key);
    return item !== null ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}
