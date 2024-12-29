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

        // Maximum performance optimization
        await Promise.all([
            page.setJavaScriptEnabled(true), // Enable JS for dynamic content
            page.setRequestInterception(true),
            page.setDefaultNavigationTimeout(8000)
        ]);

        // Intercept and abort non-essential requests
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'document' || resourceType === 'xhr') {
                req.continue();
            } else {
                req.abort();
            }
        });

        // Set minimal headers
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        });

        try {
            // Navigate with race condition
            await Promise.race([
                page.goto(link, { waitUntil: 'domcontentloaded' }),
                new Promise(resolve => setTimeout(resolve, 4000))
            ]);

            // Extract content immediately with multiple methods
            const productData = await page.evaluate(() => {
                // Method 1: Direct selectors
                const directSelectors = [
                    '.title--wrap--UUHae_g .title--title--G6mZm_W',
                    '.product-title-text',
                    'h1.product-title',
                    '[data-pl="product-title"]'
                ];

                for (const selector of directSelectors) {
                    const element = document.querySelector(selector);
                    if (element?.innerText?.trim()) {
                        return { title: element.innerText.trim(), method: 'direct' };
                    }
                }

                // Method 2: Find first visible h1
                const h1s = Array.from(document.getElementsByTagName('h1'));
                for (const h1 of h1s) {
                    const text = h1.innerText?.trim();
                    if (text && text !== 'Aliexpress') {
                        return { title: text, method: 'h1' };
                    }
                }

                // Method 3: Find largest text block
                const textElements = document.querySelectorAll('div, h1, h2, h3, span');
                let longestText = '';
                textElements.forEach(el => {
                    const text = el.innerText?.trim();
                    if (text && text.length > longestText.length && text.length < 200) {
                        longestText = text;
                    }
                });

                if (longestText && longestText !== 'Aliexpress') {
                    return { title: longestText, method: 'longest' };
                }

                return { title: null, method: 'none' };
            });

            // Debug info
            console.log('URL:', await page.url());
            console.log('Data:', productData);

            if (!productData.title) {
                throw new Error('No title found');
            }

            return res.status(200).json(productData);

        } catch (error) {
            console.error('Extraction error:', error);
            return res.status(500).json({
                message: "Error fetching product data",
                error: error.message,
                url: await page.url()
            });
        } finally {
            if (page) await page.close();
        }

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
