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

                // Enhanced price selectors
                const priceSelectors = [
                    // Daraz enhanced selectors (putting these first)
                    '.pdp-price',
                    '.pdp-product-price',
                    '.pdp-price_type_normal',
                    '[data-spm="price"]',
                    '.pdp-mod-product-price-view',
                    '.pdp-price-box',
                    '.price--original--2Xrz8',         // Additional Daraz selector
                    '.currency--GVKjl',                // Additional Daraz selector
                    '.pdp-price strong',               // Additional Daraz selector
                    '[data-price]',                    // Additional Daraz selector
                    // Temu enhanced selectors
                    '[data-testid="price"]',
                    '[data-testid="product-price"]',
                    '.PriceComponent_wrapper__2Kc_j',
                    '.ProductPrice_price__3TmZi',
                    '.price-current-value',
                    '.PriceText_wrapper__2zrM_',       // Additional Temu selector
                    '.ProductPriceText_wrapper__3UxeF', // Additional Temu selector
                    '.PriceValue_wrapper__2DxF_',      // Additional Temu selector
                    // Previous selectors remain...
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
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        let priceText = element.innerText || element.textContent;
                        if (priceText) {
                            // Store original text for currency detection
                            const originalText = priceText;

                            // Clean up the text but keep original for currency detection
                            priceText = priceText.replace(/,/g, '').trim();

                            // Try to extract the price using different patterns
                            let priceMatch = priceText.match(/(\d+(?:\.\d{1,2})?)/);

                            if (priceMatch) {
                                let extractedPrice = priceMatch[0];

                                // Determine the currency based on URL and text content
                                if (window.location.href.includes('daraz') ||
                                    originalText.includes('Rs.') ||
                                    originalText.includes('PKR') ||
                                    originalText.includes('₨')) {
                                    price = 'Rs. ' + extractedPrice;
                                    break;
                                } else if (window.location.href.includes('temu')) {
                                    price = '$' + extractedPrice;
                                    break;
                                } else if (originalText.includes('$')) {
                                    price = '$' + extractedPrice;
                                    break;
                                } else {
                                    // Default case
                                    price = '$' + extractedPrice;
                                    break;
                                }
                            }
                        }
                    }
                    if (price) break;
                }

                // Super fallback for price with better currency detection
                if (!price) {
                    // Look for price with currency symbols
                    const priceRegex = /(?:Rs\.?|PKR|₨)\s*\d+(?:,\d{3})*(?:\.\d{2})?|\$\s*\d+(?:,\d{3})*(?:\.\d{2})?/i;
                    const allElements = document.querySelectorAll('*');
                    for (const element of allElements) {
                        const text = element.innerText || element.textContent;
                        if (text) {
                            const match = text.match(priceRegex);
                            if (match) {
                                let matchedPrice = match[0].trim();
                                // Clean up the matched price
                                if (matchedPrice.match(/(?:Rs\.?|PKR|₨)/i)) {
                                    // Convert to standard Rs. format
                                    matchedPrice = matchedPrice.replace(/(?:Rs\.?|PKR|₨)/i, '').trim();
                                    matchedPrice = 'Rs. ' + matchedPrice.replace(/,/g, '');
                                }
                                price = matchedPrice;
                                break;
                            }
                        }
                    }
                }

                // Final price cleanup
                if (price) {
                    // Remove any extra whitespace or newlines
                    price = price.replace(/\s+/g, ' ').trim();

                    // Ensure proper currency format
                    if (window.location.href.includes('daraz')) {
                        // Convert any mistakenly added $ to Rs.
                        price = price.replace('$', '');
                        if (!price.includes('Rs.')) {
                            price = 'Rs. ' + price;
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

                return {
                    title,
                    image,
                    price,
                    debug: {
                        foundSelectors: {
                            title: mobileSelectors.find(s => document.querySelector(s)),
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
