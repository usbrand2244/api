// api/stream.js

export default async function handler(req, res) {
    // 1. Enable CORS for frontend communication
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. Get parameters from the query
    // Note: vidcore uses TMDB IDs (like 533535), but we'll accept whatever ID is passed
    const { id, type, season, episode } = req.query;
    
    if (!id) {
        return res.status(400).json({ error: "Missing 'id' query parameter" });
    }

    try {
        // 3. Construct the vidcore.org embed URL
        const mediaType = type === 'tv' ? 'tv' : 'movie';
        let embedUrl = `https://vidcore.org/embed/${mediaType}/${id}`;
        
        if (mediaType === 'tv' && season && episode) {
            embedUrl = `https://vidcore.org/embed/tv/${id}/${season}/${episode}`;
        }

        console.log(`[Backend] Fetching vidcore embed page: ${embedUrl}`);

        // 4. Fetch the HTML page with browser-like headers to bypass basic bot protection
        const response = await fetch(embedUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://vidcore.org/',
                'Origin': 'https://vidcore.org'
            },
            signal: AbortSignal.timeout(8000) // 8 second timeout
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();

        // 5. Extract the .m3u8 URL from the HTML using Regex
        // This looks for common patterns like: file: "https://...m3u8" or src="https://...m3u8"
        const m3u8Regex = /(?:file|src)\s*:\s*["'](https[^"']+\.m3u8[^"']*)["']|<source\s+[^>]*src=["'](https[^"']+\.m3u8[^"']*)["']/i;
        const match = html.match(m3u8Regex);

        let streamUrl = null;

        if (match) {
            // The regex has two capture groups, we take the one that matched
            streamUrl = match[1] || match[2];
            console.log(`[Backend] SUCCESS! Extracted .m3u8: ${streamUrl}`);
            
            return res.status(200).json({
                success: true,
                id: id,
                type: 'hls',
                url: streamUrl,
                message: "Direct .m3u8 stream extracted successfully."
            });
        }

        // 6. FALLBACK: If .m3u8 extraction fails, return the embed URL
        // This ensures your frontend can still load the movie via iframe if the scraper fails
        console.warn(`[Backend] Could not extract .m3u8. Falling back to embed URL.`);
        return res.status(200).json({
            success: true,
            id: id,
            type: 'iframe',
            url: embedUrl,
            message: "Direct .m3u8 not found in page source. Falling back to embed player."
        });

    } catch (error) {
        console.error("[Backend] Fatal Error:", error.message);
        
        // Ultimate fallback: return the embed URL so the user can still watch
        const mediaType = type === 'tv' ? 'tv' : 'movie';
        const fallbackUrl = (mediaType === 'tv' && season && episode) 
            ? `https://vidcore.org/embed/tv/${id}/${season}/${episode}`
            : `https://vidcore.org/embed/movie/${id}`;

        return res.status(200).json({
            success: true,
            id: id,
            type: 'iframe',
            url: fallbackUrl,
            message: `Backend fetch failed (${error.message}). Falling back to embed player.`
        });
    }
}
