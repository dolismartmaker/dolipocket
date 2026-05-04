// Dolibarr-style minimal filter: no full border, only a faint bottom line
// inherited from the row. The input is transparent on focus the bottom
// underline turns to the primary color.
export const TextFilter = ({ value, onChange, onSubmit, placeholder }) => {
    return (
        <input
            type="text"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }}
            placeholder={placeholder}
            className="w-full h-[24px] px-1 text-[12px] border-0 border-b border-gray-200 bg-transparent focus:outline-none focus:border-primary"
        />
    );
};
