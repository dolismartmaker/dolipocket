import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";

import { appConfig } from "../../../appConfig";

/**
 * AnimationLayout - Gère les transitions animées entre pages
 *
 * Peut être utilisé de deux façons:
 * 1. Comme layout dans le Router (avec Outlet):
 *    <Route element={<AnimationLayout />}>
 *        <Route path="/" element={<HomePage />} />
 *    </Route>
 *
 * 2. Comme wrapper direct avec children:
 *    <AnimationLayout prevPathname={location?.state?.prevPathname}>
 *        <Page>...</Page>
 *    </AnimationLayout>
 */
export const AnimationLayout = ({ prevPathname, children } = {}) => {
  const location = useLocation();

  const { animations = {}, pages = {} } = appConfig?.pages ?? {};

  const animation = () => {
    const page = pages[location?.pathname];
    if (page) {
      if (typeof page === "string") {
        return page;
      } else {
        const prevPage = page[prevPathname];
        return prevPage || page["*"] || "fade";
      }
    } else {
      const defaultPage = pages["*"];
      if (typeof defaultPage === "string") {
        return defaultPage;
      } else {
        const prevPage = defaultPage?.[prevPathname];
        return prevPage || defaultPage?.["*"] || "fade";
      }
    }
  };

  // Pre-2026-05-04 this used `fixed inset-0`, which made every page render
  // on top of the viewport (z-auto) and get visually masked by the AppShell
  // sticky TopBar (z-20) and Sidebar (z-30). The fix is to render in the
  // natural flow of the parent (the AppShell <main>), so the chrome stays
  // visible by being a sibling rather than fighting for z-stack with us.
  // Framer-motion transitions (fade, slideLeft, slideRight, zoom) keep
  // working since they only animate opacity/transform, not positioning.
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        className="h-full w-full"
        { ...animations[animation()]}
      >
        {children || <Outlet />}
      </motion.div>
    </AnimatePresence>
  );
};
