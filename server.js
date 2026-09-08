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

    var totalStart = Date.now();

    var startUrl =
        req.body.start_url;

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

        var browserReadyTime =
            Date.now();

        context =
            await browserInstance.newContext({
                serviceWorkers: "block"
            });

        var contextTime =
            Date.now();

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

        var pageTime =
            Date.now();

        console.log(
            "Browser:",
            browserReadyTime - totalStart,
            "ms"
        );

        console.log(
            "Context:",
            contextTime - totalStart,
            "ms"
        );

        console.log(
            "Page:",
            pageTime - totalStart,
            "ms"
        );

        var gotoStart =
            Date.now();

        await page.goto(startUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000
        });

        var gotoEnd =
            Date.now();

        console.log(
            "GOTO:",
            gotoEnd - gotoStart,
            "ms"
        );

        console.log(
            "URL after GOTO:",
            page.url()
        );

        var purchaseWaitStart =
            Date.now();

        await page.waitForFunction(
            function () {

                return window.location.href.indexOf(
                    "purchaseId="
                ) !== -1;

            },
            {
                timeout: 10000,
                polling: 25
            }
        );

        var purchaseWaitEnd =
            Date.now();

        console.log(
            "PURCHASE WAIT:",
            purchaseWaitEnd - purchaseWaitStart,
            "ms"
        );

        var currentUrl =
            page.url();

        var url =
            new URL(currentUrl);

        var purchaseId =
            url.searchParams.get(
                "purchaseId"
            );

        console.log(
            "PURCHASE ID:",
            purchaseId
        );

        var closeStart =
            Date.now();

        await context.close();

        var closeEnd =
            Date.now();

        console.log(
            "CLOSE:",
            closeEnd - closeStart,
            "ms"
        );

        console.log(
            "TOTAL:",
            Date.now() - totalStart,
            "ms"
        );

        return res.json({
            success: true,
            purchase_id: purchaseId,
            final_url: currentUrl,
            timing: {
                browser_ms:
                    browserReadyTime - totalStart,
                context_ms:
                    contextTime - browserReadyTime,
                page_ms:
                    pageTime - contextTime,
                goto_ms:
                    gotoEnd - gotoStart,
                purchase_wait_ms:
                    purchaseWaitEnd - purchaseWaitStart,
                close_ms:
                    closeEnd - closeStart,
                total_ms:
                    Date.now() - totalStart
            }
        });

    } catch (error) {

        if (context) {

            try {
                await context.close();
            } catch (e) {}

        }

        console.error(
            "ERROR:",
            error.message
        );

        return res.status(500).json({
            success: false,
            error: error.message,
            time_ms:
                Date.now() - totalStart
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
