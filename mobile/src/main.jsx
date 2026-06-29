// Module Federation async boundary.
//
// The app shares react / react-dom / react-router-dom / redux / i18next /
// @cap-rel/smartcommon as MF singletons (see vite.config.js). Those shared
// modules are materialised by the MF runtime through an async import graph
// (localSharedImportMap uses top-level await). Host modules that call a shared
// function at top-level module-eval time (e.g. global-state slices calling
// smartcommon's isUndefined/getLocal, or redux createSlice) would otherwise run
// before that graph settles, crashing with "__mf_NNN is not a function"
// (deterministic in the prod build).
//
// This dynamic import is the canonical fix: it defers ALL app module evaluation
// (App -> Router -> global-state -> slices -> ...) to a later microtask, by
// which time the shared graph is ready. Everything that was in main.jsx now
// lives in bootstrap.jsx.
import("./bootstrap.jsx");
