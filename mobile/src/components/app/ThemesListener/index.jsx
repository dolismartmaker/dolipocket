import { useEffect } from "react";
import { useSelector } from "react-redux";

import { appConfig } from "../../../appConfig";

export const ThemesListener = () => {
    const { themes: configThemes = {} } = appConfig ?? {};
    const { th = [], publicTheme } = configThemes;

    const url = file => new URL(`../../../assets/themes/${file}.theme.css`, import.meta.url).href;

    const themes = th.reduce((acc, { name, file }) => {
        if (name && file) {
            acc = { ...acc, [name]: url(file) };
        }
        return acc;
    }, {});

    const reduxSettings = useSelector(state => state.settings?.data) ?? {};
    const { darkMode, theme } = reduxSettings;

    const html = document.documentElement;

    useEffect(() => {
        if (darkMode) {
            html.classList.add("dark");
        } else {
            html.classList.remove("dark");
        }
    }, [darkMode]);
    
    useEffect(() => {
        let link = document.getElementById("theme-style");

        if (!link) {
            link = document.createElement("link");
            link.rel = "stylesheet";
            link.id = "theme-style";
            document.head.appendChild(link);
        }
        
        link.href = publicTheme ? `/themes/${theme}.theme.css` : themes[theme];
    }, [themes, theme]);

    return null;
};