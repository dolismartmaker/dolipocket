/**
 * ESLint custom rule: no-shadowed-global-self-call
 *
 * Forbids calling a function by its own name when that name also
 * shadows a global JS builtin. Example trap:
 *
 *     export const Boolean = (props) => {
 *         // ...
 *         return <input checked={Boolean(currentValue)} />;
 *         //               ^^^^^^^ NOT the global builtin: this
 *         //                       recursively invokes the component
 *         //                       and crashes inside any hook.
 *     };
 *
 * Replace with `!!x`, `globalThis.Boolean(x)`, or alias the native
 * before declaring the component.
 *
 * Triggers on any `<Name>(...)` call where `<Name>` matches the
 * enclosing function/declaration AND is in the watched-globals list
 * below.
 */

const SHADOWED_GLOBALS = new Set([
    "Boolean",
    "Number",
    "String",
    "Array",
    "Object",
    "Map",
    "Set",
    "Date",
    "Promise",
    "Error",
    "Symbol",
    "RegExp",
    "Math",
    "JSON",
]);

const rule = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow calling a function by its own name when that " +
                "name also shadows a global JS builtin (avoids accidental " +
                "recursive self-invocation).",
        },
        schema: [],
        messages: {
            shadowedSelfCall:
                "`{{name}}` shadows the global `{{name}}` here. " +
                "Calling `{{name}}(...)` does NOT invoke the global - " +
                "it recursively re-enters this function. Use `!!x` for " +
                "Boolean, `globalThis.{{name}}(x)`, or alias the global " +
                "to a different identifier.",
        },
    },
    create(context) {
        // Stack of currently-entered function names whose binding
        // shadows a watched global.
        const stack = [];

        // A function "shadows" a watched global if it is named after
        // one. We collect that name from the parent declaration.
        const enclosingName = (node) => {
            const { parent } = node;
            if (!parent) return null;
            // export const Foo = () => {}
            // const Foo = () => {}
            if (parent.type === "VariableDeclarator" && parent.id?.name) {
                return parent.id.name;
            }
            // function Foo() {}
            if (parent.type === "FunctionDeclaration" && parent.id?.name) {
                return parent.id.name;
            }
            // export default function Foo() {}
            if (
                parent.type === "ExportDefaultDeclaration" &&
                parent.declaration?.id?.name
            ) {
                return parent.declaration.id.name;
            }
            return null;
        };

        const enterFn = (node) => {
            const name = node.id?.name ?? enclosingName(node);
            if (name && SHADOWED_GLOBALS.has(name)) {
                stack.push(name);
            } else {
                stack.push(null);
            }
        };

        const exitFn = () => {
            stack.pop();
        };

        return {
            FunctionDeclaration: enterFn,
            FunctionExpression: enterFn,
            ArrowFunctionExpression: enterFn,
            "FunctionDeclaration:exit": exitFn,
            "FunctionExpression:exit": exitFn,
            "ArrowFunctionExpression:exit": exitFn,

            CallExpression(node) {
                const callee = node.callee;
                if (callee.type !== "Identifier") return;
                // Find the nearest enclosing watched-global name.
                for (let i = stack.length - 1; i >= 0; i--) {
                    const guarded = stack[i];
                    if (guarded === null) continue;
                    if (guarded === callee.name) {
                        context.report({
                            node: callee,
                            messageId: "shadowedSelfCall",
                            data: { name: callee.name },
                        });
                    }
                    break;
                }
            },
        };
    },
};

export default rule;
