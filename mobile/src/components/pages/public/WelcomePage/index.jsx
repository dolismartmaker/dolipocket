import { useTranslation } from "react-i18next";
import { LuLogIn } from "react-icons/lu";
import { Link, useLocation } from "react-router-dom";

import { Page, Button } from "@cap-rel/smartcommon";

import icon from "src/assets/images/icon.png";
import logo from "src/assets/images/logo.png";
import { APP_VERSION } from "src/utils";
import { AnimationLayout } from "src/components";

import { Waves } from "./Waves";

export const WelcomePage = () => {
    const { t } = useTranslation(undefined, { keyPrefix: "welcome-page" });

    const location = useLocation();

    return (
        <AnimationLayout prevPathname={location?.state?.prevPathname}>
            <Page
                pageProps={{ className: "bg-soft-bg" }}
                contentProps={{ className: "h-full flex flex-col justify-between gap-app-md" }}
            >
                <Waves />

                <div className="flex flex-col gap-4 justify-center items-center px-8">
                    <img
                        src={icon}
                        loading="lazy"
                        className="w-60"
                    />
                    <div className="flex gap-1">
                        <img
                            src={logo}
                            loading="lazy"
                            className="w-60"
                        />
                        <div className="italic text-soft-text self-end leading-none text-xs">
                            {APP_VERSION}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col justify-center gap-6 px-8 pb-8">
                    <div className="text-soft-text text-app-base text-justify">
                        {t("description")}
                    </div>
                    <Link
                        to="/login"
                        state={{ prevPathname: location.pathname }}
                    >
                        <Button
                            icon={LuLogIn}
                            label={t("button")}
                            buttonProps={{ className: "font-normal w-full flex-row-reverse shadow-md text-app-lg px-8 py-4 rounded-full uppercase tracking-wide bg-linear-to-r from-primary to-secondary" }}
                            iconProps={{ className: "text-app-xl" }}
                        />
                    </Link>
                </div>

            </Page>
        </AnimationLayout>
    );
};