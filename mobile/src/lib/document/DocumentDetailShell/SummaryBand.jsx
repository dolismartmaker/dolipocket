import { useNavigate } from "react-router-dom";

import { fmtMoney, initialsOf } from "./format";

// "Qui / quand / combien" context band shown right under the command bar and
// kept always-visible (the body scrolls beneath it). The differentiating
// touch vs the old layout: the real thirdparty name (clickable to its sheet)
// + the big TTC amount + a payment progress gauge for invoices.
//
// config.summary contract (all accessors are pure functions of the object):
//   thirdparty(o) -> { id, name, ref, refLabel }   (ref optional, e.g. "Réf. client")
//   dates(o)      -> [{ label, value }]   (value already formatted)
//   hero(o)       -> { ttc, ht }          (numbers)
//   payment(o)    -> { paid, total, remain, isPaid } | null

const PaymentGauge = ({ payment }) => {
    const total = Number(payment.total ?? 0);
    const paid = Number(payment.paid ?? 0);
    const pct = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : (payment.isPaid ? 100 : 0);
    const done = payment.isPaid || pct >= 100;
    const barColor = done ? "bg-emerald-500" : "bg-amber-500";

    return (
        <div className="min-w-[200px]">
            <div className="h-2 w-full rounded-full bg-medium-bg overflow-hidden">
                <div className={`h-full rounded-full ${barColor} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between gap-3 mt-1 text-[11px]">
                <span className="text-soft-text">
                    payé <span className="font-medium text-strong-text">{fmtMoney(paid)}</span>
                </span>
                <span className={done ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                    {done ? "Soldée" : `reste ${fmtMoney(payment.remain)}`}
                </span>
            </div>
        </div>
    );
};

export const SummaryBand = ({ config, object }) => {
    const navigate = useNavigate();
    const sum = config.summary || {};

    const tp = sum.thirdparty ? sum.thirdparty(object) : null;
    const dates = sum.dates ? sum.dates(object).filter((d) => d && d.value) : [];
    const hero = sum.hero ? sum.hero(object) : null;
    const payment = sum.payment ? sum.payment(object) : null;

    const tpName = tp?.name || (tp?.id ? `#${tp.id}` : "-");
    const canOpenTp = !!tp?.id;

    return (
        <div className="shrink-0 flex items-center gap-5 px-4 py-2.5 bg-white border-b border-soft-border">
            {/* Thirdparty identity */}
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[12px] font-bold">
                    {initialsOf(tp?.name)}
                </div>
                <div className="min-w-0">
                    <button
                        type="button"
                        disabled={!canOpenTp}
                        onClick={() => canOpenTp && navigate(`/thirdparties/${tp.id}`)}
                        className={`block max-w-[220px] truncate text-sm font-semibold text-left ${canOpenTp ? "text-strong-text hover:text-primary transition-colors" : "text-strong-text cursor-default"}`}
                        title={tpName}
                    >
                        {tpName}
                    </button>
                    {tp?.ref && (
                        <div className="text-[11px] text-soft-text truncate">{tp.refLabel || "Réf."} : {tp.ref}</div>
                    )}
                </div>
            </div>

            {/* Key dates */}
            {dates.length > 0 && (
                <div className="flex items-center gap-5 pl-5 border-l border-soft-border">
                    {dates.map((d, i) => (
                        <div key={i} className="leading-tight">
                            <div className="text-[10px] uppercase tracking-wider text-soft-text">{d.label}</div>
                            <div className="text-[13px] font-medium text-strong-text">{d.value}</div>
                        </div>
                    ))}
                </div>
            )}

            <span className="flex-1" />

            {/* Payment gauge (invoices) */}
            {payment && <PaymentGauge payment={payment} />}

            {/* Hero total */}
            {hero && (
                <div className="text-right pl-5 border-l border-soft-border">
                    <div className="text-[10px] uppercase tracking-wider text-soft-text">Total TTC</div>
                    <div className="text-lg font-bold text-strong-text leading-tight">{fmtMoney(hero.ttc)}</div>
                    <div className="text-[11px] text-soft-text">HT {fmtMoney(hero.ht)}</div>
                </div>
            )}
        </div>
    );
};
