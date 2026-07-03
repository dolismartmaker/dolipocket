import { useViewport } from "src/lib/viewport";

import { useProjectData } from "./useProjectData";
import { ProjectPageMobile } from "./ProjectPage.mobile";
import { ProjectPageDesktop } from "./ProjectPage.desktop";

// Viewport router for the project detail page. Data + handlers live in
// useProjectData(); the .mobile / .desktop files are pure render. Tablet falls
// back to the desktop view.
export const ProjectPage = () => {
    const data = useProjectData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ProjectPageMobile {...data} />
        : <ProjectPageDesktop {...data} />;
};

export default ProjectPage;
