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

    var startTime = Date.now();
    var startUrl = req.body.start_url;
    var context = null;

    console.log("REQUEST START");

    try {

        var browserInstance = await getBrowser();

        console.log(
            "Browser ready:",
            Date.now() - startTime,
            "ms"
        );

        context = await browserInstance.newContext();

        console.log(
            "Context created:",
            Date.now() - startTime,
            "ms"
        );

        await context.route("**/*", async function (route) {

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

        });

        var page = await context.newPage();

        console.log(
            "Page created:",
            Date.now() - startTime,
            "ms"
        );

        await page.goto(startUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000
        });

        console.log(
            "DOM loaded:",
            Date.now() - startTime,
            "ms"
        );

        await page.waitForFunction(function () {

            return window.location.href.indexOf(
                "purchaseId="
            ) !== -1;

        }, {
            timeout: 15000,
            polling: 50
        });

        console.log(
            "purchaseId detected:",
            Date.now() - startTime,
            "ms"
        );

        var currentUrl = page.url();

        var url = new URL(currentUrl);

        var purchaseId =
            url.searchParams.get("purchaseId");

        console.log(
            "Purchase ID:",
            purchaseId
        );

        await context.close();

        console.log(
            "Context closed:",
            Date.now() - startTime,
            "ms"
        );

        return res.json({
            success: true,
            purchase_id: purchaseId,
            final_url: currentUrl,
            time_ms: Date.now() - startTime
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
            time_ms: Date.now() - startTime
        });

    }

});
