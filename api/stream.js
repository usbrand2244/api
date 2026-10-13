// api/stream.js

export default async function handler(req, res) {
    // 1. Enable CORS
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
        // Target URL
        const targetUrl = `https://vidsrc.sh/api/source/${imdb}`;
        console.log(`[Stream API] Attempting to fetch: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://vidsrc.sh/'
            }
        });

        console.log(`[Stream API] Response Status: ${response.status} ${response.statusText}`);

        // 2. CRITICAL CHECK: Did the server return JSON or HTML (like a Cloudflare block)?
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const textResponse = await response.text();
            console.error(`[Stream API] ERROR: Expected JSON but got: ${contentType}`);
            console.error(`[Stream API] Response Body Preview: ${textResponse.substring(0, 300)}`);
            
            return res.status(502).json({ 
                error: "Target API did not return JSON. It is likely blocking Vercel or the URL is wrong.",
                status: response.status,
                contentType: contentType,
                preview: textResponse.substring(0, 300)
            });
        }

        // 3. Parse JSON
        const data = await response.json();
        console.log(`[Stream API] Success! Raw Data:`, JSON.stringify(data));

        // 4. Extract the .m3u8 URL (check common structures)
        let streamUrl = null;
        if (data.result && data.result.sources && data.result.sources.length > 0) {
            streamUrl = data.result.sources[0].file;
        } else if (data.url) {
            streamUrl = data.url;
        } else if (data.source && data.source.file) {
            streamUrl = data.source.file;
        } else if (data.sources && data.sources.length > 0) {
            streamUrl = data.sources[0].file;
        }

        if (streamUrl) {
            console.log(`[Stream API] Extracted URL: ${streamUrl}`);
            return res.status(200).json({ success: true, imdb_id: imdb, url: streamUrl });
        } else {
            return res.status(404).json({ error: "No stream URL found in response", rawResponse: data });
        }

    } catch (error) {
        console.error("[Stream API] Fatal Error:", error.message);
        return res.status(500).json({ 
            error: "Scraper execution failed", 
            details: error.message 
        });
    }
}
