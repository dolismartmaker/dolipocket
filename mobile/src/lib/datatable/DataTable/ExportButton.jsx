import { useEffect, useRef, useState } from "react";
import { FaFileExport, FaCaretDown } from "react-icons/fa6";

// Split export button for the DataTable toolbar.
//
// Left segment  = one-click export in the default format (ODS).
// Right segment = a small caret opening a menu to pick the format
//                 (ODS default, CSV, XLS).
//
// The export itself is WYSIWYG (current page rows + visible columns) and is
// delegated to the parent via onExport(format) -- same helper the bulk
// "Exporter" action already uses.

const FORMATS = [
    { key: "ods", label: "ODS (défaut)" },
    { key: "csv", label: "CSV" },
    { key: "xls", label: "XLS" },
];

export const ExportButton = ({ onExport, defaultFormat = "ods" }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Close the menu on any outside click.
    useEffect(() => {
        if (!open) return undefined;
        const onDocDown = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocDown);
        return () => document.removeEventListener("mousedown", onDocDown);
    }, [open]);

    const pick = (fmt) => {
        setOpen(false);
        onExport?.(fmt);
    };

    return (
        <div ref={ref} className="relative flex items-stretch">
            <button
                type="button"
                onClick={() => pick(defaultFormat)}
                className="h-[26px] pl-3 pr-2 rounded-l text-[12px] flex items-center gap-1 bg-white border border-gray-200 hover:bg-gray-50"
                title="Exporter la page courante (ODS)"
            >
                <FaFileExport className="text-[11px]" />
                <span>Export</span>
            </button>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="h-[26px] px-1.5 rounded-r text-[12px] flex items-center bg-white border border-l-0 border-gray-200 hover:bg-gray-50"
                aria-haspopup="menu"
                aria-expanded={open}
                title="Choisir le format d'export"
                aria-label="Choisir le format d'export"
            >
                <FaCaretDown className="text-[10px]" />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 top-[30px] z-20 min-w-[140px] bg-white border border-gray-200 rounded-md shadow-lg py-1"
                >
                    {FORMATS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            role="menuitem"
                            onClick={() => pick(f.key)}
                            className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50"
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
