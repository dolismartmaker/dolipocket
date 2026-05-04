import { FaAnglesLeft, FaAngleLeft, FaAngleRight, FaAnglesRight } from "react-icons/fa6";

const buildPageList = (current, totalPages) => {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = new Set([1, 2, totalPages - 1, totalPages, current - 1, current, current + 1]);
    const ordered = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    const result = [];
    for (let i = 0; i < ordered.length; i++) {
        if (i > 0 && ordered[i] - ordered[i - 1] > 1) result.push("...");
        result.push(ordered[i]);
    }
    return result;
};

export const Footer = ({
    page,
    pageSize,
    pageSizeOptions,
    onPageSizeChange,
    total,
    onPageChange,
}) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const end = Math.min(safePage * pageSize, total);
    const pages = buildPageList(safePage, totalPages);

    return (
        <div className="shrink-0 flex items-center justify-between flex-wrap gap-3 px-2 py-2 text-[12px] text-gray-700 border-t border-gray-200 bg-white">
            <div>
                {total === 0
                    ? "Aucun résultat"
                    : `Affichage ${start}-${end} sur ${total}`}
            </div>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => onPageChange(1)}
                    disabled={safePage <= 1}
                    className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    aria-label="Première page"
                >
                    <FaAnglesLeft className="text-[11px]" />
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(safePage - 1)}
                    disabled={safePage <= 1}
                    className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    aria-label="Page précédente"
                >
                    <FaAngleLeft className="text-[11px]" />
                </button>
                {pages.map((p, idx) => p === "..." ? (
                    <span key={`g${idx}`} className="px-1 text-gray-400">...</span>
                ) : (
                    <button
                        key={p}
                        type="button"
                        onClick={() => onPageChange(p)}
                        className={`px-2 py-0.5 rounded border text-[12px] ${p === safePage ? "bg-primary text-white border-primary" : "border-gray-200 hover:bg-gray-50"}`}
                    >
                        {p}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => onPageChange(safePage + 1)}
                    disabled={safePage >= totalPages}
                    className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    aria-label="Page suivante"
                >
                    <FaAngleRight className="text-[11px]" />
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(totalPages)}
                    disabled={safePage >= totalPages}
                    className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    aria-label="Dernière page"
                >
                    <FaAnglesRight className="text-[11px]" />
                </button>
            </div>
            <div className="flex items-center gap-2">
                <label className="text-[12px] text-gray-600" htmlFor="dt-page-size">Par page</label>
                <select
                    id="dt-page-size"
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="h-[26px] px-1 text-[12px] border border-gray-200 rounded bg-white"
                >
                    {(pageSizeOptions ?? [25, 50, 100]).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            </div>
        </div>
    );
};
