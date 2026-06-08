import { FaHandPointer } from "react-icons/fa6";

// Tablet master-detail layout (landscape, touch-first).
//
// Left pane = master list (~38%, fixed range), right pane = detail of the
// selected item (~62%). Both panes scroll independently within the fixed
// height provided by the AppShell tablet main (h-screen flex column). Tapping
// a row in the list updates the detail IN PLACE, with no route change, so the
// list keeps its scroll position and never remounts.
//
// Conventions UI epurees : border, pas de shadow, pas de double-encadrement.
//
//   <MasterDetailLayout
//       master={<TouchList ... />}
//       detail={selectedId ? <DocumentDetailPane ... /> : <EmptyDetail .../>}
//   />
export const MasterDetailLayout = ({ master, detail }) => {
    return (
        <div className="flex h-full w-full bg-medium-bg overflow-hidden">
            <div className="w-[38%] min-w-80 max-w-md shrink-0 flex flex-col bg-white border-r border-soft-border overflow-hidden">
                {master}
            </div>
            <div className="flex-1 min-w-0 overflow-y-auto">
                {detail}
            </div>
        </div>
    );
};

// Empty-state placeholder for the detail pane when nothing is selected.
export const EmptyDetail = ({ label = "Sélectionnez un élément", hint }) => {
    return (
        <div className="h-full w-full flex flex-col items-center justify-center text-center px-8 text-soft-text">
            <FaHandPointer className="text-4xl mb-3 opacity-40" />
            <div className="text-base font-medium text-medium-text">{label}</div>
            {hint && <div className="text-sm mt-1 max-w-sm">{hint}</div>}
        </div>
    );
};
