// Re-export each feature mapping module so consumers can do:
//   import { thirdparties } from "src/api/mapping";
//
// Each mapping file exports two pure functions: mapFromBackend(raw) and
// mapToBackend(local). The HTTP calls themselves live in db/stores/<feature>/
// useDb<Feature>.jsx, never here.

export * as thirdparties from "./thirdparties";
export * as documents from "./documents";
export * as contacts from "./contacts";
export * as products from "./products";
export * as warehouses from "./warehouses";
export * as stockMovements from "./stockMovements";
export * as supplierOrders from "./supplierOrders";
export * as supplierInvoices from "./supplierInvoices";
export * as agenda from "./agenda";
export * as proposals from "./proposals";
export * as orders from "./orders";
export * as invoices from "./invoices";
