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

        // Set mobile user agent
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');

        // Set mobile viewport
        await page.setViewport({
            width: 375,
            height: 812,
            isMobile: true,
            hasTouch: true
        });

        // Block unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'document') {
                req.continue();
            } else {
                req.abort();
            }
        });

        // Convert URL to mobile version
        const mobileLink = link.replace('www.aliexpress.com', 'm.aliexpress.com');

        try {
            // Navigate with minimal wait
            await page.goto(mobileLink, {
                waitUntil: 'domcontentloaded',
                timeout: 5000
            });

            // Quick extract with minimal selectors
            const productData = await page.evaluate(() => {
                // Generic title selectors that work across multiple sites
                const mobileSelectors = [
                    // AliExpress/Alibaba
                    '.title--wrap--UUHae_g .title--title--G6mZm_W',
                    '.product-name',
                    '.product-title-text',
                    '[data-pl="product-title"]',
                    // Amazon
                    '#productTitle',
                    '#title',
                    // Daraz
                    '.pdp-mod-product-badge-title',
                    '.pdp-product-title',
                    // Generic
                    '[itemprop="name"]',
                    'h1'
                ];

                // Generic image selectors
                const imageSelectors = [
                    // AliExpress/Alibaba
                    '.image-view--image--Uu0Ba2D',
                    '.gallery-image--image--P2S3P_r',
                    '.pdp-image',
                    'img[data-role="pdp-image"]',
                    // Amazon
                    '#landingImage',
                    '#imgBlkFront',
                    '#main-image',
                    // Daraz
                    '.pdp-mod-common-image img',
                    // Generic
                    '[itemprop="image"]',
                    '.product-image img',
                    '.main-image img',
                    '.gallery-image'
                ];

                // Generic price selectors
                const priceSelectors = [
                    // AliExpress/Alibaba
                    '.price--originalText--Zsc6sMk',
                    '.product-price-current',
                    '.uniform-banner-box-price',
                    // Amazon
                    '#priceblock_ourprice',
                    '.a-price-whole',
                    '#price_inside_buybox',
                    // Daraz
                    '.pdp-price',
                    '.pdp-product-price',
                    // Generic
                    '[itemprop="price"]',
                    '.product-price',
                    '.price-current',
                    '.current-price'
                ];

                let title = null;
                let image = null;
                let price = null;

                // Find title
                for (const selector of mobileSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const text = element.innerText.trim();
                        if (text && text.length > 5 && !text.includes('Aliexpress')) {
                            title = text;
                            break;
                        }
                    }
                }

                // Enhanced image finding logic
                for (const selector of imageSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        // Try multiple ways to get the image URL
                        image = element.src ||
                            element.getAttribute('data-src') ||
                            element.getAttribute('data-lazy-src') ||
                            element.getAttribute('content') ||
                            element.getAttribute('data-zoom-image');

                        if (image && !image.startsWith('data:')) {  // Avoid data URLs
                            break;
                        }
                    }
                }

                // Enhanced price finding logic with cleanup
                for (const selector of priceSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        let priceText = element.innerText.trim();

                        // Extract the first price if multiple prices exist
                        const priceMatch = priceText.match(/[\$\£\€]?\s*\d+([.,]\d{1,2})?/);
                        if (priceMatch) {
                            price = priceMatch[0].trim();
                            break;
                        }
                    }
                }

                // Super fallback for image
                if (!image) {
                    const allImages = document.querySelectorAll('img');
                    for (const img of allImages) {
                        const src = img.src || img.getAttribute('data-src');
                        if (src &&
                            !src.startsWith('data:') &&
                            (src.includes('product') ||
                                src.includes('image') ||
                                src.match(/\.(jpg|jpeg|png|webp)/i)) &&
                            !src.includes('icon') &&
                            !src.includes('logo')) {
                            image = src;
                            break;
                        }
                    }
                }

                // Clean up price if needed
                if (price) {
                    // Ensure price starts with a currency symbol if it doesn't have one
                    if (!price.match(/[\$\£\€]/)) {
                        price = '$' + price;
                    }
                    // Remove any extra text after the price
                    price = price.split('\n')[0].trim();
                }

                return {
                    title,
                    image,
                    price,
                    debug: {
                        foundSelectors: {
                            image: imageSelectors.find(s => document.querySelector(s)),
                            price: priceSelectors.find(s => document.querySelector(s))
                        }
                    }
                };
            });

            console.log('URL:', await page.url());
            console.log('Data:', productData);
            console.log('Debug info:', productData.debug);

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
