import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { PROPOSAL_CONFIG } from "src/lib/document/documentConfig";

// Tablet proposal edit page: touch AutoForm + lines editor. Curated header
// whitelist from PROPOSAL_CONFIG.editFields.
export const ProposalEditPageTablet = (props) => {
    const { isNew, proposal, setProposal, loading, saving, error, initialValues, describe, save, cancel, dbProposals } = props;
    const includeKeys = isNew ? PROPOSAL_CONFIG.editFields.create : PROPOSAL_CONFIG.editFields.update;
    return (
        <TabletEditScaffold
            title={isNew ? PROPOSAL_CONFIG.newTitle : `Modifier ${proposal?.ref ?? ""}`}
            loading={loading}
            saving={saving}
            error={error}
            describe={describe}
            value={initialValues}
            mode={isNew ? "create" : "update"}
            includeKeys={includeKeys}
            groupings={[{ id: "main", title: "En-tête", keys: includeKeys }]}
            onCancel={cancel}
            onSave={save}
            renderLines={() => (
                <DocumentLinesEditor
                    docId={!isNew && proposal ? Number(proposal.id) : 0}
                    lines={proposal?.lines ?? []}
                    dataSource={dbProposals}
                    onChange={(u) => { if (typeof setProposal === "function" && u) setProposal(u); }}
                />
            )}
        />
    );
};
