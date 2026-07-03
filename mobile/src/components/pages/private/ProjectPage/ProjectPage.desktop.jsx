import { useState } from "react";
import {
    FaArrowLeft, FaPen, FaCheck, FaLock, FaLockOpen,
    FaRotateLeft, FaClone, FaTrash, FaFilePdf,
} from "react-icons/fa6";
import toast from "react-hot-toast";

import { StatusPill } from "src/lib/components/StatusPill";
import { DocumentContactsSection } from "src/lib/components/DocumentContactsSection";
import { DocumentsSection } from "src/lib/components/DocumentsSection";
import { ProjectCategoriesSection } from "src/lib/components/ProjectCategoriesSection";
import { ProjectLinkedObjectsSection } from "src/lib/components/ProjectLinkedObjectsSection";
import { ProjectTasksSection } from "src/lib/components/ProjectTasksSection";
import { useMenu } from "src/lib/permissions";

import { fmtAmount, fmtDate } from "./useProjectData";

// Desktop project detail cockpit. Header-only object (tasks/time arrive in
// lots B3/B4). Epure UI conventions: border not shadow, tight density, no
// rounded-2xl, no active:.

const Row = ({ label, value }) => (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-soft-border/60 last:border-b-0">
        <span className="w-40 shrink-0 text-[12px] text-soft-text">{label}</span>
        <span className="text-[13px] text-strong-text break-words">{value ?? "-"}</span>
    </div>
);

