// Public exports for the DataTable library.
//
// Pages consume <DataTable> by passing a listConfig and a dataSource, and
// optionally re-use the helpers below for custom views.
//
// <DocumentLinesTable> and <DocumentHeaderFields> are catalog-driven views
// for document detail pages (proposal, order, invoice, ...). Same model as
// the listing DataTable: server provides the column metadata, the user
// chooses what to show via an embedded "Colonnes"/"Champs" panel, the
// preferences are persisted in localStorage.

export { DataTable } from "./DataTable";
export { useDataTablePrefs } from "./DataTable/hooks/useDataTablePrefs";
export { useDataPipeline } from "./DataTable/hooks/useDataPipeline";
export { useColumnResize } from "./DataTable/hooks/useColumnResize";
export { useColumnReorder } from "./DataTable/hooks/useColumnReorder";
export { useRowSelection } from "./DataTable/hooks/useRowSelection";
export { exportRows } from "./DataTable/utils/exportRows";

export { DocumentLinesTable } from "./DocumentLinesTable";
export { DocumentHeaderFields } from "./DocumentHeaderFields";
