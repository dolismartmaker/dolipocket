import { BsArrowRight } from "react-icons/bs";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useEffect } from "react";
import {
    FaBolt, FaFileInvoiceDollar, FaFileLines, FaBoxesStacked,
    FaUsers, FaDiagramProject, FaCalendarDays,
} from "react-icons/fa6";
import { LuServer, LuShieldCheck } from "react-icons/lu";

import { Input, Boolean, Button, useStates, Page, useApi, Select, isEmpty } from "@cap-rel/smartcommon";

import { API_ABORT_TIMEOUT, APP_NAME, API_HOST, APP_LOGO, labelsWithFallback } from "src/utils";
import { defaultSettings, setLastSettings, updateUser } from "src/global-state";
import { AnimationLayout } from "src/components/layouts";
import dolipocketLogo from "src/assets/images/icon.png";
import { useUsersServices } from "src/db";

// Feature tiles advertised on the desktop hero. Labels resolved via i18n
// (login-page.hero.modules.*). Order matters: the first three also seed the
// floating decorative cards.
const HERO_MODULES = [
    { key: "invoices", icon: FaFileInvoiceDollar },
    { key: "proposals", icon: FaFileLines },
    { key: "stock", icon: FaBoxesStacked },
    { key: "thirdparties", icon: FaUsers },
    { key: "projects", icon: FaDiagramProject },
    { key: "agenda", icon: FaCalendarDays },
];

