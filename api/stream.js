// api/stream.js

export default async function handler(req, res) {
    // 1. Enable CORS so your frontend can communicate with this API securely
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. Get the IMDb ID from the query parameters
    const { imdb } = req.query;
    if (!imdb) {
        return res.status(400).json({ error: "Missing 'imdb' query parameter" });
    }

    try {
        // 3. Pure HTTP request to the HLS aggregator layer
        // ⚠️ IMPORTANT: Replace this URL with the actual endpoint of the 
        // specific resolver API you are using (e.g., https://vidsrcapi.vercel.app/api/movie/${imdb})
        const targetUrl = `https://vidsrc.xyz/api/source/${imdb}`;
        
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const data = await response.json();

        // 4. Check if the resolver returned a valid master.m3u8 link
        if (data && data.url) {
            return res.status(200).json({ url: data.url });
        } else {
            return res.status(404).json({ error: "No direct streaming link available for this ID." });
        }

    } catch (error) {
        console.error("Stream resolver error:", error);
        return res.status(500).json({ error: "Scraper execution failed", details: error.message });
    }
}
