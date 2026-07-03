import { FaArrowLeft, FaPen } from "react-icons/fa6";

import { Page } from "@cap-rel/smartcommon";

import { useMenu } from "src/lib/permissions";

import { fmtAmount, fmtDate } from "./useProjectData";

const STATUS_LABELS = { 0: "Brouillon", 1: "Ouvert", 2: "Fermé" };

// Mobile project detail. Read-first (the mobile app stays lean); workflow
// actions are available on the desktop cockpit. A single primary action set is
// exposed here (validate / close / reopen) plus edit.
export const ProjectPageMobile = (props) => {
    const {
        project, loading, error, actionPending,
        isDraft, isOpen, isClosed,
        handleValidate, handleClose, handleReopen,
        goEdit, goBack,
    } = props;

    const { has } = useMenu();
    const canWrite = has("project.write");

    return (
        <Page contentProps={{ className: "pb-app-base" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base">
                <button onClick={goBack} className="p-2 -ml-2" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1 truncate">
                    {project?.ref || "Projet"}
                </h1>
                {canWrite && project && (
                    <button onClick={goEdit} className="p-2" aria-label="Modifier">
                        <FaPen />
                    </button>
                )}
            </div>

            <div className="px-app-base mt-app-base flex flex-col gap-app-sm">
                {loading && <div className="text-center text-gray-500 p-4">Chargement...</div>}
                {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg">{error}</div>}

                {!loading && !error && project && (
                    <>
                        <div className="bg-white rounded-xl border border-gray-200 p-3">
                            <div className="flex justify-between items-center">
                                <div className="font-bold">{project.title}</div>
                                <div className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                                    {STATUS_LABELS[project.statut] ?? "?"}
                                </div>
                            </div>
                            <div className="mt-2 flex flex-col gap-1 text-sm text-gray-700">
                                <div>Tiers : {project.socname || (project.socid ? `#${project.socid}` : "-")}</div>
                                <div>Visibilité : {Number(project.public) ? "Public" : "Privé"}</div>
                                <div>Début : {fmtDate(project.dateStart) || "-"}</div>
                                <div>Fin : {fmtDate(project.dateEnd) || "-"}</div>
                                {Number(project.budgetAmount) > 0 && (
                                    <div>Budget : {fmtAmount(project.budgetAmount)} EUR</div>
                                )}
                            </div>
                        </div>

                        {(project.notePublic || project.notePrivate) && (
                            <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col gap-2">
                                {project.notePublic && (
                                    <div>
                                        <div className="text-xs text-gray-500">Note publique</div>
                                        <div className="text-sm whitespace-pre-wrap">{project.notePublic}</div>
                                    </div>
                                )}
                                {project.notePrivate && (
                                    <div>
                                        <div className="text-xs text-gray-500">Note privée</div>
                                        <div className="text-sm whitespace-pre-wrap">{project.notePrivate}</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {canWrite && (
                            <div className="flex flex-wrap gap-2">
                                {isDraft && (
                                    <button onClick={handleValidate} disabled={actionPending}
                                        className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
                                        Valider
                                    </button>
                                )}
                                {isOpen && (
                                    <button onClick={handleClose} disabled={actionPending}
                                        className="px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-50">
                                        Fermer
                                    </button>
                                )}
                                {isClosed && (
                                    <button onClick={handleReopen} disabled={actionPending}
                                        className="px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-50">
                                        Rouvrir
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Page>
    );
};
