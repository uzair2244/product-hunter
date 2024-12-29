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

        // Optimize performance
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            // Only allow HTML documents, block everything else
            if (request.resourceType() === 'document') {
                request.continue();
            } else {
                request.abort();
            }
        });

        // Minimal required headers
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        // Fast navigation with minimal wait
        await page.goto(link, {
            waitUntil: 'domcontentloaded', // Don't wait for full load
            timeout: 5000 // 5 second timeout
        });

        // Quick content extraction
        const productData = await page.evaluate(() => {
            const selectors = [
                '.product-title-text',
                'h1.product-title',
                '.title--wrap--UUHae_g h1',
                '[data-pl="product-title"]',
                'h1'
            ];

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const title = element.innerText.trim();
                    if (title && title !== 'Aliexpress') {
                        return { title };
                    }
                }
            }

            // Quick fallback
            const h1 = document.querySelector('h1');
            return {
                title: h1 ? h1.innerText.trim() : 'Title not found'
            };
        });

        // Close page immediately
        await page.close();

        return res.status(200).json(productData);

    } catch (error) {
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        // Cleanup on error
        if (page) {
            try {
                await page.close();
            } catch (e) {
                console.error("Error closing page:", e);
            }
        }

        // Don't close the browser, just clear the reference if needed
        if (!_browser) {
            try {
                if (browser) await browser.close();
            } catch (e) {
                console.error("Error closing browser:", e);
            }
        }

        return res.status(500).json({
            message: "Error fetching product data",
            error: error.message
        });
    }
};
