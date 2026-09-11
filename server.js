app.post("/resolve", async function (req, res) {

    var startTime = Date.now();
    var startUrl = req.body.start_url;
    var browserCookies = req.body.cookies || "";
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

        if (browserCookies) {

            var cookies = browserCookies
                .split(";")
                .map(function (cookie) {

                    var separator =
                        cookie.indexOf("=");

                    if (separator === -1) {
                        return null;
                    }

                    var name =
                        cookie
                            .substring(0, separator)
                            .trim();

                    var value =
                        cookie
                            .substring(separator + 1)
                            .trim();

                    if (!name) {
                        return null;
                    }

                    return {
                        name: name,
                        value: value,
                        domain:
                            "members.lincolnindicators.com.au",
                        path: "/"
                    };

                })
                .filter(function (cookie) {
                    return cookie !== null;
                });

            if (cookies.length) {

                await context.addCookies(
                    cookies
                );

            }

        }

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

        var totalTime =
            Date.now() - startTime;

        res.json({

            success: true,

            purchase_id:
                purchaseId,

            final_url:
                finalUrl,

            time_ms:
                totalTime

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

            error:
                error.message,

            time_ms:
                Date.now() - startTime

        });

    }

});
