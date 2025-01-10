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
                    'a-price',
                    'a-text-price',
                    'apexPriceToPay',
                    '.pdp-product-price span',
                    '.pdp-price_color_orange',
                    '.pdp-mod-product-price-view span',
                    '[data-spm="price"]',
                    // New Amazon-specific selectors from the provided HTML
                    '.a-price .a-offscreen',               // Hidden price span
                    '.a-price-range .a-price .a-offscreen', // Price range
                    '.a-price.a-text-price',               // Text price
                    '.a-price-dash',                       // Price dash (range separator)
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

                // Add this before the price selectors loop
                if (window.location.href.includes('daraz')) {
                    let maxPrice = 0;
                    let maxPriceElement = null;

                    // Try specific Daraz price containers first
                    const specificSelectors = [
                        '.pdp-product-price',
                        '.pdp-block-price',
                        '.pdp-mod-product-info',
                        '.origin-block',
                        '[data-mod-name="pdp_order"]'
                    ];

                    for (const selector of specificSelectors) {
                        const container = document.querySelector(selector);
                        if (container) {
                            const text = container.innerText || container.textContent;
                            const matches = text.match(/(?:Rs\.?|₨|TK|BDT)?\s*([\d,]+(?:\.\d{2})?)/gi);
                            if (matches) {
                                matches.forEach(match => {
                                    const numericValue = parseFloat(match.replace(/[^\d.]/g, ''));
                                    if (numericValue > maxPrice) {
                                        maxPrice = numericValue;
                                        maxPriceElement = container;
                                    }
                                });
                            }
                        }
                    }

                    // If no price found, try aggressive search
                    if (maxPrice === 0) {
                        const allElements = document.querySelectorAll('*');
                        for (const element of allElements) {
                            const text = element.innerText || element.textContent;
                            if (text) {
                                const matches = text.match(/(?:Rs\.?|₨|TK|BDT)?\s*([\d,]+(?:\.\d{2})?)/gi);
                                if (matches) {
                                    matches.forEach(match => {
                                        const numericValue = parseFloat(match.replace(/[^\d.]/g, ''));
                                        // Only consider prices above 500 to avoid small numbers
                                        if (numericValue > maxPrice && numericValue >= 500) {
                                            maxPrice = numericValue;
                                            maxPriceElement = element;
                                        }
                                    });
                                }
                            }
                        }
                    }

                    if (maxPrice > 0) {
                        price = 'Rs. ' + maxPrice;
                        console.log('Found price:', price);
                        console.log('Price element:', {
                            tagName: maxPriceElement?.tagName,
                            className: maxPriceElement?.className,
                            id: maxPriceElement?.id,
                            text: maxPriceElement?.innerText?.trim()
                        });
                    }

                    // Add extensive debug logging
                    console.log('Price Debug:', {
                        url: window.location.href,
                        maxPrice,
                        allPrices: Array.from(document.querySelectorAll('*'))
                            .filter(el => {
                                const text = el.innerText || el.textContent;
                                return text && text.match(/(?:Rs\.?|₨|TK|BDT)?\s*[\d,]+(?:\.\d{2})?/i);
                            })
                            .map(el => ({
                                text: (el.innerText || el.textContent).trim(),
                                numericValue: parseFloat((el.innerText || el.textContent)
                                    .match(/[\d,]+(?:\.\d{2})?/)?.[0]?.replace(/,/g, '') || '0'),
                                element: {
                                    tagName: el.tagName,
                                    className: el.className,
                                    id: el.id
                                }
                            }))
                            .sort((a, b) => b.numericValue - a.numericValue)
                    });
                }

                // Enhanced price finding logic
                for (const selector of priceSelectors) {
                    try {
                        // Specific Daraz price extraction
                        if (window.location.href.includes('daraz')) {
                            // Method 0: Try direct price module
                            const priceModule = document.querySelector('#module_product_price_1');
                            if (priceModule) {
                                const priceText = priceModule.textContent;
                                if (priceText) {
                                    const cleanText = priceText.replace(/Rs\.|PKR|₨/gi, '').trim();
                                    const priceMatch = cleanText.match(/[\d,]+(\.\d{1,2})?/);
                                    if (priceMatch) {
                                        price = 'Rs. ' + priceMatch[0].replace(/,/g, '');
                                        console.log('Found Daraz price (module method):', price);
                                        break;
                                    }
                                }
                            }

                            // Method 1: Try structured approach
                            const priceElements = document.querySelectorAll(selector);
                            for (const element of priceElements) {
                                // Skip if it's a deleted/original price
                                if (element.classList.contains('pdp-price_type_deleted')) continue;

                                // Get direct text content
                                let priceText = element.innerText || element.textContent;
                                if (!priceText) continue;

                                // Clean up the price text
                                priceText = priceText.replace(/Rs\.|PKR|₨/gi, '').trim();

                                // Match the number pattern
                                const priceMatch = priceText.match(/[\d,]+(\.\d{1,2})?/);
                                if (priceMatch) {
                                    price = 'Rs. ' + priceMatch[0].replace(/,/g, '');
                                    console.log('Found Daraz price:', price);
                                    break;
                                }
                            }

                            // Method 2: Direct parent-child approach
                            if (!price) {
                                const priceContainer = document.querySelector('.pdp-product-price');
                                if (priceContainer) {
                                    const currentPrice = priceContainer.querySelector(':not(.pdp-price_type_deleted)');
                                    if (currentPrice) {
                                        let priceText = currentPrice.innerText.trim();
                                        priceText = priceText.replace(/Rs\.|PKR|₨/gi, '').trim();
                                        const priceMatch = priceText.match(/[\d,]+(\.\d{1,2})?/);
                                        if (priceMatch) {
                                            price = 'Rs. ' + priceMatch[0].replace(/,/g, '');
                                            console.log('Found Daraz price (method 2):', price);
                                        }
                                    }
                                }
                            }

                            // if (price) break;
                            if (price) {
                                // Remove unwanted characters and identify the currency
                                const detectedCurrency = price.match(/[$₹₨]|Rs\.?/i)?.[0] || 'Unknown';
                                price = price.replace(/[$₹₨]|Rs\.?/gi, '').trim(); // Remove currency symbols

                                // Ensure numeric validation
                                if (parseFloat(price) > 0) {
                                    price = window.location.href.includes('daraz') ? `Rs. ${price}` : price;
                                    break;
                                } else {
                                    console.error('Invalid price detected:', price);
                                    break;
                                }

                                console.log('Final price:', price, 'Currency:', detectedCurrency);
                            }
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
                    // Remove any $ symbol if it exists (we only want Rs.)
                    price = price.replace('$', '');
                    // Ensure price format is correct
                    if (!price.startsWith('Rs.')) {
                        price = 'Rs. ' + price;
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
                    priceElements: document.querySelectorAll('.pdp-price').length,
                    priceContainer: !!document.querySelector('.pdp-product-price'),
                    finalPrice: price
                });

                // Add this debug logging right after price extraction
                console.log('DOM Price Debug:', {
                    priceModule: document.querySelector('#module_product_price_1')?.textContent,
                    htmlStructure: document.querySelector('#module_product_price_1')?.innerHTML,
                    allPriceElements: Array.from(document.querySelectorAll('[class*="price"]')).map(el => ({
                        class: el.className,
                        text: el.textContent
                    }))
                });

                // Add this debug logging
                console.log('DOM Structure Debug:', {
                    bodyText: document.body.innerText,
                    priceRelatedElements: Array.from(document.querySelectorAll('*'))
                        .filter(el => {
                            const text = el.innerText || el.textContent;
                            return text && text.match(/(?:Rs\.?|₨|TK|BDT)?\s*[\d,]+(\.\d{2})?/i);
                        })
                        .map(el => ({
                            tagName: el.tagName,
                            className: el.className,
                            id: el.id,
                            text: el.innerText || el.textContent
                        }))
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
