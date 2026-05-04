import { useState } from "react";

import { DataTable } from "src/lib/datatable";
import { contactsListConfig } from "./listConfig";

// PagesLayout is now viewport-aware (min-h-screen on desktop, cf
// inspiration from dsd/mobile), and AnimationLayout no longer forces
// `fixed inset-0`. So a desktop list page is just a plain flex container
// inside the natural flow of the AppShell <main>: full width to the right
// of the Sidebar, full height under the TopBar, with internal scroll.
export const ContactsPageDesktop = (props) => {
    const { dataSource, socidFilter } = props;
    const [total, setTotal] = useState(null);

    return (
        <div className="flex flex-col h-full w-full bg-white overflow-hidden">
            <div className="shrink-0 flex items-baseline gap-2 px-4 py-2 border-b border-gray-200 bg-white">
                <h1 className="text-base font-bold text-strong-text">
                    Contacts
                    {total !== null && (
                        <span className="ml-1 font-normal text-gray-500">({total})</span>
                    )}
                </h1>
                {socidFilter && (
                    <span className="text-xs text-gray-500">
                        Filtre par tiers #{socidFilter}
                    </span>
                )}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
                <DataTable
                    config={contactsListConfig}
                    dataSource={dataSource}
                    feature="contacts"
                    onTotalChange={setTotal}
                />
            </div>
        </div>
    );
};
