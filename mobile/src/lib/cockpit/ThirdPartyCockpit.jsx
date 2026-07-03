import { useNavigate } from "react-router-dom";

import { DocumentHeaderFields } from "src/lib/datatable";
import { ThirdPartyCategoriesSection } from "src/lib/components/ThirdPartyCategoriesSection";
import { ThirdPartyBankSection } from "src/lib/components/ThirdPartyBankSection";

import { useThirdPartyCockpit } from "./useThirdPartyCockpit";
import { HEADER_OVERRIDES } from "./headerOverrides";
import {
    SalesActivityCard,
    CaChartCard,
    RecentInvoicesCard,
    UnpaidInvoicesCard,
    ContactsCard,
    EventsCard,
    NotesCard,
} from "./cards";

// Desktop "cockpit": a 360 synthesis of a thirdparty laid out as a masonry of
// cards (CSS multi-column) that fills the available width -- 1 column on small
// screens, 2 on large, 3 on very wide (4k). The full coordinates card keeps the
// catalog-driven "Champs" panel; the data cards consume the single cockpit
// aggregation payload and self-gate on the server permission map. The existing
// Categories and Bank sections are reused as-is (they self-fetch).
export const ThirdPartyCockpit = ({ item, dataSource, editable = false, onSaveField }) => {
    const navigate = useNavigate();
    const { data, loading, error, reload } = useThirdPartyCockpit(item?.id, dataSource);
    const currency = data?.currency || "EUR";

    return (
        <div className="w-full">
            {error && (
                <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 rounded-md text-[12px]">
                    {error}
                </div>
            )}

            <div className="columns-1 lg:columns-2 2xl:columns-3 gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid">
                <DocumentHeaderFields
                    object={item}
                    feature="thirdparty"
                    dataSource={dataSource}
                    storageKey="dolipocket.thirdpartypage.header"
                    title="Coordonnées"
                    overrides={HEADER_OVERRIDES}
                    editable={editable}
                    onSaveField={onSaveField}
                />

                <SalesActivityCard data={data} loading={loading} currency={currency} onRefresh={reload} />
                <UnpaidInvoicesCard
                    data={data}
                    loading={loading}
                    onRefresh={reload}
                    onRowClick={(id) => navigate(`/invoices/${id}`)}
                />
                <CaChartCard data={data} loading={loading} currency={currency} onRefresh={reload} />
                <RecentInvoicesCard
                    data={data}
                    loading={loading}
                    onRefresh={reload}
                    onRowClick={(id) => navigate(`/invoices/${id}`)}
                />
                <ContactsCard
                    data={data}
                    loading={loading}
                    onRefresh={reload}
                    onRowClick={(id) => navigate(`/contacts/${id}`)}
                />
                <EventsCard
                    data={data}
                    loading={loading}
                    onRefresh={reload}
                    onRowClick={(id) => navigate(`/agenda/${id}`)}
                />
                <NotesCard item={item} />

                <ThirdPartyCategoriesSection thirdpartyId={Number(item.id)} dataSource={dataSource} />
                <ThirdPartyBankSection thirdpartyId={Number(item.id)} dataSource={dataSource} />
            </div>
        </div>
    );
};
