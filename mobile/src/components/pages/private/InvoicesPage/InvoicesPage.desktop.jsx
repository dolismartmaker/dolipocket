import { useState } from "react";

import { DataTable } from "src/lib/datatable";
import { invoicesListConfig } from "./listConfig";

// Desktop layout for the invoices (Facture client) list.
export const InvoicesPageDesktop = (props) => {
    const { dataSource } = props;
    const [total, setTotal] = useState(null);

    return (
        <div className="flex flex-col h-full w-full bg-white overflow-hidden">
            <div className="shrink-0 flex items-baseline gap-2 px-4 py-2 border-b border-gray-200 bg-white">
                <h1 className="text-base font-bold text-strong-text">
                    Factures
                    {total !== null && (
                        <span className="ml-1 font-normal text-gray-500">({total})</span>
                    )}
                </h1>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
                <DataTable
                    config={invoicesListConfig}
                    dataSource={dataSource}
                    feature="invoices"
                    onTotalChange={setTotal}
                />
            </div>
        </div>
    );
};