export const ProjectPageDesktop = (props) => {
    const {
        project, loading, error, actionPending,
        isDraft, isOpen, isClosed,
        handleValidate, handleClose, handleReopen, handleSetDraft,
        handleClone, handleDelete, goEdit, goBack,
        dbProjects,
    } = props;

    const { has } = useMenu();
    const canWrite = has("project.write");
    const canCreate = has("project.create");
    const canDelete = has("project.delete");

    const [docRefresh, setDocRefresh] = useState(0);
    const [pdfBusy, setPdfBusy] = useState(false);

    const handleGeneratePdf = async () => {
        if (!project) return;
        setPdfBusy(true);
        try {
            await dbProjects.generatePdf(project.id);
            toast.success("PDF généré");
            setDocRefresh((k) => k + 1);
        } catch (err) {
            console.error("generate project pdf", err);
            toast.error("Génération du PDF impossible");
        } finally {
            setPdfBusy(false);
        }
    };

    const btn = "h-[30px] px-3 rounded text-[12px] flex items-center gap-1.5 transition-colors disabled:opacity-50";
    const btnGhost = `${btn} border border-soft-border text-strong-text hover:bg-medium-bg`;
    const btnPrimary = `${btn} bg-primary text-white hover:bg-primary/90`;
    const btnDanger = `${btn} border border-rose-200 text-rose-700 hover:bg-rose-50`;

    return (
        <div className="flex flex-col h-full w-full bg-medium-bg overflow-hidden">
            <header className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
                <button
                    type="button"
                    onClick={goBack}
                    className="p-1.5 -ml-1 rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    aria-label="Retour"
                >
                    <FaArrowLeft className="text-sm" />
                </button>
                <h1 className="text-base font-bold text-strong-text truncate">
                    {project?.ref || "Projet"}
                    {project?.title ? <span className="ml-2 font-normal text-soft-text">{project.title}</span> : null}
                </h1>
                {project ? <StatusPill feature="project" status={project.statut} /> : null}
                <span className="flex-1" />

                {!loading && project && (
                    <div className="flex items-center gap-2">
                        {canWrite && (
                            <button type="button" onClick={goEdit} disabled={actionPending} className={btnGhost}>
                                <FaPen className="text-[11px]" /> Modifier
                            </button>
                        )}
                        {canWrite && isDraft && (
                            <button type="button" onClick={handleValidate} disabled={actionPending} className={btnPrimary}>
                                <FaCheck className="text-[11px]" /> Valider
                            </button>
                        )}
                        {canWrite && isOpen && (
                            <button type="button" onClick={handleClose} disabled={actionPending} className={btnGhost}>
                                <FaLock className="text-[11px]" /> Fermer
                            </button>
                        )}
                        {canWrite && isClosed && (
                            <button type="button" onClick={handleReopen} disabled={actionPending} className={btnGhost}>
                                <FaLockOpen className="text-[11px]" /> Rouvrir
                            </button>
                        )}
                        {canWrite && !isDraft && (
                            <button type="button" onClick={handleSetDraft} disabled={actionPending} className={btnGhost}>
                                <FaRotateLeft className="text-[11px]" /> Brouillon
                            </button>
                        )}
                        {canCreate && (
                            <button type="button" onClick={handleClone} disabled={actionPending} className={btnGhost}>
                                <FaClone className="text-[11px]" /> Dupliquer
                            </button>
                        )}
                        {canWrite && (
                            <button type="button" onClick={handleGeneratePdf} disabled={pdfBusy || actionPending} className={btnGhost}>
                                <FaFilePdf className="text-[11px]" /> PDF
                            </button>
                        )}
                        {canDelete && (
                            <button type="button" onClick={handleDelete} disabled={actionPending} className={btnDanger}>
                                <FaTrash className="text-[11px]" /> Supprimer
                            </button>
                        )}
                    </div>
                )}
            </header>

            <div className="flex-1 min-h-0 overflow-auto p-4">
                {loading && <div className="text-soft-text text-sm">Chargement...</div>}
                {error && (
                    <div className="mb-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-md px-3 py-2 text-[13px]">
                        {error}
                    </div>
                )}

                {!loading && !error && project && (
                    <div className="mx-auto w-full max-w-[1800px] flex flex-col gap-4">
                     {/* Fluid 3-column grid so wide screens are filled instead of
                         cramming everything into the left half. Columns collapse
                         to 2 then 1 on narrower viewports. Tasks (a wide table)
                         stay full width below the grid. */}
                     <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                      {/* Column 1: Informations + Notes */}
                      <div className="flex flex-col gap-4 min-w-0">
                        <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                            <header className="px-4 py-2.5 border-b border-soft-border">
                                <h2 className="text-sm font-semibold text-strong-text">Informations</h2>
                            </header>
                            <div className="px-4 py-2">
                                <Row label="Référence" value={project.ref} />
                                <Row label="Libellé" value={project.title} />
                                <Row label="Tiers" value={project.socname || (project.socid ? `#${project.socid}` : "-")} />
                                <Row label="Visibilité" value={Number(project.public) ? "Public" : "Privé"} />
                                <Row label="Date de début" value={fmtDate(project.dateStart) || "-"} />
                                <Row label="Date de fin" value={fmtDate(project.dateEnd) || "-"} />
                                {Number(project.budgetAmount) > 0 && (
                                    <Row label="Budget" value={`${fmtAmount(project.budgetAmount)} EUR`} />
                                )}
                                {(Number(project.oppAmount) > 0 || Number(project.oppPercent) > 0) && (
                                    <Row
                                        label="Opportunité"
                                        value={`${fmtAmount(project.oppAmount)} EUR - ${Number(project.oppPercent) || 0} %`}
                                    />
                                )}
                                <Row label="Créé le" value={fmtDate(project.dateCreation) || "-"} />
                                {project.description ? <Row label="Description" value={project.description} /> : null}
                            </div>
                        </section>

                        {(project.notePublic || project.notePrivate) && (
                            <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                <header className="px-4 py-2.5 border-b border-soft-border">
                                    <h2 className="text-sm font-semibold text-strong-text">Notes</h2>
                                </header>
                                <div className="px-4 py-3 flex flex-col gap-3">
                                    {project.notePublic && (
                                        <div>
                                            <div className="text-[12px] text-soft-text mb-1">Note publique</div>
                                            <div className="text-[13px] text-strong-text whitespace-pre-wrap">{project.notePublic}</div>
                                        </div>
                                    )}
                                    {project.notePrivate && (
                                        <div>
                                            <div className="text-[12px] text-soft-text mb-1">Note privée</div>
                                            <div className="text-[13px] text-strong-text whitespace-pre-wrap">{project.notePrivate}</div>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}
                      </div>

                      {/* Column 2: linked objects (long vertical list) */}
                      <div className="flex flex-col gap-4 min-w-0">
                        <ProjectLinkedObjectsSection projectId={project.id} dataSource={dbProjects} canWrite={canWrite} />
                      </div>

                      {/* Column 3: contacts + categories + documents */}
                      <div className="flex flex-col gap-4 min-w-0">
                        <DocumentContactsSection docId={project.id} dataSource={dbProjects} />
                        <ProjectCategoriesSection projectId={project.id} dataSource={dbProjects} />
                        <DocumentsSection objectType="project" objectId={project.id} refreshKey={docRefresh} />
                      </div>
                     </div>

                     <ProjectTasksSection projectId={project.id} canWrite={canWrite} />
                    </div>
                )}
            </div>
        </div>
    );
};
