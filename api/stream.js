// api/stream.js

export default async function handler(req, res) {
    // 1. Enable CORS for frontend communication
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. Get parameters from the query
    const { imdb, type, season, episode } = req.query;
    
    if (!imdb) {
        return res.status(400).json({ error: "Missing 'imdb' query parameter" });
    }

    try {
        // 3. Determine the target URL based on whether it's a Movie or TV Show
        // Using vidsrcapi.vercel.app as the primary resolver
        let targetUrl = '';
        if (type === 'tv' && season && episode) {
            targetUrl = `https://vidsrcapi.vercel.app/api/tv/${imdb}/${season}/${episode}`;
        } else {
            targetUrl = `https://vidsrcapi.vercel.app/api/movie/${imdb}`;
        }
        
        console.log(`[Stream API] Attempting to fetch from: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://vidsrcapi.vercel.app/'
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
                error: "Target API did not return JSON. It may be down, rate-limited, or blocking requests.",
                status: response.status,
                contentType: contentType,
                preview: textResponse.substring(0, 300)
            });
        }

        // 5. Parse JSON
        const data = await response.json();
        console.log(`[Stream API] Success! Raw Data:`, JSON.stringify(data));

        // 6. Extract the stream URL (check common structures for vidsrcapi)
        let streamUrl = null;
        
        // Structure A: { result: { url: "..." } } or { result: { sources: [{ file: "..." }] } }
        if (data.result) {
            if (data.result.url) {
                streamUrl = data.result.url;
            } else if (data.result.sources && data.result.sources.length > 0) {
                streamUrl = data.result.sources[0].file || data.result.sources[0].url;
            }
        } 
        // Structure B: { url: "..." }
        else if (data.url) {
            streamUrl = data.url;
        }
        // Structure C: { sources: [{ file: "..." }] }
        else if (data.sources && data.sources.length > 0) {
            streamUrl = data.sources[0].file || data.sources[0].url;
        }

        // 7. Return the extracted URL or an error
        if (streamUrl) {
            console.log(`[Stream API] Extracted URL: ${streamUrl}`);
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
                hint: "Check the Vercel logs above to see the exact JSON structure returned and update the parsing logic if needed."
            });
        }

    } catch (error) {
        // 8. Verbose error logging for Vercel Dashboard debugging
        console.error("[Stream API] Fatal Error:", error.message);
        console.error("[Stream API] Error Cause:", error.cause);
        
        return res.status(500).json({ 
            error: "Scraper execution failed", 
            details: error.message,
            hint: "Check the Vercel logs above. The target API might be temporarily down."
        });
    }
}
