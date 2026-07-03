import { formatCompact, formatCurrency } from "./format";

// In-house CSS bar chart for the turnover (CA) by year. No charting dependency
// (keeps the PWA bundle lean). Each column height is proportional to the max
// value of the series; the full amount is exposed on hover via title.
//
// Props:
//   data      Array<{ year, ttc, count }> (ascending years).
//   currency  string, tenant currency for the hover tooltip.
//   height    number, total chart height in px (default 140).
export const CaSparkline = ({ data = [], currency = "EUR", height = 140 }) => {
    if (!Array.isArray(data) || data.length === 0) {
        return (
            <div className="px-4 py-6 text-center text-soft-text text-[12px]">
                {"Aucune donnée de chiffre d'affaires"}
            </div>
        );
    }

    const max = data.reduce((m, d) => Math.max(m, Number(d.ttc) || 0), 0) || 1;
    const usableHeight = Math.max(40, height - 28);

    return (
        <div className="flex items-end justify-around gap-2" style={{ height }}>
            {data.map((d) => {
                const ttc = Number(d.ttc) || 0;
                const barHeight = Math.max(2, Math.round((ttc / max) * usableHeight));
                return (
                    <div
                        key={d.year}
                        className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
                        title={`${d.year} : ${formatCurrency(ttc, currency)} (${d.count})`}
                    >
                        <span className="text-[10px] text-soft-text tabular-nums truncate w-full text-center">
                            {formatCompact(ttc)}
                        </span>
                        <div
                            className="w-full max-w-[44px] rounded-t bg-primary/70"
                            style={{ height: `${barHeight}px` }}
                        />
                        <span className="text-[11px] text-soft-text">{d.year}</span>
                    </div>
                );
            })}
        </div>
    );
};
