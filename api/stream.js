// api/stream.js

export default async function handler(req, res) {
    // 1. Enable CORS for frontend communication
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { imdb, type, season, episode } = req.query;
    if (!imdb) {
        return res.status(400).json({ error: "Missing 'imdb' query parameter" });
    }

    try {
        const isTv = type === 'tv';
        
        // 2. List of public resolver APIs to try sequentially.
        // We try multiple because free public APIs frequently go offline or change domains.
        const apis = [
            // Provider 1: RGShows (Known to return direct sources)
            `https://api.rgshows.me/api/${isTv ? 'tv' : 'movies'}/${imdb}${isTv ? `/${season}/${episode}` : ''}`,
            // Provider 2: Vidsrc API (If active)
            `https://vidsrcapi.vercel.app/api/${isTv ? 'tv' : 'movie'}/${imdb}${isTv ? `/${season}/${episode}` : ''}`,
            // Provider 3: MultiEmbed (Sometimes returns JSON)
            `https://multiembed.mov/api/v1/video?id=${imdb}${isTv ? `&s=${season}&e=${episode}` : ''}`
        ];

        let lastError = "All providers failed or returned no data";

        for (const apiUrl of apis) {
            try {
                console.log(`[Stream API] Trying provider: ${apiUrl}`);
                
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    },
                    // 5-second timeout so we don't hang on dead APIs
                    signal: AbortSignal.timeout(5000) 
                });

                if (!response.ok) {
                    console.log(`[Stream API] Provider returned status ${response.status}, skipping...`);
                    continue;
                }

                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    console.log(`[Stream API] Provider did not return JSON, skipping...`);
                    continue;
                }

                const data = await response.json();
                console.log(`[Stream API] Provider response preview:`, JSON.stringify(data).substring(0, 200) + '...');

                // 3. Smart extraction of .m3u8 URL from various JSON structures
                let streamUrl = null;
                
                if (data.result && data.result.sources && data.result.sources.length > 0) {
                    const source = data.result.sources.find(s => s.quality === 'auto' || s.quality === '1080p' || s.quality === '720p') || data.result.sources[0];
                    streamUrl = source.file || source.url;
                } else if (data.url && typeof data.url === 'string' && data.url.includes('.m3u8')) {
                    streamUrl = data.url;
                } else if (data.sources && data.sources.length > 0) {
                    const source = data.sources.find(s => s.quality === 'auto' || s.quality === '1080p') || data.sources[0];
                    streamUrl = source.file || source.url;
                } else if (data.data && data.data.url) {
                    streamUrl = data.data.url;
                }

                // 4. If we found a valid URL, return it immediately
                if (streamUrl) {
                    console.log(`[Stream API] SUCCESS! Extracted URL: ${streamUrl}`);
                    return res.status(200).json({ 
                        success: true, 
                        imdb_id: imdb, 
                        url: streamUrl,
                        provider: apiUrl
                    });
                }

            } catch (err) {
                console.log(`[Stream API] Provider failed: ${err.message}`);
                lastError = err.message;
                continue; // Move to the next provider in the list
            }
        }

        // 5. If the loop finishes without returning, no provider worked
        console.warn(`[Stream API] All providers failed for IMDb ID: ${imdb}`);
        return res.status(404).json({ 
            error: "No working stream found across all tested providers.",
            hint: "Free public resolver APIs frequently go offline or change domains. Check Vercel logs for details.",
            lastError: lastError
        });

    } catch (error) {
        console.error("[Stream API] Fatal Error:", error.message);
        return res.status(500).json({ 
            error: "Server execution failed", 
            details: error.message 
        });
    }
}
