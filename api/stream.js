// api/stream.js

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
        let targetUrl = '';
        if (type === 'tv' && season && episode) {
            targetUrl = `https://vidlink.pro/tv/${id}/${season}/${episode}`;
        } else {
            targetUrl = `https://vidlink.pro/movie/${id}`;
        }

        console.log(`[Backend] Target URL: ${targetUrl}`);

        // 3. ScrapingBee API Configuration
        // render_js=true ensures Cloudflare is bypassed and JavaScript executes, 
        // revealing hidden .m3u8 links in the rendered DOM.
        const scrapingBeeApiKey = '50RWEEP8FSOT8W7004CGLZCCLXHV55F7PVX77WQV588YBVQ8OVLFQMSA50V1XFHOFNBUZK8LRI7S7HBC';
        const proxyUrl = `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeApiKey}&url=${encodeURIComponent(targetUrl)}&render_js=true`;

        console.log(`[Backend] Fetching via ScrapingBee...`);

        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`ScrapingBee API returned status: ${response.status}`);
        }

        const html = await response.text();
        console.log(`[Backend] Successfully fetched HTML. Length: ${html.length} characters`);

        // 4. Extract the .m3u8 URL using a broad, reliable Regex
        // This catches ANY http/https link containing '.m3u8' in the rendered HTML
        const m3u8Regex = /(https?:\/\/[^\s"']+\.m3u8(?:\?[^\s"']*)?)/gi;
        const matches = [...html.matchAll(m3u8Regex)];

        let streamUrl = null;

        if (matches.length > 0) {
            // Get the first valid .m3u8 link found
            streamUrl = matches[0][1];
            console.log(`[Backend] SUCCESS! Extracted .m3u8: ${streamUrl}`);
            
            return res.status(200).json({
                success: true,
                id: id,
                type: 'hls',
                url: streamUrl
            });
        }

        // 5. Fallback: If regex fails, return the original embed URL
        console.warn(`[Backend] No .m3u8 found in rendered HTML. Falling back to iframe.`);
        return res.status(200).json({
            success: true,
            id: id,
            type: 'iframe',
            url: targetUrl
        });

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
