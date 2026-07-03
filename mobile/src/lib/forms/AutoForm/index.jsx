import { useEffect, useMemo, useRef, useState } from "react";

import {
    Form,
    Input,
    Textarea,
    Select,
    Boolean as BooleanField,
    Editor,
    useForm,
} from "@cap-rel/smartcommon";

import { useViewport } from "src/lib/viewport";
import { labelsWithFallback } from "src/utils";

import { objectDescToFormSchema } from "../objectDescToFormSchema";
import { FkPicker } from "../FkPicker";

// <AutoForm>
//
// Renders an edit form generated from a backend describe() endpoint that
// returns the dmTrait::objectDesc() JSON. No JSX per field is required by
// the consumer.
//
// API:
//   <AutoForm
//       describe={fn}                       // () => Promise<objectDescJSON>
//       value={initialValues}               // optional, seeds defaults (camelCase keys)
//       onChange={fn}                       // (currentValues) => void
//       onSubmit={fn}                       // optional submit handler
//       overrides={{ key: {type, label, options, formatter} }}
//       groupings={[{ id, title, keys: [...] }, ...]}
//       excludeKeys={["foo","bar"]}
//       includeKeys={["ref_client", ...]}   // optional whitelist (+ extrafields kept)
//       mode="create" | "update"            // visibility filter, default "create"
//       singleColumn                        // force a single-column field grid
//       submitLabel="Enregistrer"           // optional, hides submit if not provided
//   >
//       {(form) => <CustomFooterUsing form />}   // optional render-prop
//   </AutoForm>

const noop = () => {};

// Build a renderField closure bound to the current `form`. The smartcommon
// FormContext is internal to the bundle (not re-exported), so any field
// component that does NOT consume `useField` (here: <FkPicker>) must be
// wired explicitly against form.values + form.set.
//
// `initialValues` is required: smartcommon's useField seeds the form context
// from each field's OWN `defaultValue` prop on mount (and clobbers the slot
// with `undefined` when none is given). Passing `defaultValue` per field is
// therefore what actually populates the form -- useForm({defaultValues}) alone
// is overwritten field-by-field at mount. `value` is intentionally NOT passed
// so the field stays form-controlled (form.values remains the source of truth).
// eslint-disable-next-line react/display-name -- this is a render-helper factory, not a React component
const buildRenderField = (form, initialValues) => (field) => {
    const common = {
        key: field.id,
        name: field.id,
        label: field.label,
        required: field.required,
        readOnly: field.readOnly,
        disabled: field.disabled,
        placeholder: field.placeholder,
        defaultValue: initialValues?.[field.id],
    };

    switch (field.type) {
        case "text":
            return <Textarea {...common} rows={field.rows ?? 3} />;
        case "html":
            return <Editor {...common} />;
        case "boolean":
            return <BooleanField {...common} labels={labelsWithFallback("Boolean")} type={field.typeVariant ?? "switch"} />;
        case "select":
            // `options` for the smartcommon Select must be an array. If
            // backend has not resolved sellist FKs (e.g. payment terms), we
            // ship an empty list rather than crashing.
            return (
                <Select
                    {...common}
                    labels={labelsWithFallback("Select")}
                    multiple={field.multiple}
                    options={Array.isArray(field.options) ? field.options : []}
                />
            );
        case "fk":
            // Foreign-key picker. When the catalog ships an `fkEndpoint`
            // (Societe -> thirdparty, Contact -> contact, ...) we use the
            // generic <FkPicker> wired explicitly to the form state.
            if (field.fkEndpoint) {
                return (
                    <FkPicker
                        key={field.id}
                        label={field.label}
                        required={field.required}
                        disabled={field.disabled}
                        placeholder={field.placeholder || "Rechercher..."}
                        endpoint={field.fkEndpoint}
                        value={Number(form.values?.[field.id] ?? 0)}
                        onChange={(id) => {
                            form.set(`values.${field.id}`, Number(id) || 0);
                        }}
                    />
                );
            }
            console.warn(
                "[AutoForm] FK without known endpoint, falling back to numeric input",
                { key: field.id, target: field.fkTarget },
            );
            return <Input {...common} type="int" inputMode="numeric" />;
        case "number":
            return <Input {...common} type="int" />;
        case "email":
            return <Input {...common} type="email" />;
        case "tel":
            return <Input {...common} type="phoneNumber" />;
        case "url":
            return <Input {...common} type="url" />;
        case "password":
            return <Input {...common} type="password" />;
        case "date":
            return <Input {...common} type="date" />;
        case "datetime":
            return <Input {...common} type="datetime" />;
        case "string":
        default:
            return <Input {...common} type="varchar" />;
    }
};

