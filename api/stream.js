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
    const { imdb, type, season, episode } = req.query;
    
    if (!imdb) {
        return res.status(400).json({ error: "Missing 'imdb' query parameter" });
    }

    try {
        // 3. VIDCORE API ENDPOINT
        // ⚠️ IMPORTANT: Replace 'vidcore.to' with your exact Vidcore provider domain 
        // if it's different (e.g., vidcore.xyz, vidcore.net, or a self-hosted instance).
        const BASE_URL = 'https://vidcore.to/api'; 
        
        let targetUrl = '';
        if (type === 'tv' && season && episode) {
            targetUrl = `${BASE_URL}/tv/${imdb}/${season}/${episode}`;
        } else {
            targetUrl = `${BASE_URL}/movie/${imdb}`;
        }
        
        console.log(`[Stream API] Fetching from Vidcore: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://vidcore.to/'
            }
        });

        console.log(`[Stream API] Response Status: ${response.status} ${response.statusText}`);

        // 4. CRITICAL CHECK: Did the server return JSON?
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const textResponse = await response.text();
            console.error(`[Stream API] ERROR: Expected JSON but got: ${contentType}`);
            console.error(`[Stream API] Response Body Preview: ${textResponse.substring(0, 300)}`);
            
            return res.status(502).json({ 
                error: "Vidcore did not return JSON. It may be down, blocking requests, or the URL path is incorrect.",
                status: response.status,
                contentType: contentType,
                preview: textResponse.substring(0, 300)
            });
        }

        // 5. Parse JSON
        const data = await response.json();
        console.log(`[Stream API] Success! Raw Data Preview:`, JSON.stringify(data).substring(0, 300) + '...');

        // 6. Extract the stream URL (check common Vidcore JSON structures)
        let streamUrl = null;
        
        // Structure A: { result: { sources: [{ file: "..." }] } }
        if (data.result && data.result.sources && data.result.sources.length > 0) {
            const source = data.result.sources.find(s => s.quality === 'auto' || s.quality === '1080p' || s.quality === '720p') || data.result.sources[0];
            streamUrl = source.file || source.url;
        } 
        // Structure B: { url: "..." }
        else if (data.url && typeof data.url === 'string') {
            streamUrl = data.url;
        }
        // Structure C: { sources: [{ file: "..." }] }
        else if (data.sources && data.sources.length > 0) {
            const source = data.sources.find(s => s.quality === 'auto' || s.quality === '1080p') || data.sources[0];
            streamUrl = source.file || source.url;
        }
        // Structure D: { data: { url: "..." } }
        else if (data.data && data.data.url) {
            streamUrl = data.data.url;
        }

        // 7. Return the extracted URL or an error
        if (streamUrl) {
            console.log(`[Stream API] Extracted URL: ${streamUrl}`);
            return res.status(200).json({ 
                success: true,
                imdb_id: imdb,
                url: streamUrl,
                provider: 'Vidcore'
            });
        } else {
            console.warn(`[Stream API] No stream URL found in the response.`);
            return res.status(404).json({ 
                error: "No streaming link found in Vidcore response", 
                rawResponse: data,
                hint: "Check the Vercel logs above to see the exact JSON structure returned and update the parsing logic if Vidcore changed their format."
            });
        }

    } catch (error) {
        // 8. Verbose error logging for Vercel Dashboard debugging
        console.error("[Stream API] Fatal Error:", error.message);
        console.error("[Stream API] Error Cause:", error.cause);
        
        return res.status(500).json({ 
            error: "Vidcore execution failed", 
            details: error.message,
            hint: "Check the Vercel logs above. The target API might be temporarily down, blocking Vercel IPs, or the BASE_URL path is incorrect."
        });
    }
}
