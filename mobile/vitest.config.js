import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            src: path.resolve(__dirname, "./src"),
        },
        // Single shared copy of the libs that smartcommon (file: symlink) also
        // imports -- see vite.config.js for the rationale.
        dedupe: [
            "react", "react-dom", "react-router-dom", "@reduxjs/toolkit",
            "react-redux", "i18next", "react-i18next", "react-hot-toast",
            "framer-motion", "react-helmet",
        ],
    },
    test: {
        environment: "jsdom",
        globals: true,
    },
});
