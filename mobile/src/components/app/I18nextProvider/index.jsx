import { I18nextProvider as Provider } from "react-i18next";
import { useEffect } from "react";
import { useSelector } from "react-redux";

import { i18n } from "src/i18n";

export const I18nextProvider = (props) => {
  const { children } = props;

  const lastLang = useSelector(state => state.lastSettings?.lang);
  const actualLang = useSelector(state => state.user?.settings?.lang);

  const lang = actualLang ?? lastLang;

  useEffect(() => {
    i18n.changeLanguage(lang);
  }, [lang]);

  return (
    <Provider i18n={i18n}>
      {children}
    </Provider>
  );
};