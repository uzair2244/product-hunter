// worker for ali-express

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
    // Set a faster timeout for the entire operation
    const timeout = setTimeout(() => {
        throw new Error('Operation timed out');
    }, 20000); // Reduced to 20 seconds

    browser = await getBrowser();
    page = await browser.newPage();

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

    // Navigate to the provided link
    await page.goto(link, {
        waitUntil: "domcontentloaded",
        timeout: 10000 // Reduced to 10 seconds
    });

    // Wait for the elements to be present before scraping
    await page.waitForSelector('div.title--wrap--UUHae_g h1[data-pl="product-title"]', { timeout: 10000 }); // Reduced to 10 seconds
    await page.waitForSelector('.price--currentPriceText--V8_y_b5.pdp-comp-price-current.product-price-value', { timeout: 10000 }); // Reduced to 10 seconds
    await page.waitForSelector('.slider--item--FefNjlj img', { timeout: 10000 }); // Reduced to 10 seconds

    // Now scrape the product data
    const productData = await page.evaluate(() => {
        const titleElement = document.querySelector('div.title--wrap--UUHae_g h1[data-pl="product-title"]');
        const priceElement = document.querySelector('.price--currentPriceText--V8_y_b5.pdp-comp-price-current.product-price-value');
        const imageElement = document.querySelector('.slider--item--FefNjlj img');

        return {
            title: titleElement ? titleElement.innerText : null,
            price: priceElement ? priceElement.innerText : null,
            image: imageElement ? imageElement.src : null
        };
    });

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