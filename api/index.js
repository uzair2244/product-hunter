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
        timeout: 10000 // Set browser launch timeout
    });
    return _browser;
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    const { link } = req.body;
    if (!link) {
        return res.status(400).json({ message: "Link is required" });
    }

    let browser = null;
    let page = null;

    try {
        browser = await getBrowser();
        page = await browser.newPage();

        // Set a faster timeout for the entire operation
        const timeout = setTimeout(() => {
            throw new Error('Operation timed out');
        }, 10000); // 10 seconds timeout

        // Optimize network requests
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate to the provided link with faster options
        await page.goto(link, {
            waitUntil: 'networkidle2', // Wait for less network activity
            timeout: 8000 // Reduced timeout for initial navigation
        });

        // Use `waitForNetworkIdle` for more reliable waiting
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 });

        // Use `evaluate` to fetch data directly
        const productData = await page.evaluate(async () => {
            const titleElementHandle = await page.waitForFunction(
                () => document.querySelector('div.title--wrap--UUHae_g h1[data-pl="product-title"]'),
                { timeout: 5000 }
            );
            const titleElement = await titleElementHandle.getProperty('textContent');
            const title = await titleElement.jsonValue(); 

            return { title };
        },[page]);
        clearTimeout(timeout);

        await page.close();

        return res.status(200).json(productData);

    } catch (error) {
        console.error("Error scraping product data:", error);

        if (page) await page.close().catch(console.error);
        if (browser) await browser.close().catch(console.error);
        _browser = null;

        return res.status(500).json({
            message: "Error fetching product data",
            error: error.message
        });
    }
};
