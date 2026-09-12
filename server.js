const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.use(express.json());

app.use(function (req, res, next) {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "https://www.stockdoctor.com.au"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST,OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();

});

var browser = null;

async function getBrowser() {

    if (browser && browser.isConnected()) {
        return browser;
    }

    browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ]
    });

    browser.on("disconnected", function () {
        browser = null;
    });

    return browser;

}

app.get("/", function (req, res) {

    res.json({
        success: true,
        service: "purchase-id-resolver",
        browser_ready: !!(
            browser &&
            browser.isConnected()
        )
    });

});

app.post("/resolve", async function (req, res) {

    var startTime = Date.now();
    var startUrl = req.body.start_url;
    var browserCookies = req.body.cookies || "";
    var context = null;

    console.log("========================================");
    console.log("New resolve request");
    console.log("Start URL:", startUrl);
    console.log("Browser cookies:", browserCookies);
    console.log("========================================");

    if (!startUrl) {

        return res.status(400).json({
            success: false,
            error: "start_url is required"
        });

    }

    if (
        !startUrl.startsWith(
            "https://members.lincolnindicators.com.au/"
        )
    ) {

        return res.status(400).json({
            success: false,
            error: "Invalid start_url"
        });

    }

    try {

        var browserInstance = await getBrowser();

        context = await browserInstance.newContext({
            serviceWorkers: "block"
        });

        /*
         * Add cookies received from StockDoctor
         * into the Render Playwright context.
         */

        if (browserCookies) {

            var cookiePairs =
                browserCookies.split("; ");

            var cookies = [];

            for (
                var i = 0;
                i < cookiePairs.length;
                i++
            ) {

                var parts =
                    cookiePairs[i].split("=");

                var name =
                    parts.shift();

                var value =
                    parts.join("=");

                if (name && value) {

                    cookies.push({
                        name: name,
                        value: value,
                        domain:
                            "members.lincolnindicators.com.au",
                        path: "/"
                    });

                }

            }

            if (cookies.length) {

                console.log(
                    "Adding browser cookies to Render context:",
                    cookies
                );

                await context.addCookies(
                    cookies
                );

            }

        }

        var page =
            await context.newPage();

        /*
         * Block heavy resources to keep
         * the request fast.
         */

        await context.route(
            "**/*",
            async function (route) {

                var resourceType =
                    route.request().resourceType();

                if (
                    resourceType === "image" ||
                    resourceType === "font" ||
                    resourceType === "media"
                ) {

                    return route.abort();

                }

                return route.continue();

            }
        );

        var purchaseId = null;
        var finalUrl = null;

        var checkUrl = function () {

            var currentUrl =
                page.url();

            if (
                currentUrl.indexOf(
                    "purchaseId="
                ) !== -1
            ) {

                try {

                    var url =
                        new URL(currentUrl);

                    purchaseId =
                        url.searchParams.get(
                            "purchaseId"
                        );

                    finalUrl =
                        currentUrl;

                } catch (error) {}

            }

        };

        /*
         * Start navigation.
         */

        console.log(
            "Navigating to:",
            startUrl
        );

        var navigationPromise =
            page.goto(startUrl, {
                waitUntil: "commit",
                timeout: 15000
            });

        /*
         * Check the URL very quickly for
         * the generated purchaseId.
         */

        var startWait =
            Date.now();

        while (!purchaseId) {

            checkUrl();

            if (purchaseId) {
                break;
            }

            if (
                Date.now() - startWait >
                15000
            ) {
                break;
            }

            await new Promise(
                function (resolve) {
                    setTimeout(
                        resolve,
                        25
                    );
                }
            );

        }

        try {

            await navigationPromise;

        } catch (error) {}

        checkUrl();

        /*
         * Extra wait in case the redirect
         * happens slightly later.
         */

        if (!purchaseId) {

            try {

                await page.waitForFunction(
                    function () {

                        return window.location.href.indexOf(
                            "purchaseId="
                        ) !== -1;

                    },
                    {
                        timeout: 5000,
                        polling: 25
                    }
                );

            } catch (error) {}

            checkUrl();

        }

        if (!purchaseId) {

            throw new Error(
                "purchaseId not found"
            );

        }

        /*
         * Get ALL cookies currently stored
         * in the Render Playwright context.
         */

        var responseCookies =
            await context.cookies();

        console.log(
            "========================================"
        );

        console.log(
            "Purchase ID:",
            purchaseId
        );

        console.log(
            "Final URL:",
            finalUrl
        );

        console.log(
            "Cookies returned by Members:"
        );

        console.log(
            responseCookies
        );

        console.log(
            "========================================"
        );

        var totalTime =
            Date.now() - startTime;

        /*
         * Return purchaseId + final URL +
         * cookies to the browser.
         */

        res.json({
            success: true,
            purchase_id: purchaseId,
            final_url: finalUrl,
            cookies: responseCookies,
            time_ms: totalTime
        });

        /*
         * Close the isolated context.
         */

        context.close().catch(
            function () {}
        );

    } catch (error) {

        if (context) {

            context.close().catch(
                function () {}
            );

        }

        console.error(
            "ERROR:",
            error.message
        );

        return res.status(500).json({
            success: false,
            error: error.message,
            time_ms:
                Date.now() - startTime
        });

    }

});

var port =
    process.env.PORT || 10000;

getBrowser()
    .then(function () {

        app.listen(
            port,
            function () {

                console.log(
                    "Server running on port " +
                    port
                );

            }
        );

    })
    .catch(function (error) {

        console.error(
            "Browser startup failed:",
            error.message
        );

        process.exit(1);

    });

process.on(
    "SIGTERM",
    async function () {

        if (browser) {
            await browser.close();
        }

        process.exit(0);

    }
);

process.on(
    "SIGINT",
    async function () {

        if (browser) {
            await browser.close();
        }

        process.exit(0);

    }
);
