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

        // Enhanced anti-detection measures
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
            'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
        });

        // Reduce memory usage
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            // Only allow document and xhr requests
            if (['document', 'xhr'].includes(request.resourceType())) {
                request.continue();
            } else {
                request.abort();
            }
        });

        // Set a more conservative viewport
        await page.setViewport({
            width: 1024,
            height: 768
        });

        // Reduce memory usage with session settings
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Network.setBypassServiceWorker', { bypass: true });

        // Enable JavaScript for this case
        await page.setJavaScriptEnabled(true);

        // Remove headless flag detection
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        });

        // Enhanced stealth settings
        await page.evaluateOnNewDocument(() => {
            // Mask webdriver
            Object.defineProperty(navigator, 'webdriver', { get: () => false });

            // Add missing properties
            window.chrome = {
                runtime: {}
            };

            // Modify navigator properties
            const newProto = navigator.__proto__;
            delete newProto.webdriver;
            navigator.__proto__ = newProto;
        });

        // Add user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        // Wait for network to be idle
        await page.goto(link, {
            waitUntil: ['domcontentloaded', 'networkidle0'],
            timeout: 10000
        });

        // Wait for potential redirects
        await page.waitForTimeout(2000);

        // Check if we're on a challenge page
        const isChallengePresent = await page.evaluate(() => {
            return window.location.href.includes('_____tmd_____/punish') ||
                document.title.includes('verify') ||
                document.body.innerText.includes('verify');
        });

        if (isChallengePresent) {
            throw new Error('Challenge page detected - blocked by anti-bot measures');
        }

        // Try to extract content with retries
        let retries = 3;
        let productData = { title: null };

        while (retries > 0 && !productData.title) {
            productData = await page.evaluate(() => {
                const selectors = [
                    'h1.product-title-text',
                    '.product-title',
                    'h1[data-pl="product-title"]',
                    '.title--wrap--UUHae_g h1',
                    'h1'
                ];

                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element && element.innerText.trim()) {
                        return { title: element.innerText.trim() };
                    }
                }

                // Fallback: get any visible text that looks like a title
                const h1s = Array.from(document.getElementsByTagName('h1'));
                for (const h1 of h1s) {
                    if (h1.offsetHeight > 0 && h1.innerText.trim()) {
                        return { title: h1.innerText.trim() };
                    }
                }

                return { title: null };
            });

            if (!productData.title) {
                await page.waitForTimeout(1000);
                retries--;
            }
        }

        // Add debug information
        console.log('Current URL:', await page.url());
        console.log('Page Title:', await page.title());
        console.log('Scraped Data:', productData);

        clearTimeout(timeout);

        // Only close the page, keep browser instance
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
