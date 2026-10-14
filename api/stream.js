// api/stream.js
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
    // 1. Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { id, type, season, episode } = req.query;
    if (!id) {
        return res.status(400).json({ error: "Missing 'id' query parameter" });
    }

    try {
        // 2. Construct the target embed URL
        let embedUrl = '';
        if (type === 'tv' && season && episode) {
            embedUrl = `https://vidlink.pro/tv/${id}/${season}/${episode}`;
        } else {
            embedUrl = `https://vidlink.pro/movie/${id}`;
        }

        console.log(`[Backend] Launching headless browser for: ${embedUrl}`);

        // 3. Launch Puppeteer with @sparticuz/chromium for Vercel Serverless
        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        let streamUrl = null;

        // 4. Intercept all network traffic looking for the .m3u8 video file
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            if (url.toLowerCase().includes('.m3u8')) {
                streamUrl = url;
            }
            request.continue(); // Must continue all requests to avoid hanging
        });

        // 5. Navigate and wait for network to be idle (10s timeout for Vercel limits)
        await page.goto(embedUrl, { 
            waitUntil: 'networkidle2',
            timeout: 10000 
        });

        await browser.close();

        // 6. Return the result
        if (streamUrl) {
            console.log(`[Backend] SUCCESS! Found .m3u8: ${streamUrl}`);
            return res.status(200).json({
                success: true,
                id: id,
                type: 'hls', // Tells frontend to use HLS.js
                url: streamUrl
            });
        } else {
            console.warn(`[Backend] No .m3u8 found. Falling back to iframe.`);
            return res.status(200).json({
                success: true,
                id: id,
                type: 'iframe', // Tells frontend to use iframe fallback
                url: embedUrl
            });
        }

    } catch (error) {
        console.error("[Backend] Fatal Error:", error.message);
        
        // Ultimate fallback to ensure the site never breaks
        const fallbackUrl = (type === 'tv' && season && episode) 
            ? `https://vidlink.pro/tv/${id}/${season}/${episode}`
            : `https://vidlink.pro/movie/${id}`;

        return res.status(200).json({
            success: true,
            id: id,
            type: 'iframe',
            url: fallbackUrl,
            message: `Backend fetch failed. Falling back to embed.`
        });
    }
}
