import { FaPlus, FaArrowLeft, FaSearch } from "react-icons/fa";

import { Page, Block, Input, Button } from "@cap-rel/smartcommon";

const STATUS_LABELS = {
    0: "Brouillon",
    1: "Ouvert",
    2: "Fermé",
};

const formatDate = (ts) => {
    if (!ts) return "";
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};

// Mobile rendering of the projects list. Presentational only.
export const ProjectsPageMobile = (props) => {
    const {
        navigate,
        items, loading, error, q, status,
        set, loadList,
    } = props;

    const handleSearch = () => loadList();
    const goTo = (id) => navigate(`/projects/${id}`);
    const goNew = () => navigate("/projects/new");

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base md:px-6 md:max-w-5xl md:mx-auto">
                <button onClick={() => navigate("/")} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1">Projets</h1>
                <Button
                    onClick={goNew}
                    icon={FaPlus}
                    buttonProps={{ className: "p-3 rounded-full bg-primary text-white shadow-md" }}
                />
            </div>

            <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }}>
                <div className="flex flex-col gap-app-sm md:flex-row md:items-end md:gap-4">
                    <Input
                        label="Recherche (référence ou libellé)"
                        value={q ?? ""}
                        onChange={(val) => set("q", val)}
                    />
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-600">Statut</label>
                        <select
                            value={status ?? ""}
                            onChange={(e) => set("status", e.target.value)}
                            className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                        >
                            <option value="">Tous</option>
                            <option value="0">Brouillon</option>
                            <option value="1">Ouvert</option>
                            <option value="2">Fermé</option>
                        </select>
                    </div>
                    <Button
                        onClick={handleSearch}
                        icon={FaSearch}
                        buttonProps={{ className: "p-3 rounded-lg bg-primary text-white" }}
                    >
                        Rechercher
                    </Button>
                </div>
            </Block>

            <div className="px-app-base mt-app-base flex flex-col gap-app-sm md:px-6 md:max-w-5xl md:mx-auto">
                {loading && <div className="text-center text-gray-500 p-4">Chargement...</div>}
                {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg">{error}</div>}
                {!loading && !error && items?.length === 0 && (
                    <div className="text-center text-gray-500 p-4">Aucun projet</div>
                )}
                {!loading && !error && items?.map((r) => (
                    <button
                        key={r.id}
                        onClick={() => goTo(r.id)}
                        className="bg-white rounded-lg border border-gray-200 p-3 text-left hover:border-primary"
                    >
                        <div className="flex justify-between items-center">
                            <div className="font-bold">{r.ref || `#${r.id}`}</div>
                            <div className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                                {STATUS_LABELS[r.statut] ?? "?"}
                            </div>
                        </div>
                        <div className="text-sm text-gray-800 mt-1">{r.title}</div>
                        <div className="text-sm text-gray-600 flex justify-between mt-1">
                            <span>{r.socname || (r.socid ? `Tiers #${r.socid}` : "")}</span>
                            <span>{formatDate(r.dateStart)}</span>
                        </div>
                    </button>
                ))}
            </div>
        </Page>
    );
};
