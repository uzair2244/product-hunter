const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

let _browser = null;

async function getBrowser() {
    if (_browser) {
        return _browser;
    }
    _browser = await puppeteer.launch({
        args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: true,
        ignoreHTTPSErrors: true,
    });
    return _browser;
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    const { link } = req.body; // Changed from query to link
    if (!link) {
        return res.status(400).json({ message: "Link is required" });
    }

    let browser = null;
    let page = null;

    try {
        // Reduce timeout to 5 seconds
        const timeout = setTimeout(() => {
            throw new Error('Operation timed out');
        }, 5000);

        browser = await getBrowser();
        page = await browser.newPage();

        // Additional optimization: Disable JavaScript and CSS
        await page.setJavaScriptEnabled(false);

        // Optimize page settings
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            // Block unnecessary resources
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate with reduced timeout
        await page.goto(link, {
            waitUntil: "domcontentloaded",
            timeout: 4000
        });

        await page.waitForSelector('h1', { timeout: 2000 }).catch(() => null);

        // Updated selector and added multiple fallback selectors
        const productData = await page.evaluate(() => {
            const selectors = [
                'div.title--wrap--UUHae_g h1[data-pl="product-title"]',
                'h1.product-title',
                'h1[data-pl="product-title"]',
                '.product-title',
                'h1'
            ];

            let titleElement = null;
            for (const selector of selectors) {
                titleElement = document.querySelector(selector);
                if (titleElement) break;
            }

            return {
                title: titleElement ? titleElement.innerText.trim() : null,
            };
        });

        // Add debug logging
        console.log('Scraped data:', productData);

        clearTimeout(timeout);

        // Only close the page, keep browser instance
        await page.close();

        return res.status(200).json(productData);

    } catch (error) {
        console.error("Error scraping product data:", error);

        // Cleanup on error
        if (page) await page.close().catch(console.error);
        if (browser) await browser.close().catch(console.error);
        _browser = null;

        return res.status(500).json({
            message: "Error fetching product data",
            error: error.message
        });
    }
};
