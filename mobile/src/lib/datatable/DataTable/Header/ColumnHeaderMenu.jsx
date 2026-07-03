import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
    FaArrowLeft,
    FaArrowRight,
    FaArrowRightArrowLeft,
    FaArrowsLeftRight,
    FaCheck,
    FaEyeSlash,
    FaSliders,
    FaSortDown,
    FaSortUp,
} from "react-icons/fa6";

// Right-click context menu on a column header (desktop only). Gives explicit,
// reliable alternatives to drag/click for every column operation:
//   Tri       -> croissant / decroissant / retirer
//   Ordre     -> deplacer a gauche / a droite
//   Largeur   -> ajuster au contenu / elargir / retrecir / reinitialiser
//   Affichage -> masquer / configurer les colonnes...
//
// Positioned at the cursor, clamped to the viewport, closes on outside click,
// Escape, scroll, or after any action. Overlay -> shadow-lg is allowed here
// (cf .claude/CLAUDE.md UI conventions, overlays detach from the background).

const Item = ({ icon: Icon, label, onClick, disabled, active }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`w-full flex items-center gap-2 px-3 h-[28px] text-left text-[12px] rounded
            ${disabled ? "text-gray-300 cursor-default" : "text-gray-700 hover:bg-gray-100 cursor-pointer"}`}
    >
        <span className="w-3 shrink-0 text-[11px] text-gray-400">
            {Icon ? <Icon /> : null}
        </span>
        <span className="flex-1 truncate">{label}</span>
        {active && <FaCheck className="text-[10px] text-primary shrink-0" />}
    </button>
);

const Sep = () => <div className="my-1 border-t border-gray-100" />;

const SectionLabel = ({ children }) => (
    <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
        {children}
    </div>
);

export const ColumnHeaderMenu = ({
    column,
    x,
    y,
    isSortable,
    sortActive,
    sortOrder,
    canMoveLeft,
    canMoveRight,
    canHide,
    onSortAsc,
    onSortDesc,
    onSortClear,
    onMoveLeft,
    onMoveRight,
    onAutoFit,
    onWiden,
    onNarrow,
    onResetWidth,
    onHide,
    onConfigure,
    onClose,
}) => {
    const ref = useRef(null);
    const [pos, setPos] = useState({ left: x, top: y });

    // Clamp inside the viewport once the menu is measured.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        const pad = 8;
        const left = Math.min(x, window.innerWidth - width - pad);
        const top = Math.min(y, window.innerHeight - height - pad);
        setPos({ left: Math.max(pad, left), top: Math.max(pad, top) });
    }, [x, y]);

    useEffect(() => {
        const onDocDown = (e) => {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        };
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("mousedown", onDocDown);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onClose, true);
        window.addEventListener("resize", onClose);
        return () => {
            document.removeEventListener("mousedown", onDocDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onClose, true);
            window.removeEventListener("resize", onClose);
        };
    }, [onClose]);

    const run = (fn) => () => { fn?.(); onClose(); };

    return (
        <div
            ref={ref}
            role="menu"
            className="fixed z-50 min-w-[210px] py-1 bg-white border border-gray-200 rounded-lg shadow-lg"
            style={{ left: pos.left, top: pos.top }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="px-3 pb-1 text-[12px] font-semibold text-gray-800 truncate border-b border-gray-100 mb-1">
                {column.label}
            </div>

            {isSortable && (
                <>
                    <SectionLabel>Tri</SectionLabel>
                    <Item
                        icon={FaSortUp}
                        label="Tri croissant"
                        active={sortActive && sortOrder === "asc"}
                        onClick={run(onSortAsc)}
                    />
                    <Item
                        icon={FaSortDown}
                        label="Tri décroissant"
                        active={sortActive && sortOrder === "desc"}
                        onClick={run(onSortDesc)}
                    />
                    <Item
                        label="Retirer le tri"
                        disabled={!sortActive}
                        onClick={run(onSortClear)}
                    />
                    <Sep />
                </>
            )}

            <SectionLabel>Ordre</SectionLabel>
            <Item
                icon={FaArrowLeft}
                label="Déplacer à gauche"
                disabled={!canMoveLeft}
                onClick={run(onMoveLeft)}
            />
            <Item
                icon={FaArrowRight}
                label="Déplacer à droite"
                disabled={!canMoveRight}
                onClick={run(onMoveRight)}
            />
            <Sep />

            <SectionLabel>Largeur</SectionLabel>
            <Item icon={FaArrowsLeftRight} label="Ajuster au contenu" onClick={run(onAutoFit)} />
            <Item icon={FaArrowRightArrowLeft} label="Élargir" onClick={run(onWiden)} />
            <Item icon={FaArrowRightArrowLeft} label="Rétrécir" onClick={run(onNarrow)} />
            <Item label="Réinitialiser la largeur" onClick={run(onResetWidth)} />
            <Sep />

            <SectionLabel>Affichage</SectionLabel>
            <Item
                icon={FaEyeSlash}
                label="Masquer cette colonne"
                disabled={!canHide}
                onClick={run(onHide)}
            />
            <Item icon={FaSliders} label="Configurer les colonnes..." onClick={run(onConfigure)} />
        </div>
    );
};