export const LoginPage = () => {
    const { t } = useTranslation(undefined, { keyPrefix: 'login-page' });

    // useStates is a hook based on useState (see React docs).
    // It allows you to have one update function (set) which works with a path (see use cases below)
    const { states, set } = useStates({
        loginData: {
            email: "",
            password: "",
            entity: "",
            rememberMe: false
        },

        isLoggingIn: false,

        isGettingEntities: false,
        entities: [],

        isFormSubmitted: false,
        formErrors: {},

        logoError: false
    });

    const { loginData, isLoggingIn, entities, isGettingEntities, isFormSubmitted, formErrors, logoError } = states ?? {};

    const { email, password, entity, rememberMe } = loginData ?? {};

    const location = useLocation();
    const navigate = useNavigate();

    const api = useApi();
    const { getEntities, login } = api;
    const user = api?.user;

    const { getUser, saveUser } = useUsersServices();

    const dispatch = useDispatch();

    // Navigate to home when user becomes authenticated
    useEffect(() => {
        if (user) {
            navigate("/", { replace: true });
        }
    }, [user, navigate]);

    useEffect(() => {
        let cancelled = false;

        set("isGettingEntities", true);
        getEntities({ signal: AbortSignal.timeout(API_ABORT_TIMEOUT) })
            .then((data) => {
                if (cancelled) return;
                console.log("GET 'login' success");
                set("entities", data?.entities);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("GET 'login' error");
                console.error(err);

                switch (err.name) {
                    case "AbortError": toast.error(t("entities-get.toasts.abort-error")); break;
                    default: toast.error(t("entities-get.toasts.default-error")); break;
                }
            })
            .finally(() => {
                if (!cancelled) set("isGettingEntities", false);
            });

        return () => { cancelled = true; };
    }, []);

    const handleFormErrorsOnChange = (error, value) => {
        set(`formErrors.${error}`, value);
    };

    const handleLoginButtonOnClick = () => {
        set("isFormSubmitted", true);
        if (!Object.values(formErrors ?? {}).some(error => error)) {
            set("isLoggingIn", true);
            setTimeout(() => {
                login({ ...loginData, entity: entity || undefined }, { signal: AbortSignal.timeout(API_ABORT_TIMEOUT) })
                    .then(data => {
                        console.log("POST 'login' success");

                        const { username, id } = data ?? {};

                        getUser(id)
                            .then(existingUser => {
                                console.log("hey");
                                let newUser = {
                                    ...data,
                                    settings: defaultSettings
                                }

                                if (existingUser) {
                                    const settings = { ...existingUser.settings };

                                    newUser.settings = settings;

                                    dispatch(setLastSettings(settings));
                                }

                                saveUser(newUser);

                                dispatch(updateUser(newUser));

                            });

                        toast.success(`${t("login-post.toasts.success", { username })}`);
                        // Navigation is handled by useEffect watching api.user
                    })
                    .catch(err => {
                        console.error("POST 'login' error");
                        console.error(err);

                        switch (err.name) {
                            case "AbortError": toast.error(t("login-post.toasts.abort-error")); break;
                            default: toast.error(t("login-post.toasts.default-error")); break;
                        }
                    })
                    .finally(() => set("isLoggingIn", false));
            }, 1000);
        } else {
            toast.error(t("login-post.toasts.bad-data-error"));
        }
    };

    const isLoading = isLoggingIn || isGettingEntities;

    const inputVariant = {
        containerProps: {
            className: "flex flex-col gap-3 text-strong-text"
        },
        labelProps: {
            className: "uppercase text-soft-text font-app-bold tracking-widest text-xs mx-2"
        },
        inputContainerProps: {
            className: "bg-medium-bg p-5 inset-shadow-sm font-app-semibold outline-hidden min-w-0 placeholder-soft-text truncate rounded-2xl border-none has-[input:focus]:ring-0"
        },
        selectProps: {
            className: "bg-medium-bg text-app-base p-5 inset-shadow-sm font-app-semibold outline-hidden min-w-0 placeholder-soft-text truncate rounded-2xl border-none"
        }
    };

    const buttonVariant = {
        buttonProps: {
            className: "shadow-md flex justify-center items-center gap-app-sm active:brightness-90 duration-100 text-app-lg px-8 py-4 rounded-full uppercase tracking-wide text-app-base text-white bg-linear-to-r from-primary to-secondary"
        }
    };

    const formProps = {
        onError: handleFormErrorsOnChange,
        formSubmitted: isFormSubmitted
    };


    const hasCompanyLogo = APP_LOGO && !logoError;

    return (
        <AnimationLayout prevPathname={location?.state?.prevPathname}>
        <Page
            responsive={false}
            pageProps={{ className: "bg-soft-bg text-app-sm lg:h-screen lg:overflow-hidden" }}
            contentProps={{ className: "lg:max-w-none lg:mx-0 lg:grid-cols-1 lg:gap-0 lg:flex lg:h-screen" }}
        >
                {/* ================= HERO (immersive, desktop-rich) ================= */}
                <section className="login-hero relative flex flex-col justify-between overflow-hidden px-8 pt-12 pb-10 text-white lg:flex-1 lg:min-w-0 lg:p-14">
                    {/* animated aurora background */}
                    <div className="login-aurora" aria-hidden="true" />

                    {/* floating decorative module cards (desktop only) */}
                    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
                        {HERO_MODULES.slice(0, 3).map((m, i) => {
                            const Icon = m.icon;
                            const pos = [
                                "right-16 top-28",
                                "right-40 top-1/2",
                                "right-20 bottom-40",
                            ][i];
                            return (
                                <div
                                    key={m.key}
                                    className={`login-float login-float-${i + 1} absolute ${pos} w-48 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-xl backdrop-blur-md`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="grid size-10 place-items-center rounded-xl bg-white/15 text-app-lg">
                                            <Icon />
                                        </span>
                                        <div className="min-w-0">
                                            <div className="truncate text-app-sm font-app-semibold">
                                                {t(`hero.modules.${m.key}`)}
                                            </div>
                                            <div className="mt-1.5 h-1 w-16 rounded-full bg-white/25" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* bottom wave */}
                    <svg
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-white/10"
                        viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true"
                    >
                        <path fill="currentColor" d="M0,64L60,58.7C120,53,240,43,360,48C480,53,600,75,720,80C840,85,960,75,1080,64C1140,58.7,1170,53,1185,50.7L1200,48L1200,120L0,120Z" />
                    </svg>

                    {/* product signature (top) */}
                    <div className="relative z-10 flex items-center gap-2.5">
                        <img src={dolipocketLogo} alt="" className="h-10 w-10 rounded-xl bg-white/90 object-contain p-0.5" />
                        <span className="text-app-lg font-app-bold tracking-tight">{APP_NAME}</span>
                    </div>

                    {/* headline */}
                    <div className="relative z-10 max-w-lg">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-app-xxs font-app-bold uppercase tracking-widest backdrop-blur-sm">
                            <FaBolt /> {t("hero.badge")}
                        </div>
                        <h1 className="mt-5 text-app-3xl font-app-bold leading-[1.1] lg:text-app-5xl">
                            {t("hero.title")}
                        </h1>
                        <p className="mt-4 max-w-md text-app-md text-white/80">
                            {t("hero.subtitle")}
                        </p>
                        <div className="mt-6 flex flex-wrap gap-2">
                            {HERO_MODULES.map((m) => {
                                const Icon = m.icon;
                                return (
                                    <span
                                        key={m.key}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-app-xs font-app-semibold backdrop-blur-sm"
                                    >
                                        <Icon className="text-white/80" /> {t(`hero.modules.${m.key}`)}
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* server + trust badge (bottom, desktop) */}
                    <div className="relative z-10 hidden lg:flex lg:flex-col lg:gap-3">
                        <div className="flex w-fit items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                            <LuServer className="shrink-0 text-app-xl" />
                            <div className="min-w-0">
                                <div className="text-app-xxs uppercase tracking-widest text-white/70">
                                    {t("hero.server-label")}
                                </div>
                                <div className="truncate font-app-semibold">{API_HOST || "-"}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-app-xs text-white/70">
                            <LuShieldCheck className="shrink-0" />
                            <span>{t("hero.secure")}</span>
                        </div>
                    </div>
                </section>

                {/* ================= FORM PANEL ================= */}
                <section className="relative z-10 flex w-full flex-col justify-center gap-6 bg-soft-bg p-8 lg:w-[440px] lg:shrink-0 lg:overflow-y-auto lg:p-12">
                    {/* brand lockup: company logo + Dolipocket badge, or Dolipocket logo alone */}
                    {hasCompanyLogo ? (
                        <div className="flex flex-col items-start gap-2.5">
                            <span className="grid h-16 place-items-center rounded-2xl border border-soft-border bg-white px-3">
                                <img
                                    src={APP_LOGO}
                                    alt={APP_NAME}
                                    className="max-h-10 w-auto object-contain"
                                    onError={() => set("logoError", true)}
                                />
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-medium-bg px-2.5 py-1 text-app-xxs font-app-semibold text-soft-text">
                                <img src={dolipocketLogo} alt="" className="h-4 w-4 object-contain" />
                                {t("powered-by")}
                            </span>
                        </div>
                    ) : (
                        <img src={dolipocketLogo} alt={APP_NAME} className="h-16 w-auto object-contain" />
                    )}

                    <div>
                        <h2 className="text-app-2xl font-app-bold tracking-tight text-strong-text">
                            {t("title")}
                        </h2>
                        <p className="mt-1 text-app-sm text-soft-text">{t("form-subtitle")}</p>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); handleLoginButtonOnClick(); }} className="flex flex-col gap-6">
                    <Input
                        id="login-email-input"
                        required
                        readOnly={isLoading}
                        onChange={value => set("loginData.email", value)}
                        value={email}
                        maxLength={50}
                        label={t("email-input.label")}
                        placeholder={t("email-input.placeholder")}
                        variant={inputVariant}
                        inputProps={{ maxLength: 50, autoCapitalize: "off", autoCorrect: "off", autoComplete: "email" }}
                        { ...formProps}
                    />
                    <Input
                        id="login-password-input"
                        required
                        readOnly={isLoading}
                        onChange={value => set("loginData.password", value)}
                        value={password}
                        type={`password`}
                        label={t("password-input.label")}
                        maxLength={128}
                        placeholder={t("password-input.placeholder")}
                        variant={inputVariant}
                        PasswordButton={{ type: "button" }}
                        inputProps={{ maxLength: 128 }}
                        { ...formProps}
                    />
                    {!isEmpty(entities) &&
                        <Select
                            id="login-entity-select"
                            labels={labelsWithFallback("Select")}
                            required={!isEmpty(entities)}
                            readOnly={isLoading}
                            onChange={value => set("loginData.entity", value)}
                            value={entity}
                            label={t("entity-select.label")}
                            placeholder={t("entity-select.placeholder")}
                            options={entities.map(({ id, label }) => ({ label, value: id }))}
                            variant={inputVariant}
                            { ...formProps}
                        />
                    }
                    <Boolean
                        id="login-remember-me-boolean"
                        labels={labelsWithFallback("Boolean")}
                        label={t("remember-me-boolean.label")}
                        readOnly={isLoading}
                        type={`checkbox`}
                        value={rememberMe}
                        onChange={value => set("loginData.rememberMe", value)}
                        containerProps={{ className: `flex-row-reverse justify-end gap-app-sm` }}
                        checkboxProps={{ className: `${!rememberMe && "bg-[#f7f8fc]"}` }}
                        labelProps={{ className: "uppercase text-soft-text font-app-bold tracking-widest text-app-xxs" }}
                        { ...formProps}
                    />

                    <Button
                        label={t("login-button")}
                        icon={BsArrowRight}
                        loading={isLoggingIn}
                        disabled={isGettingEntities}
                        onClick={handleLoginButtonOnClick}
                        buttonProps={{ className: "flex-row-reverse text-app-md uppercase tracking-widest font-app-base rounded-app-xl" }}
                        iconProps={{ className: "text-app-xl" }}
                        variant={buttonVariant}
                    />
                    </form>

                    <div className="flex items-center justify-between gap-4 text-app-sm">
                        <Link
                            to={!isLoggingIn && "/register"}
                            className="font-app-semibold text-soft-text hover:text-strong-text hover:underline active:underline duration-100"
                        >
                            {t("register-link")}
                        </Link>
                        <Link
                            to={!isLoggingIn && "/forgot-password"}
                            className="font-app-semibold text-secondary hover:underline active:underline duration-100"
                        >
                            {t("forgot-password-link")}
                        </Link>
                    </div>

                    {/* server identity, shown on mobile where the hero badge is hidden */}
                    <div className="flex items-center justify-center gap-2 border-t border-soft-border pt-4 text-app-xs text-soft-text lg:hidden">
                        <LuServer className="shrink-0" />
                        <span className="truncate">{API_HOST || "-"}</span>
                    </div>
                </section>
            </Page>
        </AnimationLayout>
    );
};