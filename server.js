const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.use(express.json());

app.use(function (req, res, next) {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "https://www.lincolnindicators.com.au"
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
    var context = null;

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

        var browserInstance =
            await getBrowser();

        context =
            await browserInstance.newContext({
                serviceWorkers: "block"
            });

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

        var page =
            await context.newPage();

        var purchaseId = null;
        var finalUrl = null;

        var checkUrl = function () {

            var currentUrl = page.url();

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

        var navigationPromise =
            page.goto(startUrl, {
                waitUntil: "commit",
                timeout: 15000
            });

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
                    setTimeout(resolve, 25);
                }
            );

        }

        try {
            await navigationPromise;
        } catch (error) {}

        checkUrl();

        if (!purchaseId) {

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

            checkUrl();

        }

        if (!purchaseId) {

            throw new Error(
                "purchaseId not found"
            );

        }

        var totalTime =
            Date.now() - startTime;

        res.json({
            success: true,
            purchase_id: purchaseId,
            final_url: finalUrl,
            time_ms: totalTime
        });

        if (context) {

            context.close().catch(
                function () {}
            );

        }

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
