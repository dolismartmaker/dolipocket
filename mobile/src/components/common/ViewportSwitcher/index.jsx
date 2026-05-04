import { FaCheck, FaDesktop, FaMobileScreen, FaWandMagicSparkles } from "react-icons/fa6";

import { useViewport } from "src/lib/viewport";

// Three radio-like options. We use the same component in two contexts:
// - desktop dropdown attached to the email in TopBar (`density="compact"`)
// - mobile MoreMenu footer (`density="comfortable"`)
//
// Selecting an option already triggers a confirm() + reload() inside
// setPreference(), so we don't need a "Save" button here.
const OPTIONS = [
    { value: "auto",    label: "Automatique", icon: FaWandMagicSparkles, hint: "Selon la taille de l'écran" },
    { value: "desktop", label: "Bureau",      icon: FaDesktop,           hint: "Forcer la vue ordinateur" },
    { value: "mobile",  label: "Mobile",      icon: FaMobileScreen,      hint: "Forcer la vue smartphone" },
];

export const ViewportSwitcher = ({ density = "comfortable", onAfterSelect }) => {
    const { preference, setPreference } = useViewport();

    const isCompact = density === "compact";

    const handleClick = (value) => {
        // setPreference triggers its own confirm + reload. If the user cancels,
        // we still close the parent menu so they don't have to fight with two
        // overlays. The reload (if confirmed) will unmount everything anyway.
        setPreference(value);
        if (typeof onAfterSelect === "function") onAfterSelect();
    };

    return (
        <div className="flex flex-col">
            {!isCompact && (
                <div className="uppercase text-soft-text font-app-bold tracking-widest text-[10px] mb-app-xxs px-1">
                    Vue
                </div>
            )}
            {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = preference === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleClick(opt.value)}
                        className={
                            isCompact
                                ? `flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                                      active ? "bg-primary/10 text-primary" : "text-strong-text hover:bg-medium-bg"
                                  }`
                                : `flex items-center gap-app-sm py-2.5 px-app-xs rounded-lg active:bg-medium-bg transition-colors duration-100 ${
                                      active ? "bg-primary/10 text-primary" : "text-strong-text"
                                  }`
                        }
                    >
                        <Icon className={isCompact ? "text-base shrink-0" : "text-base w-5 shrink-0"} />
                        <div className="flex-1 min-w-0">
                            <div className={isCompact ? "leading-tight" : "text-app-base leading-tight"}>
                                {opt.label}
                            </div>
                            {!isCompact && (
                                <div className="text-[11px] text-soft-text leading-tight mt-0.5">
                                    {opt.hint}
                                </div>
                            )}
                        </div>
                        {active && (
                            <FaCheck className={isCompact ? "text-xs shrink-0" : "text-sm shrink-0"} />
                        )}
                    </button>
                );
            })}
        </div>
    );
};
