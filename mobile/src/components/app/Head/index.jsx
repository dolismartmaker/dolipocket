import { Helmet } from "react-helmet";

export const Head = () => {
    const themeColor = getComputedStyle(document.documentElement).getPropertyValue("--color-primary");
    const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue("--color-medium-bg");

    return (
        <Helmet>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

            <link rel="icon" href="/images/favicon.png" sizes="48x48" />
            <link rel="apple-touch-icon" href="/images/apple-touch-icon.png" />

            <meta name="theme-color" content={themeColor} />
            <meta name="background-color" content={backgroundColor} />

            <link rel="manifest" href="manifest.webmanifest" crossOrigin="use-credentials" />    
            <title>SmartMaker</title>
        </Helmet>
    );
};