export const AutoForm = (props) => {
    const {
        describe,
        value,
        onChange,
        onSubmit,
        overrides,
        groupings,
        excludeKeys,
        includeKeys,
        mode = "create",
        singleColumn = false,
        submitLabel,
        children,
    } = props;

    const [desc, setDesc] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (typeof describe !== "function") {
            console.error("[AutoForm] `describe` prop must be a function returning a Promise");
            setError(new Error("missing describe"));
            return;
        }
        const ac = new AbortController();
        let cancelled = false;
        Promise.resolve(describe({ signal: ac.signal }))
            .then((d) => {
                if (cancelled) return;
                setDesc(d);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[AutoForm] describe() failed", err);
                setError(err);
            });
        return () => {
            cancelled = true;
            ac.abort();
        };
    }, [describe]);

    const schema = useMemo(() => {
        if (!desc) return null;
        return objectDescToFormSchema(desc, { overrides, groupings, excludeKeys, includeKeys, mode });
    }, [desc, overrides, groupings, excludeKeys, includeKeys, mode]);

    // Initial values: schema defaults + seeded `value` (parent wins).
    const initialValues = useMemo(() => {
        if (!schema) return {};
        return { ...schema.defaults, ...(value ?? {}) };
    }, [schema, value]);

    if (error) {
        return (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Catalogue de champs indisponible.
            </div>
        );
    }
    if (!schema) {
        return (
            <div className="rounded-md border border-soft-border bg-white p-3 text-sm text-soft-text">
                Chargement du formulaire...
            </div>
        );
    }

    return (
        <AutoFormBody
            schema={schema}
            initialValues={initialValues}
            onChange={onChange ?? noop}
            onSubmit={onSubmit ?? noop}
            submitLabel={submitLabel}
            singleColumn={singleColumn}
        >
            {children}
        </AutoFormBody>
    );
};

// AutoFormBody is mounted only once the schema is ready so that useForm's
// initial defaultValues are stable. Otherwise re-mounting would reset state
// every time the parent passes a fresh `value` reference.
const AutoFormBody = ({ schema, initialValues, onChange, onSubmit, submitLabel, singleColumn, children }) => {
    const form = useForm({ defaultValues: initialValues });
    const renderField = buildRenderField(form, initialValues);

    // Viewport-aware field grid. The viewport is frozen for the session, so
    // these classes never change mid-session.
    //   mobile  -> single column
    //   tablet  -> two columns (landscape, larger gap, regardless of CSS width)
    //   desktop -> single column that becomes two at the md: breakpoint
    // `singleColumn` forces one column regardless of viewport: used when the
    // form is hosted in a narrow side rail (e.g. the edit page's 1/3 header
    // column) where a 2-up grid would crush the fields.
    const { isMobile, isTablet } = useViewport();
    const gridClass = singleColumn
        ? "grid-cols-1 gap-4"
        : isMobile
            ? "grid-cols-1 gap-4"
            : isTablet
                ? "grid-cols-2 gap-5"
                : "grid-cols-1 md:grid-cols-2 gap-4";
    const fullSpanClass = singleColumn ? "" : isMobile ? "" : isTablet ? "col-span-2" : "md:col-span-2";

    // Bubble form values changes to parent. Cheap deep-compare via JSON to
    // avoid spamming the parent on identity-only changes.
    const lastSerializedRef = useRef(null);
    useEffect(() => {
        const v = form.values;
        const serialized = JSON.stringify(v);
        if (serialized !== lastSerializedRef.current) {
            lastSerializedRef.current = serialized;
            onChange(v);
        }
    }, [form.values, onChange]);

    return (
        <Form form={form} onSubmit={() => onSubmit(form.values)}>
            <div className="flex flex-col gap-6">
                {schema.sections.map((section) => (
                    <section
                        key={section.id}
                        className="rounded-xl border border-soft-border bg-white overflow-hidden"
                    >
                        <header className="px-4 py-2.5 border-b border-soft-border">
                            <h2 className="text-sm font-semibold text-strong-text">{section.title}</h2>
                        </header>
                        <div className={`p-4 grid ${gridClass}`}>
                            {section.fields.map((field) => (
                                <div
                                    key={field.id}
                                    className={field.type === "text" || field.type === "html" ? fullSpanClass : ""}
                                >
                                    {renderField(field)}
                                </div>
                            ))}
                        </div>
                    </section>
                ))}

                {typeof children === "function" ? children(form) : children}

                {submitLabel ? (
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            className="rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-white hover:brightness-110"
                        >
                            {submitLabel}
                        </button>
                    </div>
                ) : null}
            </div>
        </Form>
    );
};
