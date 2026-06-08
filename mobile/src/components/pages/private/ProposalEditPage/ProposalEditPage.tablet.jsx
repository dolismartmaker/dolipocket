import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

// Tablet edit page for a Proposal: focused full-page touch form (AutoForm in
// two columns) + the document lines editor (touch cards variant on tablet).
// Reuses useProposalEditData() and mirrors the desktop excludeKeys.
const EXCLUDE_KEYS = [
    "ref",
    "totalHt",
    "totalTva",
    "totalTtc",
    "fkStatut",
    "status",
    "statut",
    "datec",
    "dateValid",
    "datev",
    "dateCloture",
    "lastMainDoc",
    "modelPdf",
    "fkUserAuthor",
    "fkUserValid",
    "fkUserCloture",
];

export const ProposalEditPageTablet = ({
    isNew,
    proposal,
    setProposal,
    loading,
    saving,
    error,
    initialValues,
    describe,
    save,
    cancel,
    dbProposals,
}) => {
    return (
        <TabletEditScaffold
            title={isNew ? "Nouveau devis" : `Modifier ${proposal?.ref ?? ""}`}
            loading={loading}
            saving={saving}
            error={error}
            describe={describe}
            value={initialValues}
            mode={isNew ? "create" : "update"}
            excludeKeys={EXCLUDE_KEYS}
            onCancel={cancel}
            onSave={save}
            renderLines={() => (
                <DocumentLinesEditor
                    docId={!isNew && proposal ? Number(proposal.id) : 0}
                    lines={proposal?.lines ?? []}
                    dataSource={dbProposals}
                    onChange={(updatedDoc) => {
                        if (typeof setProposal === "function" && updatedDoc) setProposal(updatedDoc);
                    }}
                />
            )}
        />
    );
};
