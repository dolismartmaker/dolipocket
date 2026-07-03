import { Route, Routes } from "react-router-dom";

import {
    // App layouts + bootstrapped pages
    LoginPage, HomePage, Error404Page,
    PrivatePagesLayout, PagesLayout, PreDeviceLayout, PostDeviceIdentificationLayout, PublicPagesLayout,
    WelcomePage, HandoffPage, DeviceIdentificationPage, AnimationLayout,
    AppShell,
    // Lot 1 - Tiers + Contacts
    ThirdPartiesPage, ThirdPartyPage, ThirdPartyEditPage,
    ContactsPage, ContactPage, ContactEditPage,
    // Lot 2 - Catalogue
    ProductsPage, ProductPage, ProductEditPage,
    WarehousesPage, WarehousePage, WarehouseEditPage,
    StockPage, StockMovementsPage,
    // Lot 3 - Cycle vente
    ProposalsPage, ProposalPage, ProposalEditPage,
    OrdersPage, OrderPage, OrderEditPage,
    InvoicesPage, InvoicePage, InvoiceEditPage,
    // Lot 4 - Cycle achat
    SupplierOrdersPage, SupplierOrderPage, SupplierOrderEditPage,
    SupplierInvoicesPage, SupplierInvoicePage, SupplierInvoiceEditPage,
    // Tier A - A1 - Expeditions (Expedition)
    ShipmentsPage, ShipmentPage, ShipmentCreatePage,
    // Tier A - A2 - Receptions (Reception)
    ReceptionsPage, ReceptionPage, ReceptionCreatePage,
    // Tier A - A3 - Supplier price requests (SupplierProposal)
    SupplierProposalsPage, SupplierProposalPage, SupplierProposalEditPage,
    // Tier A - A5b - Recurring invoice templates (FactureRec)
    InvoiceTemplatesPage, InvoiceTemplatePage,
    // Lot 5 - Agenda + GED
    AgendaPage, AgendaEventPage, AgendaEventEditPage,
    DocumentsPage, DocumentsObjectPage,
    // Lot B1 - Projects (projet)
    ProjectsPage, ProjectPage, ProjectEditPage,
} from "src/components";

import { RequirePermission } from "src/lib/permissions";
// Runtime-discovered features shipped by OTHER Dolibarr modules (e.g. capmail),
// loaded via Module Federation. The set is advertised by GET /home and mounted
// dynamically -- the host bundle (built by `make pwa`) knows nothing about them.
import { usePluginRoutes } from "src/lib/plugins/PluginRoutes";

