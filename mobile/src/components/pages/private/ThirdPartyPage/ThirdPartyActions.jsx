import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaChevronDown, FaEnvelope } from "react-icons/fa6";

import { useMenu } from "src/lib/permissions";
import { SendEmailModal } from "src/lib/components/SendEmailModal";

// Header actions on the thirdparty fiche (desktop): a "Nouveau" dropdown that
// creates a document / contact / event pre-filled with this thirdparty (the
// create pages already read ?socid=), and an "Envoyer un email" button (free
// email to the thirdparty -- integrated send + agenda log via the backend).
//
// Each create entry is gated by the relevant permission (useMenu().has). The
// email button is always shown: the recipient defaults to the thirdparty email
// and stays editable in the modal.
export const ThirdPartyActions = ({ item, dataSource }) => {
    const navigate = useNavigate();
    const { has } = useMenu();
    const [menuOpen, setMenuOpen] = useState(false);
    const [emailOpen, setEmailOpen] = useState(false);

    const id = item?.id;

    const createItems = [
        { label: "Nouveau devis",     perm: "proposal.create", to: `/proposals/new?socid=${id}` },
        { label: "Nouvelle commande", perm: "order.create",    to: `/orders/new?socid=${id}` },
        { label: "Nouvelle facture",  perm: "invoice.create",  to: `/invoices/new?socid=${id}` },
        { label: "Nouveau contact",   perm: "contact.create",  to: `/contacts/new?socid=${id}` },
        { label: "Nouvel événement",  perm: "agenda.create",   to: `/agenda/new?socid=${id}` },
    ].filter((it) => has(it.perm));

    const handleSend = ({ to, subject, body, cc, bcc }) =>
        dataSource.sendEmail(id, { to, subject, body, cc, bcc });

    return (
        <div className="flex items-center gap-2">
            {createItems.length > 0 && (
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setMenuOpen((o) => !o)}
                        className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg transition-colors"
                    >
                        <FaPlus className="text-[10px]" />
                        <span>Nouveau</span>
                        <FaChevronDown className="text-[9px] text-soft-text" />
                    </button>
                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                            <div className="absolute right-0 mt-1 z-20 w-56 bg-white border border-soft-border rounded-md shadow-lg py-1">
                                {createItems.map((it) => (
                                    <button
                                        key={it.to}
                                        type="button"
                                        onClick={() => { setMenuOpen(false); navigate(it.to); }}
                                        className="w-full text-left px-3 py-2 text-[13px] text-strong-text hover:bg-medium-bg/60 transition-colors"
                                    >
                                        {it.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            <button
                type="button"
                onClick={() => setEmailOpen(true)}
                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg transition-colors"
            >
                <FaEnvelope className="text-[11px]" />
                <span>Envoyer un email</span>
            </button>

            <SendEmailModal
                open={emailOpen}
                onClose={() => setEmailOpen(false)}
                onSend={handleSend}
                defaultTo={item?.email || ""}
                defaultSubject=""
                defaultBody=""
                showAttachment={false}
                title={`Envoyer un email à ${item?.name || "ce tiers"}`}
            />
        </div>
    );
};
