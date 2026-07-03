import { DocumentEditShell } from "src/lib/document/DocumentEditShell";
import { ORDER_CONFIG } from "src/lib/document/documentConfig";

// Desktop order edit page: thin wrapper over the generic <DocumentEditShell>.
export const OrderEditPageDesktop = (props) => (
    <DocumentEditShell
        config={ORDER_CONFIG}
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
        dataSource={props.dbOrders}
    />
);
