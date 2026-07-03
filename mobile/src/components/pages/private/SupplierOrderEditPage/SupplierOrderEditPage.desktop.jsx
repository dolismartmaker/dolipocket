import { DocumentEditShell } from "src/lib/document/DocumentEditShell";
import { SUPPLIER_ORDER_CONFIG } from "src/lib/document/documentConfig";

// Desktop supplier order edit page: thin wrapper over <DocumentEditShell>.
export const SupplierOrderEditPageDesktop = (props) => (
    <DocumentEditShell
        config={SUPPLIER_ORDER_CONFIG}
        isNew={props.isNew}
        loading={props.loading}
        saving={props.saving}
        error={props.error}
        initialValues={props.initialValues}
        describe={props.describe}
        save={props.save}
        cancel={props.cancel}
        object={props.order}
        setObject={props.setOrder}
        dataSource={props.dbSupplierOrders}
    />
);
