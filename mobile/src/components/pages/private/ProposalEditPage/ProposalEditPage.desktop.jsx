import { DocumentEditShell } from "src/lib/document/DocumentEditShell";
import { PROPOSAL_CONFIG } from "src/lib/document/documentConfig";

// Desktop proposal edit page: thin wrapper over the generic <DocumentEditShell>.
export const ProposalEditPageDesktop = (props) => (
    <DocumentEditShell
        config={PROPOSAL_CONFIG}
        isNew={props.isNew}
        loading={props.loading}
        saving={props.saving}
        error={props.error}
        initialValues={props.initialValues}
        describe={props.describe}
        save={props.save}
        cancel={props.cancel}
        object={props.proposal}
        setObject={props.setProposal}
        dataSource={props.dbProposals}
    />
);
