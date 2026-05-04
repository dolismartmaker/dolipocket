export const appConfig = {
    themes: {
        publicTheme: false,
        files: "themes",
        fileName: "{theme}.theme.css",
        th: [
            {
                name: "SmartMaker",
                file: "smart-maker"
            },
            {
                name: "SmartInterventions",
                file: "smart-interventions"
            },
        ]
    },
    pages: {
        animations: {
            slideRight: {
                initial: { x: "50%", opacity: 0 },
                animate: { x: 0, opacity: 1, transition: { duration: 0.15, ease: "easeInOut" } },
                exit: { x: "50%", opacity: 0, transition: { duration: 0.15, ease: "easeInOut" } },
            },
            slideLeft: {
                initial: { x: "-50%", opacity: 0 },
                animate: { x: 0, opacity: 1, transition: { duration: 0.15, ease: "easeInOut" } },
                exit: { x: "-50%", opacity: 0, transition: { duration: 0.15, ease: "easeInOut" } },
            },
            fade: {
                initial: { opacity: 0 },
                animate: { opacity: 1, transition: { duration: 0.15, ease: "easeOut" } },
                exit: { opacity: 0, transition: { duration: 0.15, ease: "easeOut" }},
                // transition: { duration: 0.2, ease: "easeInOut" },
            },
            zoom : {
                initial: { scale: 0.9, opacity: 0 },
                animate: { scale: 1, opacity: 1 },
                exit: { scale: 0.9, opacity: 0 },
                transition: { duration: 0.2, ease: "easeOut" },
            }
        },
        pages: {
            "/welcome": {
                "/login": "slideLeft",
                "*": "fade"
            },
            "/login": {
                "/welcome": "slideRight",
                "*": "fade"
            },
            // "/": "fade",
            "*": "fade"
        }
    },
    redux: {
        
    }
}