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
  shipmentsIndexes,
  receptionsIndexes,
  supplierProposalsIndexes,
  invoiceRecsIndexes,
} from "./stores";

// Single Db instance used by every useDb<Feature> hook.
// New features must add their <feature>Indexes here in the stores map.
const db = new Db({
  name: import.meta.env.VITE_APP_NAME || "Dolipocket",
  // v2 (Tier A lot A1): adds the `shipments` store.
  // v3 (Tier A lot A2): adds the `receptions` store.
  // v4 (Tier A lot A3): adds the `supplierProposals` store.
  // v5 (Tier A lot A5b): adds the `invoiceRecs` store. Additive again -- Dexie
  // creates the new table on upgrade for existing clients; fresh installs get
  // it directly. No data migration needed (existing stores are untouched).
  version: 5,
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
    shipments: shipmentsIndexes,
    receptions: receptionsIndexes,
    supplierProposals: supplierProposalsIndexes,
    invoiceRecs: invoiceRecsIndexes,
  },
});

export default db;

export * from "./stores";
