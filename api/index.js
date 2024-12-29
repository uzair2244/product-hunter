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

        // Reduce timeout to avoid function timeout
        await page.goto(link, {
            waitUntil: "domcontentloaded", // Changed from networkidle0
            timeout: 8000
        });

        // Reduce wait time
        await page.waitForTimeout(1000);

        // Get all text content immediately after load
        const productData = await page.evaluate(() => {
            // Try multiple methods to get the title
            const methods = [
                // Method 1: Direct selectors
                () => {
                    const selectors = [
                        'div.title--wrap--UUHae_g h1[data-pl="product-title"]',
                        'h1.product-title',
                        'h1[data-pl="product-title"]',
                        '.product-title',
                        'h1',
                        '[data-pl="product-title"]',
                        '.title'
                    ];
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) return element.innerText.trim();
                    }
                    return null;
                },
                // Method 2: Find first visible h1
                () => {
                    const h1s = Array.from(document.getElementsByTagName('h1'));
                    const visibleH1 = h1s.find(h1 => {
                        const style = window.getComputedStyle(h1);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    });
                    return visibleH1 ? visibleH1.innerText.trim() : null;
                },
                // Method 3: Find largest text in first viewport
                () => {
                    const elements = document.querySelectorAll('*');
                    let largestText = '';
                    elements.forEach(el => {
                        if (el.innerText &&
                            el.innerText.length > largestText.length &&
                            el.getBoundingClientRect().top < window.innerHeight) {
                            largestText = el.innerText.trim();
                        }
                    });
                    return largestText || null;
                }
            ];

            // Try each method until we get a result
            for (const method of methods) {
                const result = method();
                if (result) return { title: result };
            }

            return { title: null };
        });

        console.log('Scraped data:', productData);

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
