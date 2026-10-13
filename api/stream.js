// api/stream.js

export default async function handler(req, res) {
    // 1. Enable CORS
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
        // 2. List of public providers to try sequentially.
        // Free APIs go down frequently, so we try multiple.
        const providers = [
            `https://vidsrcapi.vercel.app/api/movie/${imdb}`,
            `https://api.rgshows.me/api/movies/${imdb}`
        ];

        let lastError = "All providers failed";

        for (const url of providers) {
            try {
                console.log(`[Stream API] Trying provider: ${url}`);
                
                const response = await fetch(url, {
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
                    console.log(`[Stream API] Provider did not return JSON (got ${contentType}), skipping...`);
                    continue;
                }

                const data = await response.json();
                console.log(`[Stream API] Success! Data preview:`, JSON.stringify(data).substring(0, 200) + '...');

                // 3. Extract the stream URL from various JSON structures
                let streamUrl = null;
                
                if (data.result && data.result.sources && data.result.sources.length > 0) {
                    const source = data.result.sources.find(s => s.quality === 'auto' || s.quality === '1080p') || data.result.sources[0];
                    streamUrl = source.file || source.url;
                } else if (data.url && typeof data.url === 'string') {
                    streamUrl = data.url;
                } else if (data.sources && data.sources.length > 0) {
                    const source = data.sources.find(s => s.quality === 'auto' || s.quality === '1080p') || data.sources[0];
                    streamUrl = source.file || source.url;
                }

                // 4. If we found a valid URL, return it immediately
                if (streamUrl) {
                    console.log(`[Stream API] SUCCESS! Extracted URL: ${streamUrl}`);
                    return res.status(200).json({ 
                        success: true, 
                        imdb_id: imdb, 
                        url: streamUrl,
                        provider: url
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
            hint: "Free public resolver APIs frequently go offline or block Vercel IPs. Check Function Logs for details.",
            lastError: lastError
        });

    } catch (error) {
        console.error("[Stream API] FATAL ERROR:", error.message, error.cause);
        return res.status(500).json({ 
            error: "Server execution failed", 
            details: error.message 
        });
    }
}
