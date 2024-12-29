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

        // Navigate with minimal wait
        await page.goto(link, {
            waitUntil: "domcontentloaded",
            timeout: 3000
        });

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
