import { Component } from "react";

import { purgeCachesAndReload } from "src/lib/recovery/swRecovery";

// Root error boundary. Catches any render crash in the whole tree so a public
// user never sees a raw "X is undefined" white screen.
//
// The dominant cause of such a crash in this PWA is a stale precached build
// being served by the service worker on a soft reload (the viewport switch
// does window.location.reload()). So the first time we crash in a session we
// purge the SW + caches and reload once on a fresh network fetch. If the app
// crashes AGAIN shortly after that purge, the problem is not a stale cache:
// we stop auto-reloading (no loop) and show a manual fallback instead.
const RECOVERY_TS_KEY = "dpk_recovery_ts";
// Two crashes within this window => the purge did not help => stop looping.
const RECOVERY_WINDOW_MS = 60000;

// Inline styles only: a stale/missing CSS asset must not break the fallback.
const styles = {
    wrap: {
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "18px",
        padding: "24px",
        background: "#f5f5f4",
        color: "#1c1917",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        textAlign: "center",
        zIndex: 2147483647,
    },
    spinner: {
        width: "34px",
        height: "34px",
        border: "3px solid #d6d3d1",
        borderTopColor: "#0d9488",
        borderRadius: "50%",
        animation: "dpk-spin 0.8s linear infinite",
    },
    title: { fontSize: "16px", fontWeight: 600, margin: 0 },
    text: { fontSize: "13px", color: "#57534e", margin: 0, maxWidth: "320px", lineHeight: 1.5 },
    button: {
        marginTop: "6px",
        padding: "10px 18px",
        fontSize: "14px",
        fontWeight: 600,
        color: "#fff",
        background: "#0d9488",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
    },
};

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, recovering: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        // Always log before deciding what to do (no silent failure).
        console.error("DPK ErrorBoundary caught a render crash", error, info);

        const now = Date.now();
        let lastRecovery = 0;
        try {
            lastRecovery = Number(window.sessionStorage.getItem(RECOVERY_TS_KEY)) || 0;
        } catch (_) {
            // sessionStorage unavailable (private mode): skip auto-recovery and
            // fall through to the manual fallback so we never loop blindly.
            lastRecovery = now;
        }

        if (now - lastRecovery < RECOVERY_WINDOW_MS) {
            // A purge already happened moments ago and it still crashes: this
            // is a real bug, not a stale cache. Show the manual fallback.
            console.error("DPK ErrorBoundary: crash persists after recovery, manual fallback");
            return;
        }

        try {
            window.sessionStorage.setItem(RECOVERY_TS_KEY, String(now));
        } catch (_) { /* ignore */ }

        this.setState({ recovering: true });
        purgeCachesAndReload();
    }

    handleManualReload = () => {
        try {
            window.sessionStorage.removeItem(RECOVERY_TS_KEY);
        } catch (_) { /* ignore */ }
        purgeCachesAndReload();
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { recovering } = this.state;

        return (
            <div style={styles.wrap}>
                <style>{"@keyframes dpk-spin{to{transform:rotate(360deg)}}"}</style>
                {recovering ? (
                    <>
                        <div style={styles.spinner} />
                        <p style={styles.title}>{"Mise à jour de l'application en cours..."}</p>
                        <p style={styles.text}>
                            {"Une nouvelle version est disponible. L'application va redémarrer automatiquement."}
                        </p>
                    </>
                ) : (
                    <>
                        <p style={styles.title}>Une erreur est survenue</p>
                        <p style={styles.text}>
                            {"L'application n'a pas pu se charger correctement. Vous pouvez la recharger pour réessayer."}
                        </p>
                        <button
                            type="button"
                            style={styles.button}
                            onClick={this.handleManualReload}
                        >
                            {"Recharger l'application"}
                        </button>
                    </>
                )}
            </div>
        );
    }
}
