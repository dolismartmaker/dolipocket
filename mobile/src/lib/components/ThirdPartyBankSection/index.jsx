import { useEffect, useState, useCallback } from "react";
import { FaBuildingColumns, FaArrowsRotate, FaTrash, FaPlus } from "react-icons/fa6";
import toast from "react-hot-toast";

import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// "Comptes bancaires" (RIB) section displayed on the third party detail
// desktop view. Mirrors the Dolibarr bank accounts tab: it lists the bank
// accounts attached to the thirdparty (label, IBAN, BIC, bank, owner) and lets
// the user add a new one or remove an existing one.
//
// Server side: GET/POST/DELETE thirdparty/{id}/bankaccount(s) wired through
// the hook (useDbThirdParties). Each call returns the up-to-date accounts list
// so the UI stays in sync without a manual reload.
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md):
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight (p-3/p-4 max), separators via border-b
//   - hover:bg-medium-bg/50 on rows, transition-colors only.
//
// Props:
//   thirdpartyId number  Required. Dolibarr thirdparty id.
//   dataSource   object  Required. The useDbThirdParties() hook instance
//                        exposing listBankAccounts / addBankAccount /
//                        removeBankAccount.
//   className    string  Optional extra class for the outer <section>.

const EMPTY_FORM = { label: "", bank: "", iban: "", bic: "", ownerName: "" };

const inputClass =
    "h-[30px] px-2 rounded border border-soft-border text-[12px] text-strong-text bg-white placeholder:text-soft-text";

export const ThirdPartyBankSection = ({ thirdpartyId, dataSource, className = "" }) => {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(0);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    const hasClient = !!(dataSource && dataSource.listBankAccounts);

    const load = useCallback(async () => {
        if (!hasClient || !thirdpartyId) return;
        setLoading(true);
        setError(null);
        try {
            const list = await dataSource.listBankAccounts(thirdpartyId);
            setAccounts(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error("ThirdPartyBankSection.load error", err);
            setError("Erreur de chargement des comptes bancaires");
            setAccounts([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, thirdpartyId]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, thirdpartyId]);

    const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const handleAdd = async () => {
        if (!form.iban.trim() && !form.label.trim()) {
            toast.error("Renseignez au moins un libellé ou un IBAN");
            return;
        }
        setAdding(true);
        try {
            const list = await dataSource.addBankAccount(thirdpartyId, {
                label: form.label,
                bank: form.bank,
                iban: form.iban,
                bic: form.bic,
                ownerName: form.ownerName,
            });
            setAccounts(Array.isArray(list) ? list : []);
            setForm(EMPTY_FORM);
            toast.success("Compte ajouté");
        } catch (err) {
            console.error("ThirdPartyBankSection.handleAdd error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors de l'ajout du compte");
            }
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (accountId) => {
        setBusyId(accountId);
        try {
            const list = await dataSource.removeBankAccount(thirdpartyId, accountId);
            setAccounts(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error("ThirdPartyBankSection.handleRemove error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors du retrait du compte");
            }
        } finally {
            setBusyId(0);
        }
    };

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaBuildingColumns className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">Comptes bancaires</h2>
                    {!loading && (
                        <span className="text-[11px] text-soft-text">({accounts.length})</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    aria-label="Actualiser la liste"
                    title="Actualiser"
                >
                    <FaArrowsRotate className={`text-xs ${loading ? "animate-spin" : ""}`} />
                </button>
            </header>

            {error && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-[12px]">
                    {error}
                </div>
            )}

            <div className="px-2 py-1">
                {loading && accounts.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Chargement...
                    </div>
                )}

                {!loading && accounts.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Aucun compte bancaire
                    </div>
                )}

                {accounts.length > 0 && (
                    <ul className="divide-y divide-soft-border/60">
                        {accounts.map((acc) => (
                            <li
                                key={acc.id}
                                className="flex items-start gap-2 px-2 py-2 hover:bg-medium-bg/50 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-semibold text-strong-text truncate">
                                            {acc.label || "Compte"}
                                        </span>
                                        {acc.defaultRib ? (
                                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                                Par défaut
                                            </span>
                                        ) : null}
                                    </div>
                                    {acc.iban && (
                                        <div className="text-[12px] font-mono text-strong-text break-all">
                                            {acc.iban}
                                        </div>
                                    )}
                                    <div className="text-[11px] text-soft-text truncate">
                                        {[acc.bic, acc.bank, acc.ownerName].filter(Boolean).join(" · ")}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(acc.id)}
                                    disabled={busyId === acc.id}
                                    className="h-[26px] px-2 rounded text-[11px] flex items-center gap-1 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                                    title="Retirer ce compte"
                                >
                                    <FaTrash className="text-[10px]" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Add a bank account: native inputs + add button. */}
            <div className="border-t border-soft-border px-3 py-2.5 flex flex-col gap-2">
                <input
                    type="text"
                    value={form.label}
                    onChange={(e) => setField("label", e.target.value)}
                    placeholder="Libellé"
                    className={inputClass}
                />
                <input
                    type="text"
                    value={form.bank}
                    onChange={(e) => setField("bank", e.target.value)}
                    placeholder="Banque"
                    className={inputClass}
                />
                <input
                    type="text"
                    value={form.iban}
                    onChange={(e) => setField("iban", e.target.value)}
                    placeholder="IBAN"
                    className={`${inputClass} font-mono`}
                />
                <input
                    type="text"
                    value={form.bic}
                    onChange={(e) => setField("bic", e.target.value)}
                    placeholder="BIC"
                    className={`${inputClass} font-mono`}
                />
                <input
                    type="text"
                    value={form.ownerName}
                    onChange={(e) => setField("ownerName", e.target.value)}
                    placeholder="Titulaire"
                    className={inputClass}
                />

                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={adding}
                    className="h-[30px] px-3 rounded text-[12px] flex items-center justify-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    <FaPlus className="text-[11px]" />
                    <span>Ajouter le compte</span>
                </button>
            </div>
        </section>
    );
};
