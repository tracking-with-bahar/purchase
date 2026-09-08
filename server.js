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
            "--disable-dev-shm-usage"
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

    var startUrl = req.body.start_url;

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

    var context = null;

    try {

        var browserInstance = await getBrowser();

        context = await browserInstance.newContext();

        await context.route("**/*", async function (route) {

            var request = route.request();

            var resourceType = request.resourceType();

            if (
                resourceType === "image" ||
                resourceType === "font" ||
                resourceType === "media"
            ) {

                return route.abort();

            }

            return route.continue();

        });

        var page = await context.newPage();

        await page.goto(startUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000
        });

        await page.waitForFunction(function () {

            var url = window.location.href;

            return (
                url.indexOf("purchaseId=") !== -1
            );

        }, {
            timeout: 15000,
            polling: 50
        });

        var currentUrl = page.url();

        var url = new URL(currentUrl);

        var purchaseId =
            url.searchParams.get("purchaseId");

        console.log(
            "Purchase ID:",
            purchaseId
        );

        console.log(
            "Final URL:",
            currentUrl
        );

        await context.close();

        return res.json({
            success: true,
            purchase_id: purchaseId,
            final_url: currentUrl
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
            error: error.message
        });

    }

});

var port = process.env.PORT || 10000;

getBrowser()
    .then(function () {

        app.listen(port, function () {

            console.log(
                "Server running on port " + port
            );

        });

    })
    .catch(function (error) {

        console.error(
            "Browser startup failed:",
            error
        );

        process.exit(1);

    });

process.on("SIGTERM", async function () {

    if (browser) {
        await browser.close();
    }

    process.exit(0);

});

process.on("SIGINT", async function () {

    if (browser) {
        await browser.close();
    }

    process.exit(0);

});
