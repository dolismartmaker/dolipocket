import { BsArrowRight } from "react-icons/bs";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useEffect } from "react";
import { FaArrowLeftLong, FaUser } from "react-icons/fa6";
import { LuLogIn } from "react-icons/lu";

import { Input, Boolean, Button, useStates, Page, useApi, Select, isEmpty } from "@cap-rel/smartcommon";

import { API_ABORT_TIMEOUT, APP_VERSION, labelsWithFallback } from "src/utils";
import { defaultSettings, setLastSettings, updateUser } from "src/global-state";
import { AnimationLayout } from "src/components/layouts";
import { Waves } from "./Waves";
import { useUsersServices } from "src/db";

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
        formErrors: {}
    });

    const { loginData, isLoggingIn, entities, isGettingEntities, isFormSubmitted, formErrors } = states ?? {};

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


    return (
        <AnimationLayout prevPathname={location?.state?.prevPathname}>
        <Page
            pageProps={{ className: "bg-soft-bg text-app-sm" }}
        >
                <Link
                    to={!isLoggingIn && "/welcome"}
                    state={{ prevPathname: location.pathname }}
                    className="z-10 text-white absolute text-2xl top-4 left-4"
                >
                    <FaArrowLeftLong />
                </Link>

                <Waves />
                
                <div className={`grow flex flex-col justify-end gap-6 w-full bg-soft-bg p-8 shadow-black`}>
                    <div className="text-app-2xl mx-2 font-semibold italic tracking-wide">
                        {t("title")}
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

                    <div className="flex justify-between items-center gap-4 mx-2 italic text-sm">
                        <Link
                            to={!isLoggingIn && "/register"}
                            className="active:underline active:brightness-90 duration-100"
                        >
                            {t("register-link")}
                        </Link>
                        <Link 
                            to={!isLoggingIn && "/forgot-password"}
                            className="text-secondary active:underline active:brightness-90 duration-100"
                        >
                            {t("forgot-password-link")}
                        </Link>
                    </div>
                </div>
            </Page>
        </AnimationLayout>
    );
};