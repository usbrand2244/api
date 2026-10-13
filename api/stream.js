// api/stream.js

export default async function handler(req, res) {
    // 1. Enable CORS for frontend communication
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { imdb } = req.query;
    if (!imdb) {
        return res.status(400).json({ error: "Missing 'imdb' query parameter" });
    }

    try {
        // ⚠️ CRITICAL: The previous URL was a broken placeholder. 
        // You MUST replace the domain below with the ACTUAL, working endpoint of your chosen resolver.
        // Example: `https://your-actual-resolver-api.com/api/movie/${imdb}`
        const targetUrl = `https://api.example-resolver.com/v1/movie/${imdb}`;
        
        console.log(`[Stream Resolver] Attempting to fetch: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://google.com/'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[Stream Resolver] Success:`, data);

        // Adjust 'data.url' to match whatever property your specific resolver returns
        if (data && data.url) {
            return res.status(200).json({ url: data.url });
        } else {
            return res.status(404).json({ error: "No streaming link found", rawResponse: data });
        }

    } catch (error) {
        console.error("[Stream Resolver] Fetch Failed:", error.message);
        return res.status(500).json({ 
            error: "Scraper execution failed", 
            details: error.message,
            hint: "The target URL is likely a broken placeholder, dead, or blocking Vercel's IP addresses."
        });
    }
}
