// Daterange: two YYYY-MM-DD inputs side by side. Stored as {from, to}.
// Minimal Dolibarr-style: no border, only an underline inherited from the row.

export const DateRangeFilter = ({ value, onChange, onSubmit }) => {
    const v = value && typeof value === "object" ? value : {};
    const inputCls = "w-1/2 h-[24px] px-1 text-[11px] border-0 border-b border-gray-200 bg-transparent focus:outline-none focus:border-primary";
    return (
        <div className="flex gap-1 w-full">
            <input
                type="date"
                value={v.from ?? ""}
                onChange={(e) => onChange({ ...v, from: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }}
                className={inputCls}
                title="Date de début"
            />
            <input
                type="date"
                value={v.to ?? ""}
                onChange={(e) => onChange({ ...v, to: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }}
                className={inputCls}
                title="Date de fin"
            />
        </div>
    );
};
