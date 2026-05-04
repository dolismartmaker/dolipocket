/**
 * Smoke-test: every private page must render without throwing when
 * useStates() returns { states: undefined, set: fn }.
 *
 * This catches the class of bug where a page destructures `form` (or any
 * nested object) from `states ?? {}` WITHOUT providing a default value, then
 * accesses `form.label`, `form.name`, etc. -- which throws:
 *
 *   TypeError: can't access property "label", form is undefined
 *
 * The test renders each component inside minimal mocks and asserts that
 * React.render does not throw.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Stub component factory
// ---------------------------------------------------------------------------
const IconStub = () => <span />;
const Wrapper = ({ children }) => <>{children}</>;

// ---------------------------------------------------------------------------
// Mock: @cap-rel/smartcommon
// ---------------------------------------------------------------------------
vi.mock("@cap-rel/smartcommon", () => ({
    Page: Wrapper,
    Block: Wrapper,
    Input: () => <input />,
    Select: () => <select />,
    Button: ({ children }) => <button>{children}</button>,
    Checker: () => <div />,
    isEmpty: (v) => !v,
    isUndefined: (v) => v === undefined,
    useApi: () => ({
        get: undefined,
        post: undefined,
        put: undefined,
        del: undefined,
    }),
    useStates: () => ({
        states: undefined,
        set: vi.fn(),
    }),
    useConfirm: () => ({
        alert: vi.fn(),
        confirm: vi.fn(),
    }),
    useUpload: () => ({
        upload: vi.fn(),
    }),
}));

// ---------------------------------------------------------------------------
// Mock: react-router-dom
// ---------------------------------------------------------------------------
vi.mock("react-router-dom", () => ({
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: "/", search: "", hash: "", state: null }),
    Link: Wrapper,
    NavLink: Wrapper,
}));

// ---------------------------------------------------------------------------
// Mock: react-icons - import originals and replace every export with a stub
// ---------------------------------------------------------------------------
const stubAllIcons = async (mod) => {
    const orig = await mod;
    const stubbed = {};
    for (const key of Object.keys(orig)) {
        stubbed[key] = () => null;
    }
    return stubbed;
};
vi.mock("react-icons/fa",  async (importOriginal) => stubAllIcons(importOriginal()));
vi.mock("react-icons/fa6", async (importOriginal) => stubAllIcons(importOriginal()));
vi.mock("react-icons/lu",  async (importOriginal) => stubAllIcons(importOriginal()));
vi.mock("react-icons/bs",  async (importOriginal) => stubAllIcons(importOriginal()));
vi.mock("react-icons/io",  async (importOriginal) => stubAllIcons(importOriginal()));

// ---------------------------------------------------------------------------
// Mock: app-level imports that some pages pull in
// ---------------------------------------------------------------------------
vi.mock("src/components", () => ({
    AboutModal: () => <div />,
    ContactImportModal: () => <div />,
}));

vi.mock("src/utils", () => ({
    API_ABORT_TIMEOUT: 10000,
}));

vi.mock("src/global-state", () => ({
    updateUser: vi.fn(),
}));

vi.mock("src/global-state/slices", () => ({}));
vi.mock("src/global-state/slices/lastSettings", () => ({
    defaultSettings: { lang: "fr", theme: "SmartInterventions", darkMode: false },
}));

vi.mock("react-redux", () => ({
    useSelector: () => ({}),
    useDispatch: () => vi.fn(),
    Provider: Wrapper,
}));

// ---------------------------------------------------------------------------
// Collect all page components
// ---------------------------------------------------------------------------
const pages = [
    ["AgendaEventEditPage", () => import("../AgendaEventEditPage")],
    ["AgendaEventPage", () => import("../AgendaEventPage")],
    ["AgendaPage", () => import("../AgendaPage")],
    ["ContactEditPage", () => import("../ContactEditPage")],
    ["ContactPage", () => import("../ContactPage")],
    ["ContactsPage", () => import("../ContactsPage")],
    ["DeviceIdentificationPage", () => import("../DeviceIdentificationPage")],
    ["DocumentsObjectPage", () => import("../DocumentsObjectPage")],
    ["DocumentsPage", () => import("../DocumentsPage")],
    ["HomePage", () => import("../HomePage")],
    ["InvoiceEditPage", () => import("../InvoiceEditPage")],
    ["InvoicePage", () => import("../InvoicePage")],
    ["InvoicesPage", () => import("../InvoicesPage")],
    ["OrderEditPage", () => import("../OrderEditPage")],
    ["OrderPage", () => import("../OrderPage")],
    ["OrdersPage", () => import("../OrdersPage")],
    ["ProductEditPage", () => import("../ProductEditPage")],
    ["ProductPage", () => import("../ProductPage")],
    ["ProductsPage", () => import("../ProductsPage")],
    ["ProposalEditPage", () => import("../ProposalEditPage")],
    ["ProposalPage", () => import("../ProposalPage")],
    ["ProposalsPage", () => import("../ProposalsPage")],
    ["StockMovementsPage", () => import("../StockMovementsPage")],
    ["StockPage", () => import("../StockPage")],
    ["SupplierInvoiceEditPage", () => import("../SupplierInvoiceEditPage")],
    ["SupplierInvoicePage", () => import("../SupplierInvoicePage")],
    ["SupplierInvoicesPage", () => import("../SupplierInvoicesPage")],
    ["SupplierOrderEditPage", () => import("../SupplierOrderEditPage")],
    ["SupplierOrderPage", () => import("../SupplierOrderPage")],
    ["SupplierOrdersPage", () => import("../SupplierOrdersPage")],
    ["ThirdPartiesPage", () => import("../ThirdPartiesPage")],
    ["ThirdPartyEditPage", () => import("../ThirdPartyEditPage")],
    ["ThirdPartyPage", () => import("../ThirdPartyPage")],
    ["WarehouseEditPage", () => import("../WarehouseEditPage")],
    ["WarehousePage", () => import("../WarehousePage")],
    ["WarehousesPage", () => import("../WarehousesPage")],
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("No crash when useStates returns undefined states", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it.each(pages)("%s renders without throwing", async (name, importFn) => {
        const mod = await importFn();
        const Component = mod[name] ?? mod.default;

        expect(Component).toBeDefined();

        // Must not throw
        expect(() => {
            render(<Component />);
        }).not.toThrow();
    });
});
