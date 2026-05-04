import { useDispatch, useSelector } from "react-redux";
import { LOCALES } from "../../../../../utils";
import { RiCloseLargeFill } from "react-icons/ri";
import { appConfig } from "../../../../../appConfig";
import { useTranslation } from "react-i18next";

export const SettingsPanel = (props) => {
    const { t } = useTranslation(undefined, { keyPrefix: 'home-pages.settings-panel' });

    const { open, close } = props;

    const { themes } = appConfig;

    const user = useSelector(state => state.user);
    const { lng, theme, darkMode, scale } = user?.settings ?? {};

    const dispatch = useDispatch();

    const handleSettingOnChange = (setting, value) => {
        // dispatch(saveSettings({ [setting]: value }));
    };

    const handleLangOnChange = (value) => {
        // setLocalJSON("lang", value);
        // dispatch(saveSettings({ lng: value }));
    };

    const Setting = (props) => {
        const { children, label, col } = props;

        return (
            <div className={`flex ${col ? "flex-col gap-3" : "gap-18 items-center"} justify-between py-4`}>
                <div className={`grow`}>
                    {label}
                </div>
                <div className={`shrink-0`}>
                    {children}
                </div>
            </div>
        );
    };

    return (
        <>
            <div 
                onClick={close}
                className={`fixed inset-0 z-20 bg-black/10 ${open ? "opacity-100" : "opacity-0 pointer-events-none"} duration-200`}
            />
            <div className={`pt-16 flex flex-col gap-6 p-8 z-30 bg-white fixed top-0 bottom-0 right-0 ${open ? "translate-x-0" : "translate-x-full"} duration-300`}>
                <button
                    onClick={close}
                    className="text-soft-text text-2xl absolute top-2 right-2 p-2 bg-white rounded-full active:brightness-90 duration-100"
                >
                    <RiCloseLargeFill />
                </button>
                <div className="font-semibold text-xl">
                    {t("title")}
                </div>
                <div className="divide-y divide-border flex flex-col">
                    <Setting label={t("lang-setting.label")}>
                        <select
                            value={lng}
                            onChange={e => handleSettingOnChange("lng", e.target.value)}
                            className="font-semibold bg-strong-bg p-2 rounded-xl active:brightness-90 duration-100 inset-shadow-sm"
                        >
                            {LOCALES.map((locale, LI) => 
                                <option key={`locale${LI}`} value={locale}>{locale}</option>
                            )}
                        </select>
                    </Setting>
                    {/* <Setting label="Pays">
                        <div className={`font-app-semibold`}>
                            {country}
                        </div>
                    </Setting> */}
                    <Setting label={t("theme-setting.label")}>
                        <select
                            value={theme}
                            onChange={e => handleSettingOnChange("theme", e.target.value)}
                            className="font-semibold bg-strong-bg p-2 rounded-xl active:brightness-90 duration-100 inset-shadow-sm"
                        >
                            {(themes.th ?? []).map(({ name }, TI) => {
                                return (
                                    <option key={`theme${TI}`} value={name}>{name}</option>
                                );
                            })}
                        </select>
                    </Setting>
                    <Setting label={t("dark-mode-setting.label")}>
                        <div className={`font-app-semibold`}>
                            <div 
                                onClick={() => handleSettingOnChange("darkMode", !darkMode)}
                                className={`${darkMode ? "bg-[#5fbabf]" : "bg-strong-bg inset-shadow-sm"} duration-200 relative rounded-full w-10 h-6`}
                            >
                                <div className={`${darkMode ? "translate-x-full" : "translate-x-0"} duration-200 rounded-full size-4 bg-white absolute left-1 top-1 bottom-1`} />
                            </div>
                        </div>
                    </Setting>
                    <Setting label={t("dark-mode-setting.label")}>
                        <div className={`font-app-semibold`}>
                            <div 
                                onClick={() => handleSettingOnChange("darkMode", !darkMode)}
                                className={`${darkMode ? "bg-[#5fbabf]" : "bg-strong-bg inset-shadow-sm"} duration-200 relative rounded-full w-10 h-6`}
                            >
                                <div className={`${darkMode ? "translate-x-full" : "translate-x-0"} duration-200 rounded-full size-4 bg-white absolute left-1 top-1 bottom-1`} />
                            </div>
                        </div>
                    </Setting>
                </div>
            </div>
        </>
    );
};