// The HashRouter is mounted by smartcommon's <Provider> (config.router:"hash",
// set in SmartCommonProvider). This component only declares the route tree and
// renders INSIDE that router -- so it returns <Routes> directly, no Router here.
export const Router = () => {
    // Routes contributed by discovered plugin remotes (empty unless a plugin
    // module is active server-side). Mounted under the AppShell below.
    const pluginRoutes = usePluginRoutes();

    return (
            <Routes>
                <Route element={<PagesLayout />}>
                    <Route element={<PublicPagesLayout />}>
                        <Route path="/welcome" element={<WelcomePage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/handoff" element={<HandoffPage />} />
                    </Route>
                    <Route element={<PrivatePagesLayout />}>
                        <Route element={<PreDeviceLayout />}>
                            <Route path="/device-identification" element={<DeviceIdentificationPage />} />
                        </Route>
                        <Route element={<PostDeviceIdentificationLayout />}>
                            {/* AppShell provides bottom nav + more menu */}
                            <Route element={<AppShell />}>
                                {/* AnimationLayout centralise les transitions - ne pas le mettre dans chaque page.
                                    Note: PagesLayout is now viewport-aware (min-h-screen desktop /
                                    fixed inset-x-0 top-0 h-dvh mobile), so list/dashboard pages
                                    no longer need to be routed outside this AnimationLayout. */}
                                <Route element={<AnimationLayout />}>
                                    {/* Always-allowed routes (HomePage, Documents) */}
                                    <Route path="/" element={<HomePage />} />
                                    <Route path="/documents" element={<DocumentsPage />} />
                                    <Route path="/documents/:type/:id" element={<DocumentsObjectPage />} />

                                    {/* Lot 1 - Tiers */}
                                    <Route element={<RequirePermission perm="thirdparty.read" />}>
                                        <Route path="/thirdparties" element={<ThirdPartiesPage />} />
                                        <Route path="/thirdparties/new" element={<ThirdPartyEditPage />} />
                                        <Route path="/thirdparties/:id" element={<ThirdPartyPage />} />
                                        <Route path="/thirdparties/:id/edit" element={<ThirdPartyEditPage />} />
                                    </Route>

                                    {/* Lot 1 - Contacts */}
                                    <Route element={<RequirePermission perm="contact.read" />}>
                                        <Route path="/contacts" element={<ContactsPage />} />
                                        <Route path="/contacts/new" element={<ContactEditPage />} />
                                        <Route path="/contacts/:id" element={<ContactPage />} />
                                        <Route path="/contacts/:id/edit" element={<ContactEditPage />} />
                                    </Route>

                                    {/* Lot 2 - Produits */}
                                    <Route element={<RequirePermission perm="product.read" />}>
                                        <Route path="/products" element={<ProductsPage />} />
                                        <Route path="/products/new" element={<ProductEditPage />} />
                                        <Route path="/products/:id" element={<ProductPage />} />
                                        <Route path="/products/:id/edit" element={<ProductEditPage />} />
                                    </Route>

                                    {/* Lot 2 - Entrepôts */}
                                    <Route element={<RequirePermission perm="warehouse.read" />}>
                                        <Route path="/warehouses" element={<WarehousesPage />} />
                                        <Route path="/warehouses/new" element={<WarehouseEditPage />} />
                                        <Route path="/warehouses/:id" element={<WarehousePage />} />
                                        <Route path="/warehouses/:id/edit" element={<WarehouseEditPage />} />
                                    </Route>

                                    {/* Lot 2 - Stock */}
                                    <Route element={<RequirePermission perm="stock.read" />}>
                                        <Route path="/stock" element={<StockPage />} />
                                        <Route path="/stock/movements" element={<StockMovementsPage />} />
                                    </Route>

                                    {/* Lot 3 - Devis */}
                                    <Route element={<RequirePermission perm="proposal.read" />}>
                                        <Route path="/proposals" element={<ProposalsPage />} />
                                        <Route path="/proposals/new" element={<ProposalEditPage />} />
                                        <Route path="/proposals/:id" element={<ProposalPage />} />
                                        <Route path="/proposals/:id/edit" element={<ProposalEditPage />} />
                                    </Route>

                                    {/* Lot 3 - Commandes client */}
                                    <Route element={<RequirePermission perm="order.read" />}>
                                        <Route path="/orders" element={<OrdersPage />} />
                                        <Route path="/orders/new" element={<OrderEditPage />} />
                                        <Route path="/orders/:id" element={<OrderPage />} />
                                        <Route path="/orders/:id/edit" element={<OrderEditPage />} />
                                    </Route>

                                    {/* Lot 3 - Factures client */}
                                    <Route element={<RequirePermission perm="invoice.read" />}>
                                        <Route path="/invoices" element={<InvoicesPage />} />
                                        <Route path="/invoices/new" element={<InvoiceEditPage />} />
                                        <Route path="/invoices/:id" element={<InvoicePage />} />
                                        <Route path="/invoices/:id/edit" element={<InvoiceEditPage />} />
                                    </Route>

                                    {/* Tier A - A1 - Expeditions (Expedition) */}
                                    <Route element={<RequirePermission perm="shipment.read" />}>
                                        <Route path="/shipments" element={<ShipmentsPage />} />
                                        <Route path="/shipments/:id" element={<ShipmentPage />} />
                                    </Route>
                                    <Route element={<RequirePermission perm="shipment.create" />}>
                                        <Route path="/orders/:id/ship" element={<ShipmentCreatePage />} />
                                    </Route>

                                    {/* Tier A - A3 - Demandes de prix fournisseur */}
                                    <Route element={<RequirePermission perm="supplierproposal.read" />}>
                                        <Route path="/supplier-proposals" element={<SupplierProposalsPage />} />
                                        <Route path="/supplier-proposals/new" element={<SupplierProposalEditPage />} />
                                        <Route path="/supplier-proposals/:id" element={<SupplierProposalPage />} />
                                        <Route path="/supplier-proposals/:id/edit" element={<SupplierProposalEditPage />} />
                                    </Route>

                                    {/* Tier A - A5b - Factures récurrentes */}
                                    <Route element={<RequirePermission perm="invoicerec.read" />}>
                                        <Route path="/invoice-templates" element={<InvoiceTemplatesPage />} />
                                        <Route path="/invoice-templates/:id" element={<InvoiceTemplatePage />} />
                                    </Route>

                                    {/* Lot B1 - Projets (projet) */}
                                    <Route element={<RequirePermission perm="project.read" />}>
                                        <Route path="/projects" element={<ProjectsPage />} />
                                        <Route path="/projects/new" element={<ProjectEditPage />} />
                                        <Route path="/projects/:id" element={<ProjectPage />} />
                                        <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
                                    </Route>

                                    {/* Lot 4 - Commandes fournisseur */}
                                    <Route element={<RequirePermission perm="supplierorder.read" />}>
                                        <Route path="/supplier-orders" element={<SupplierOrdersPage />} />
                                        <Route path="/supplier-orders/new" element={<SupplierOrderEditPage />} />
                                        <Route path="/supplier-orders/:id" element={<SupplierOrderPage />} />
                                        <Route path="/supplier-orders/:id/edit" element={<SupplierOrderEditPage />} />
                                    </Route>

                                    {/* Tier A - A2 - Receptions (Reception) */}
                                    <Route element={<RequirePermission perm="reception.read" />}>
                                        <Route path="/receptions" element={<ReceptionsPage />} />
                                        <Route path="/receptions/:id" element={<ReceptionPage />} />
                                    </Route>
                                    <Route element={<RequirePermission perm="reception.create" />}>
                                        <Route path="/supplier-orders/:id/reception" element={<ReceptionCreatePage />} />
                                    </Route>

                                    {/* Lot 4 - Factures fournisseur */}
                                    <Route element={<RequirePermission perm="supplierinvoice.read" />}>
                                        <Route path="/supplier-invoices" element={<SupplierInvoicesPage />} />
                                        <Route path="/supplier-invoices/new" element={<SupplierInvoiceEditPage />} />
                                        <Route path="/supplier-invoices/:id" element={<SupplierInvoicePage />} />
                                        <Route path="/supplier-invoices/:id/edit" element={<SupplierInvoiceEditPage />} />
                                    </Route>

                                    {/* Lot 5 - Agenda */}
                                    <Route element={<RequirePermission perm="agenda.read" />}>
                                        <Route path="/agenda" element={<AgendaPage />} />
                                        <Route path="/agenda/new" element={<AgendaEventEditPage />} />
                                        <Route path="/agenda/:id" element={<AgendaEventPage />} />
                                        <Route path="/agenda/:id/edit" element={<AgendaEventEditPage />} />
                                    </Route>

                                    {/* Routes contributed by discovered plugin remotes
                                        (e.g. capmail "/mail"). Empty unless a plugin
                                        module is active server-side. */}
                                    {pluginRoutes}
                                </Route>
                            </Route>
                        </Route>
                    </Route>
                    <Route path="*" element={<Error404Page />} />
                </Route>
            </Routes>
    );
};
