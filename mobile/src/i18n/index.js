import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";

// Multi-namespace layout : public/locales/<lng>/<ns>.json. The default
// namespace "translation" still holds the legacy app-wide strings (welcome,
// login, ...). Each business feature owns its own namespace
// (thirdparties, contacts, products, ...), aligned on PWA-GUIDELINES.md
// section 7. Add a feature namespace to the `ns` array below as soon as its
// JSON file is created in public/locales/<lng>/<feature>.json.
i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    lng: "en",
    defaultNS: "translation",
    ns: [
      "translation",
      "thirdparties",
      "documents",
      "contacts",
      "products",
      "warehouses",
      "stock",
      "supplier-orders",
      "supplier-invoices",
      "agenda",
      "proposals",
      "orders",
      "invoices",
      "shipments",
      "receptions",
      "supplier-proposals",
      "invoice-templates",
      "projects",
    ],
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
  });

export { i18n };


// {
//   "translation": {
//     "public": {
//       "loginTitle": "Connexion",
//       "registerTitle": "Créer un compte",
//       "forgotPasswordTitle": "Mot de passe oublié ?",
//       "newPasswordTitle": "Nouveau mot de passe",

//       "emailLabel": "Adresse email",
//       "passwordLabel": "Mot de passe",
//       "confirmedPasswordLabel": "Confirmer mot de passe",
//       "rememberMeLabel": "Rester connecté",

//       "loginSubmitButton": "Se connecter",
//       "registerSubmitButton": "Créer",
//       "forgotPasswordSubmitButton": "Envoyer",
//       "newPasswordSubmitButton": "Réinitialiser",

//       "loginLink": "Se connecter",
//       "registerLink": "Créer",
//       "forgotPasswordLink": "Mot de passe oublié ?",

//       "loginLinkLabel": "Déjà un compte ?",
//       "registerLinkLabel": "Pas de compte",

//       "forgotPasswordDescription": "Veuillez renseigner votre adresse email dans le champ ci-dessous. Un mail pour réinitialiser votre mot de passe vous sera envoyé.",
//       "newPasswordDescription": "",

//       "loginError": "Veuillez vérifier vos informations...",
//       "loginSuccess": "Bonjour {{user}}. Pensez à checker vos notifications.",
//       "registerError": "",
//       "registerSuccess": "",
//       "forgotPasswordError": "",
//       "forgotPasswordSuccess": "",
//       "newPasswordError": "",
//       "newPasswordSuccess": ""
//     }
//   }
// }
