// Number range: two number inputs side by side. Stored as {min, max}.
// Minimal Dolibarr-style: no border, only an underline inherited from the row.

export const NumberRangeFilter = ({ value, onChange, onSubmit }) => {
    const v = value && typeof value === "object" ? value : {};
    const inputCls = "w-1/2 h-[24px] px-1 text-[11px] border-0 border-b border-gray-200 bg-transparent focus:outline-none focus:border-primary";
    return (
        <div className="flex gap-1 w-full">
            <input
                type="number"
                value={v.min ?? ""}
                onChange={(e) => onChange({ ...v, min: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }}
                placeholder="Min"
                className={inputCls}
            />
            <input
                type="number"
                value={v.max ?? ""}
                onChange={(e) => onChange({ ...v, max: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }}
                placeholder="Max"
                className={inputCls}
            />
        </div>
    );
};
