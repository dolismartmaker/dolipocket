import { useViewport } from "src/lib/viewport";

import { useProjectsData } from "./useProjectsData";
import { ProjectsPageMobile } from "./ProjectsPage.mobile";
import { ProjectsPageDesktop } from "./ProjectsPage.desktop";

// Viewport router. Data lives in useProjectsData(); .mobile and .desktop are
// pure render. Tablet falls back to the desktop view.
export const ProjectsPage = () => {
    const data = useProjectsData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ProjectsPageMobile {...data} />
        : <ProjectsPageDesktop {...data} />;
};

export default ProjectsPage;
