// Tri-state boolean: empty (= all) | "1" (= yes) | "0" (= no).

export const BooleanFilter = ({ value, onChange, onSubmit }) => {
    return (
        <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }}
            className="w-full h-[24px] px-1 text-[12px] border-0 border-b border-gray-200 bg-transparent focus:outline-none focus:border-primary"
        >
            <option value="">Tous</option>
            <option value="1">Oui</option>
            <option value="0">Non</option>
        </select>
    );
};
