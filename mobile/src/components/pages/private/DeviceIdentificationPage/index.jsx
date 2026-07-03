import { useDispatch, useSelector } from "react-redux";
import { MdDevices } from "react-icons/md";
import toast from "react-hot-toast";

import { Input, isEmpty, Button, useApi, useStates, Page, Checker } from "@cap-rel/smartcommon";

import { API_ABORT_TIMEOUT, labelsWithFallback } from "src/utils";
import { updateUser } from "src/global-state";
import { useTranslation } from "react-i18next";

export const DeviceIdentificationPage = () => {
    const { t } = useTranslation(undefined, { keyPrefix: 'device-identification-page' });

    const user = useSelector(state => state.auth?.user);
    const { deviceOptions } = user || {};

    const dispatch = useDispatch();

    const { identifyDevice } = useApi();

    const { states, set } = useStates({
        label: "",
        uuid: "",
        isValidatingDevice: false,
        formErrors: {},
        isFormSubmitted: false
    });

    const { label, uuid, isValidatingDevice, formErrors, isFormSubmitted } = states ?? {};

    const noUuid = uuid === "noDevice" || isEmpty(deviceOptions);

    const handleValidateButtonOnClick = () => {
        set("isFormSubmitted", true);
        const errors = { ...formErrors };
        // if (uuid !== "noDevice") {
        //     Object.keys(errors).forEach(error => {
        //         if (error.startsWith("device-label-input")) {
        //             delete errors[error];
        //         }
        //     });
        // }

        if (!Object.values(errors).some(error => error)) {
            set("isValidatingDevice", true);
            identifyDevice({ label, uuid }, { signal: AbortSignal.timeout(API_ABORT_TIMEOUT) })
                .then(() => {
                    console.log("POST 'device' success");
                    dispatch(updateUser({ deviceOptions: undefined }));
                })
                .catch(err => {
                    console.error("POST 'device' error");
                    console.error(err);

                    switch (err.name) {
                        case "AbortError": toast.error(t("devices-post.toasts.abort-error")); break;
                        default: toast.error(t("devices-post.toasts.default-error")); break;
                    }
                })
                .finally(() => set("isValidatingDevice", false));
        } else {
            toast.error(t("devices-post.toasts.bad-data-error"));
        }
    };

    const handleDeviceCheckerOnChange = (value) => {
        if (value !== "noDevice") {
            set("label", "");
        }

        set("uuid", value);
    };

    const handleLabelInputOnChange = (value) => {
        set("label", value);
    };

    const handleFormErrorsOnChange = (error, value) => {
        set(`formErrors.${error}`, value);
    };

    return (
        <Page
            id="device-identification-page"
            pageProps={{ className: "bg-medium-bg p-app-lg" }}
            contentProps={{ className: "flex flex-col gap-app-md" }}
        >
        
            <div className="flex flex-col items-center">
                <MdDevices className="text-[100px] mx-auto" />
                <div className="text-app-xl font-app-semibold">
                    {t("title")}
                </div>
            </div>

            {!isEmpty(deviceOptions)
                ? <>
                    <div className="text-justify">
                        {t("devices-description")}
                    </div>
                    <Checker
                        id="devices-checker"
                        labels={labelsWithFallback("Checker")}
                        label={t("devices-checker.label")}
                        readOnly={isValidatingDevice}
                        required={!isEmpty(deviceOptions)}
                        options={[...deviceOptions.map(({ label, uuid }) => ({ label, value: uuid })), { label: t("devices-checker.no-device-label"), value: "noDevice" }]}
                        type="radio"
                        value={uuid}
                        onChange={handleDeviceCheckerOnChange}
                        onError={handleFormErrorsOnChange}
                        formSubmitted={isFormSubmitted}
                        optionsContainerProps={{ className: "shadow-md border-none" }}
                    />
                </>
                : <>
                    <div className="text-justify">
                        {t("no-devices-description")}
                    </div>
                </>
            }

            {noUuid &&
                <Input
                    id="device-label-input"
                    label={t("no-devices-input.label")}
                    readOnly={isValidatingDevice}
                    required={noUuid}
                    help={t("no-devices-input.help")}
                    placeholder={t("no-devices-input.placeholder")}
                    value={label}
                    onChange={handleLabelInputOnChange}
                    inputContainerProps={{ className: "p-app-base shadow-md border-none has-[input:focus]:ring-0" }}
                    onError={handleFormErrorsOnChange}
                    formSubmitted={isFormSubmitted}
                />
            }
        
            <Button
                id="validate-device-button"
                label="Valider"
                loading={isValidatingDevice}
                onClick={handleValidateButtonOnClick}
                buttonProps={{ className: "text-app-md uppercase tracking-widest font-app-base rounded-app-xl" }}
            />
        </Page>
    );
};