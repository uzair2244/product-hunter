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
        // const mobileLink = link.replace('www.aliexpress.com', 'm.aliexpress.com');

        // Navigate with minimal wait
        await page.goto(link, {
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
                // New Daraz selectors based on recent structure
                '.pdp-price_size_xl',                  // Large-sized price
                '.pdp-mod-product-price-normal',       // Normal price container
                '.pdp-mod-product-price-value',        // Price value
                '.pdp-price-number',                   // Price number
                '.origin-block-content',               // Price block
                '[data-tracking="product-price"]',     // Price tracking attribute
                '[data-spm-anchor-id*="price"]',       // Price anchor
                // Previous selectors
                '.pdp-price',
                '.pdp-price_type_normal',
                '.pdp-product-price span',
                '.pdp-price_color_orange',
                '.pdp-mod-product-price-view span',
                '[data-spm="price"]',
                //Alibaba specific selectors
                '.price-list .price-item .price span',
                'div.price-item div.price span',
                // New Amazon-specific selectors from the provided HTML
                '.a-price .a-offscreen',               // Hidden price span
                // '.a-price-range .a-price .a-offscreen', // Price range
                // '.a-price.a-text-price',               // Text price
                // '.a-price-dash',                       // Price dash (range separator)
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

            // Enhanced price finding logic
            for (const selector of priceSelectors) {
                try {
                    // General price finding logic
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        // Handle different currency formats
                        let priceText = element.innerText || element.textContent;
                        priceText = priceText.replace(/Rs\.|PKR|₨|\$/i, '').trim();
                        console.log(`Cleaned price text: ${priceText}`);

                        // Extract numbers and decimals
                        const priceMatch = priceText.match(/[\d,]+(\.\d{1,2})?/);
                        if (priceMatch) {
                            price = priceMatch[0].replace(/,/g, '');
                            if (window.location.href.includes('amazon') || window.location.href.includes('alibaba')) {
                                price = `$${price}`;
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
                // Ensure price format is correct
                if (!price.startsWith('$')) {
                    price = `$${price}`;
                }
                // Remove any extra text after the price
                price = price.split('\n')[0].trim();
            }

            // Add debug logging
            console.log('Final price result:', price);
            console.log('DOM structure:', document.querySelector('#module_product_price_1')?.outerHTML);

            // Add more debug logging
            console.log('Price extraction debug:', {
                url: window.location.href,
                priceElements: document.querySelectorAll('.price').length,
                priceContainer: !!document.querySelector('.price-container'),
                finalPrice: price
            });

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
};
