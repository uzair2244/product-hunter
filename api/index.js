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
                    // Daraz specific selectors (enhanced)
                    '.pdp-mod-product-badge-title',
                    '.pdp-product-title',
                    '.pdp-title',
                    '[data-spm="product_title"]',
                    'h1.pdp-title',
                    'h1[data-spm="product_title"]',
                    '.pdp-mod-product-title',           // Additional Daraz selector
                    '.pdp-name',                        // Additional Daraz selector
                    // Temu specific selectors
                    '.DetailName_title__1sYwd',
                    '.ProductInfo_title__3E3Rp',
                    '.ProductTitle_wrapper__3RJ_6',
                    '[data-testid="product-title"]',
                    // Previous selectors remain...
                    '.title--wrap--UUHae_g .title--title--G6mZm_W',
                    '.product-name',
                    '.product-title-text',
                    '[data-pl="product-title"]',
                    '#productTitle',
                    '#title',
                    '[itemprop="name"]',
                    'h1'
                ];

                // Generic image selectors
                const imageSelectors = [
                    // Daraz enhanced selectors
                    '.pdp-mod-common-image img',
                    '.gallery-preview-panel__image',
                    '.item-gallery img',
                    '[data-spm="preview"] img',
                    '.pdp-block-main_pic img',          // Additional Daraz selector
                    '.next-slick-list img',             // Additional Daraz selector
                    // Temu specific selectors
                    '.DetailGallery_mainImage__2_LG9',
                    '.ProductGallery_image__3UIOE',
                    '[data-testid="product-image"]',
                    '.gallery-preview img',
                    // Previous selectors remain...
                    '.image-view--image--Uu0Ba2D',
                    '.gallery-image--image--P2S3P_r',
                    '.pdp-image',
                    'img[data-role="pdp-image"]',
                    '#landingImage',
                    '#imgBlkFront',
                    '#main-image',
                    '[itemprop="image"]',
                    '.product-image img',
                    '.main-image img',
                    '.gallery-image'
                ];

                // Generic price selectors
                const priceSelectors = [
                    // Daraz specific selectors - more precise targeting
                    '.pdp-product-price .pdp-price_type_normal.pdp-price_color_orange',
                    '.pdp-mod-product-price .pdp-price_type_normal',
                    '#module_product_price_1 .pdp-price_type_normal',
                    '.pdp-product-price span.notranslate:not(.pdp-price_type_deleted)',
                    // Keep existing non-Daraz selectors
                    '.PriceComponent_wrapper__2Kc_j',
                    '.ProductPrice_price__3TmZi',
                    '[data-testid="product-price"]',
                    '.price-current-value',
                    '.price--originalText--Zsc6sMk',
                    '.product-price-current',
                    '.uniform-banner-box-price',
                    '#priceblock_ourprice',
                    '.a-price-whole',
                    '#price_inside_buybox',
                    '[itemprop="price"]',
                    '.product-price',
                    '.price-current',
                    '.current-price'
                ];

                let title = null;
                let image = null;
                let price = null;

                // Enhanced title finding logic with additional checks
                for (const selector of mobileSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        const text = element.innerText || element.textContent;
                        if (text) {
                            const cleanText = text.trim();
                            if (cleanText && cleanText.length > 5 && !cleanText.includes('verify')) {
                                title = cleanText;
                                break;
                            }
                        }
                    }
                    if (title) break;
                }

                // Enhanced image finding logic
                for (const selector of imageSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        image = element.src ||
                            element.getAttribute('data-src') ||
                            element.getAttribute('data-lazy-src') ||
                            element.getAttribute('content') ||
                            element.getAttribute('data-zoom-image') ||
                            element.getAttribute('data-original');  // Additional attribute check

                        if (image && !image.startsWith('data:') && !image.includes('placeholder')) {
                            break;
                        }
                    }
                    if (image) break;
                }

                // Enhanced price finding logic
                for (const selector of priceSelectors) {
                    try {
                        // Direct Daraz price extraction
                        if (window.location.href.includes('daraz')) {
                            // Try to get price from the exact structure
                            const priceContainer = document.querySelector('#module_product_price_1 .pdp-product-price');
                            if (priceContainer) {
                                const orangePrice = priceContainer.querySelector('.pdp-price_color_orange');
                                if (orangePrice) {
                                    price = orangePrice.textContent.trim();
                                    console.log('Found exact Daraz price:', price);
                                    break;
                                }
                            }

                            // Super specific fallback
                            const allOrangePrices = document.querySelectorAll('.pdp-price_color_orange');
                            for (const p of allOrangePrices) {
                                if (p.textContent && !p.closest('.origin-block')) {
                                    price = p.textContent.trim();
                                    console.log('Found Daraz orange price:', price);
                                    break;
                                }
                            }

                            // Last resort: any price that's not in origin-block
                            if (!price) {
                                const allPrices = document.querySelectorAll('.pdp-price');
                                for (const p of allPrices) {
                                    if (!p.closest('.origin-block') &&
                                        !p.classList.contains('pdp-price_type_deleted')) {
                                        price = p.textContent.trim();
                                        console.log('Found Daraz fallback price:', price);
                                        break;
                                    }
                                }
                            }

                            if (price) break;
                        }

                        // Original price finding logic for other sites
                        const elements = document.querySelectorAll(selector);
                        for (const element of elements) {
                            // Ignore if it's a deleted/original price
                            if (element.classList.contains('pdp-price_type_deleted')) {
                                console.log('Skipping deleted price');
                                continue;
                            }

                            // Handle different currency formats
                            let priceText = element.innerText || element.textContent;
                            priceText = priceText.replace(/Rs\.|PKR|₨/i, '').trim();
                            console.log(`Cleaned price text: ${priceText}`);

                            // Extract numbers and decimals
                            const priceMatch = priceText.match(/[\d,]+(\.\d{1,2})?/);
                            if (priceMatch) {
                                price = priceMatch[0].replace(/,/g, '');
                                if (window.location.href.includes('daraz')) {
                                    price = 'Rs. ' + price;
                                }
                                console.log(`Final price: ${price}`);
                                break;
                            }
                        }
                    } catch (err) {
                        console.log('Error in price extraction:', err);
                        continue;
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

                // Add debug logging
                console.log('Final price result:', price);
                console.log('DOM structure:', document.querySelector('#module_product_price_1')?.outerHTML);

                return {
                    title,
                    image,
                    price,
                    debug: {
                        foundSelectors: {
                            title: mobileSelectors.find(s => document.querySelector(s)),
                            image: imageSelectors.find(s => document.querySelector(s)),
                            price: priceSelectors.find(s => document.querySelector(s))
                        },
                        priceAttempts: priceSelectors.map(s => ({
                            selector: s,
                            found: !!document.querySelector(s),
                            text: document.querySelector(s)?.innerText || null
                        }))
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
