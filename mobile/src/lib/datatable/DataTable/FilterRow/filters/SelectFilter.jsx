import { useEffect, useState } from "react";

// Select filter. Options can be a static array of {value, label} or an
// async fetcher returning that array.

export const SelectFilter = ({ value, onChange, onSubmit, options }) => {
    const [items, setItems] = useState(Array.isArray(options) ? options : []);
    const [loading, setLoading] = useState(typeof options === "function");

    useEffect(() => {
        let cancelled = false;
        if (typeof options === "function") {
            setLoading(true);
            Promise.resolve()
                .then(() => options())
                .then((res) => {
                    if (cancelled) return;
                    setItems(Array.isArray(res) ? res : []);
                })
                .catch((err) => {
                    if (cancelled) return;
                    console.error("[DataTable] SelectFilter options error", err);
                    setItems([]);
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        } else if (Array.isArray(options)) {
            setItems(options);
        }
        return () => { cancelled = true; };
    }, [options]);

    return (
        <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }}
            className="w-full h-[24px] px-1 text-[12px] border-0 border-b border-gray-200 bg-transparent focus:outline-none focus:border-primary"
            disabled={loading}
        >
            <option value="">{loading ? "Chargement..." : "Tous"}</option>
            {items.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
            ))}
        </select>
    );
};
