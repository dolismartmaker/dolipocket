import { Db } from "@cap-rel/smartcommon";

import {
  usersIndexes,
  thirdpartiesIndexes,
  documentsIndexes,
  contactsIndexes,
  productsIndexes,
  warehousesIndexes,
  stockMovementsIndexes,
  proposalsIndexes,
  ordersIndexes,
  invoicesIndexes,
  supplierOrdersIndexes,
  supplierInvoicesIndexes,
  agendaIndexes,
} from "./stores";

// Single Db instance used by every useDb<Feature> hook.
// New features must add their <feature>Indexes here in the stores map.
const db = new Db({
  name: import.meta.env.VITE_APP_NAME || "Dolipocket",
  version: 1,
  stores: {
    users: usersIndexes,
    thirdparties: thirdpartiesIndexes,
    documents: documentsIndexes,
    contacts: contactsIndexes,
    products: productsIndexes,
    warehouses: warehousesIndexes,
    stockMovements: stockMovementsIndexes,
    proposals: proposalsIndexes,
    orders: ordersIndexes,
    invoices: invoicesIndexes,
    supplierOrders: supplierOrdersIndexes,
    supplierInvoices: supplierInvoicesIndexes,
    agenda: agendaIndexes,
  },
});

export default db;

export * from "./stores";
