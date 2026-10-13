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

    // 2. Get the IMDb ID from query parameters
    const { imdb } = req.query;
    if (!imdb) {
        return res.status(400).json({ error: "Missing 'imdb' query parameter" });
    }

    try {
        // 3. Target vidsrc.sh API
        // Note: Most vidsrc-based providers use the /api/source/{id} endpoint.
        const targetUrl = `https://vidsrc.sh/api/source/${imdb}`;
        
        console.log(`[Stream API] Attempting to fetch from: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://vidsrc.sh/',
                'Origin': 'https://vidsrc.sh'
            }
        });

        // Check if the resolver returned an HTTP error (e.g., 404, 500, 403)
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[Stream API] Raw Response from vidsrc.sh:`, JSON.stringify(data));

        // 4. Parse the response to find the .m3u8 link
        // We check multiple common JSON structures used by vidsrc providers
        let streamUrl = null;

        if (data.result && data.result.sources && data.result.sources.length > 0) {
            // Common structure: { result: { sources: [{ file: "https://...m3u8", label: "auto" }] } }
            streamUrl = data.result.sources[0].file;
        } else if (data.url) {
            // Alternative structure: { url: "https://...m3u8" }
            streamUrl = data.url;
        } else if (data.source && data.source.file) {
            // Alternative structure: { source: { file: "https://...m3u8" } }
            streamUrl = data.source.file;
        } else if (data.sources && data.sources.length > 0) {
            // Alternative structure: { sources: [{ file: "https://...m3u8" }] }
            streamUrl = data.sources[0].file;
        }

        // 5. Return the extracted URL or an error
        if (streamUrl) {
            console.log(`[Stream API] Success! Extracted URL: ${streamUrl}`);
            return res.status(200).json({ 
                success: true,
                imdb_id: imdb,
                url: streamUrl 
            });
        } else {
            console.warn(`[Stream API] No stream URL found in the response.`);
            return res.status(404).json({ 
                error: "No streaming link found in response", 
                rawResponse: data,
                hint: "Check the Vercel logs above to see the exact JSON structure returned by vidsrc.sh and update the parsing logic if needed."
            });
        }

    } catch (error) {
        // 6. Verbose error logging for Vercel Dashboard debugging
        console.error("[Stream API] Fetch Failed:", error.message);
        console.error("[Stream API] Error Cause:", error.cause);
        
        return res.status(500).json({ 
            error: "Scraper execution failed", 
            details: error.message,
            hint: "The target URL may be blocking Vercel's IP, or the endpoint structure has changed."
        });
    }
}
