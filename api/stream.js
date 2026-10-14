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

    // 2. Get parameters from the query (supports both TMDB and IMDb IDs)
    const { id, type, season, episode } = req.query;
    
    if (!id) {
        return res.status(400).json({ error: "Missing 'id' query parameter" });
    }

    try {
        // 3. Construct the target embed URL (e.g., vidcore.org)
        const mediaType = type === 'tv' ? 'tv' : 'movie';
        let embedUrl = `https://vidcore.org/embed/${mediaType}/${id}`;
        
        if (mediaType === 'tv' && season && episode) {
            embedUrl = `https://vidcore.org/embed/tv/${id}/${season}/${episode}`;
        }

        console.log(`[Stream Grabber] Fetching embed page: ${embedUrl}`);

        // 4. Fetch the raw HTML of the embed page with browser-like headers
        const response = await fetch(embedUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://vidcore.org/',
                'Origin': 'https://vidcore.org'
            },
            signal: AbortSignal.timeout(8000) // 8-second timeout to prevent Vercel hanging
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();

        // 5. GRAB THE .m3u8 LINK: Regex to find HLS streams in the HTML/JS source
        // Matches patterns like: file: "https://...m3u8", src: "https://...m3u8", or hls: "https://...m3u8"
        const m3u8Regex = /(?:file|src|hls|source)\s*[:=]\s*["'](https[^"']+\.m3u8[^"']*)["']/gi;
        const matches = [...html.matchAll(m3u8Regex)];

        let streamUrl = null;

        if (matches.length > 0) {
            // Extract the first valid .m3u8 link found
            streamUrl = matches[0][1];
            console.log(`[Stream Grabber] SUCCESS! Extracted .m3u8: ${streamUrl}`);
            
            return res.status(200).json({
                success: true,
                id: id,
                type: 'hls', // Tells frontend to use Plyr + HLS.js
                url: streamUrl,
                message: "Direct .m3u8 stream extracted successfully from page source."
            });
        }

        // 6. FALLBACK: If regex fails (link is obfuscated via JS), return the embed URL
        console.warn(`[Stream Grabber] Could not extract .m3u8 via regex. Falling back to iframe.`);
        return res.status(200).json({
            success: true,
            id: id,
            type: 'iframe', // Tells frontend to load an iframe instead
            url: embedUrl,
            message: "Direct .m3u8 not found in page source (likely obfuscated). Falling back to embed player."
        });

    } catch (error) {
        console.error("[Stream Grabber] Fatal Error:", error.message);
        
        // 7. ULTIMATE FALLBACK: Prevent frontend breakage even if the fetch completely fails
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
