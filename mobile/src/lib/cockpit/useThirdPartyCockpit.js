import { useCallback, useEffect, useState } from "react";

// Loads the single cockpit aggregation payload for one thirdparty
// (GET thirdparty/{id}/cockpit via the useDbThirdParties store). Follows the
// stable hasClient guard pattern (cf .claude/CLAUDE.md "Pattern hasClient")
// so the effect never loops on an unstable hook reference.
//
// Returns { data, loading, error, reload }.
export const useThirdPartyCockpit = (thirdpartyId, dataSource) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!(dataSource && dataSource.cockpit);

    const load = useCallback(async ({ signal } = {}) => {
        if (!hasClient || !thirdpartyId) return;
        setLoading(true);
        setError(null);
        try {
            const payload = await dataSource.cockpit(thirdpartyId, { signal });
            setData(payload);
        } catch (err) {
            if (err?.name === "AbortError") return;
            console.error("useThirdPartyCockpit.load error", err);
            setError("Synthèse indisponible (erreur réseau)");
        } finally {
            setLoading(false);
        }
    }, [hasClient, thirdpartyId]);

    useEffect(() => {
        const ctrl = new AbortController();
        load({ signal: ctrl.signal });
        return () => ctrl.abort();
    }, [hasClient, thirdpartyId, load]);

    return { data, loading, error, reload: () => load() };
};
