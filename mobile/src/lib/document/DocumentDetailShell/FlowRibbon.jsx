import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronRight } from "react-icons/fa6";

// Commercial-cycle ribbon: a horizontal stepper that places the current
// document in its document chain (Devis -> Commande -> Facture -> Paiement for
// a sales invoice) and surfaces the upstream/downstream linked documents as
// clickable chips. This is the context Dolibarr hides inside a "linked objects"
// box -- here it is front and center.
//
// config.flow contract:
//   steps: [{ key, label, match?: [elementTypes], route?: "/orders",
//             self?: bool, payment?: bool }]
//   payment(object) -> { sub, done }   (only consulted for a payment step)
//
// Linked documents are resolved from dataSource.listLinks(id); each link is
// { rowid, type, label, id, ref }. A step whose match types are not present
// renders as a muted placeholder.

const StepNode = ({ kind, label, value, onClick, done }) => {
    const base = "flex flex-col items-start leading-tight rounded-lg border px-3 py-1.5 min-w-[110px]";
    if (kind === "self") {
        return (
            <div className={`${base} border-primary bg-primary/10`}>
                <span className="text-[10px] uppercase tracking-wider text-primary/80">{label}</span>
                <span className="text-[13px] font-bold text-primary truncate max-w-[160px]">{value || "vous"}</span>
            </div>
        );
    }
    if (kind === "payment") {
        return (
            <div className={`${base} ${done ? "border-emerald-300 bg-emerald-50" : "border-soft-border bg-white"}`}>
                <span className="text-[10px] uppercase tracking-wider text-soft-text">{label}</span>
                <span className={`text-[13px] font-semibold ${done ? "text-emerald-700" : "text-strong-text"}`}>{value}</span>
            </div>
        );
    }
    if (kind === "present") {
        return (
            <button
                type="button"
                onClick={onClick}
                className={`${base} border-soft-border bg-white text-left hover:border-primary/60 hover:bg-medium-bg/50 transition-colors`}
                title={`Ouvrir ${value}`}
            >
                <span className="text-[10px] uppercase tracking-wider text-soft-text">{label}</span>
                <span className="text-[13px] font-semibold text-strong-text truncate max-w-[160px]">{value}</span>
            </button>
        );
    }
    // absent
    return (
        <div className={`${base} border-dashed border-soft-border bg-transparent`}>
            <span className="text-[10px] uppercase tracking-wider text-soft-text/70">{label}</span>
            <span className="text-[13px] text-soft-text/60">-</span>
        </div>
    );
};

export const FlowRibbon = ({ config, object, dataSource }) => {
    const navigate = useNavigate();
    const [links, setLinks] = useState([]);

    const flow = config.flow;
    const id = object?.id;
    const hasClient = !!(dataSource && dataSource.listLinks);

    useEffect(() => {
        let alive = true;
        if (!hasClient || !id || !flow) return undefined;
        dataSource
            .listLinks(id)
            .then((data) => { if (alive) setLinks(Array.isArray(data) ? data : []); })
            .catch((err) => { console.error("[FlowRibbon] listLinks error", err); });
        return () => { alive = false; };
    }, [hasClient, id]);

    if (!flow || !Array.isArray(flow.steps)) return null;

    const nodes = flow.steps.map((step) => {
        if (step.self) {
            return { key: step.key, kind: "self", label: step.label, value: object?.ref };
        }
        if (step.payment) {
            const p = flow.payment ? flow.payment(object) : { sub: "", done: false };
            return { key: step.key, kind: "payment", label: step.label, value: p.sub, done: p.done };
        }
        const matchTypes = step.match || [step.key];
        const found = links.filter((l) => matchTypes.includes(l.type));
        if (found.length > 0) {
            const first = found[0];
            const extra = found.length > 1 ? ` +${found.length - 1}` : "";
            return {
                key: step.key,
                kind: "present",
                label: step.label,
                value: `${first.ref || `#${first.id}`}${extra}`,
                onClick: step.route ? () => navigate(`${step.route}/${first.id}`) : undefined,
            };
        }
        return { key: step.key, kind: "absent", label: step.label };
    });

    return (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border-b border-soft-border overflow-x-auto">
            {nodes.map((n, i) => (
                <div key={n.key} className="flex items-center gap-2 shrink-0">
                    {i > 0 && <FaChevronRight className="text-[11px] text-soft-text/50 shrink-0" />}
                    <StepNode {...n} />
                </div>
            ))}
        </div>
    );
};
