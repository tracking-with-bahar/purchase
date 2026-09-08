const express = require("express");
const { chromium } = require("playwright");

const app = express();

app.use(express.json());

app.use(function (req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
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

app.get("/", function (req, res) {
    res.json({
        success: true,
        service: "purchase-id-resolver"
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

    var browser;

    try {

        browser = await chromium.launch({
            headless: true
        });

        var page = await browser.newPage();

        await page.goto(startUrl, {
            waitUntil: "domcontentloaded",
            timeout: 30000
        });

        var purchaseId = null;

        try {

            await page.waitForFunction(function () {

                var params =
                    new URLSearchParams(
                        window.location.search
                    );

                return params.has("purchaseId");

            }, {
                timeout: 30000
            });

            var currentUrl =
                page.url();

            var url =
                new URL(currentUrl);

            purchaseId =
                url.searchParams.get(
                    "purchaseId"
                );

        } catch (error) {

            purchaseId = null;
        }

        console.log(
            "Final URL:",
            page.url()
        );

        console.log(
            "Purchase ID:",
            purchaseId
        );

        await browser.close();

        if (!purchaseId) {

            return res.status(404).json({
                success: false,
                error: "purchaseId not found",
                final_url: page.url()
            });
        }

        return res.json({
            success: true,
            purchase_id: purchaseId,
            final_url: page.url()
        });

    } catch (error) {

        if (browser) {
            await browser.close();
        }

        console.error(error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }

});

var port =
    process.env.PORT || 3000;

app.listen(port, function () {

    console.log(
        "Server running on port " + port
    );

});
