// api/stream.js

export default async function handler(req, res) {
    // 1. Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { id, type, season, episode } = req.query;
    if (!id) {
        return res.status(400).json({ error: "Missing 'id' query parameter" });
    }

    try {
        const isTv = type === 'tv' && season && episode;
        
        // 2. List of DEDICATED HLS RESOLVER APIs (These return JSON with .m3u8 links)
        // We try multiple because free APIs occasionally go down or rate-limit.
        const resolvers = [
            {
                name: 'RGShows',
                url: isTv ? `https://api.rgshows.me/api/tv/${id}/${season}/${episode}` : `https://api.rgshows.me/api/movies/${id}`
            },
            {
                name: 'MultiEmbed API',
                url: `https://multiembed.mov/api/v1/video?id=${id}&tmdb=1${isTv ? `&s=${season}&e=${episode}` : ''}`
            },
            {
                name: 'VidAPI',
                url: isTv ? `https://vidapi.xyz/api/tv/${id}/${season}/${episode}` : `https://vidapi.xyz/api/movie/${id}`
            },
            {
                name: 'VidSrc API',
                url: isTv ? `https://vidsrcapi.vercel.app/api/tv/${id}/${season}/${episode}` : `https://vidsrcapi.vercel.app/api/movie/${id}`
            }
        ];

        console.log(`[Backend] Searching for direct .m3u8 for ${type} ID: ${id}`);

        // 3. Try each resolver sequentially
        for (const resolver of resolvers) {
            try {
                console.log(`[Backend] Querying ${resolver.name}...`);
                
                const response = await fetch(resolver.url, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json'
                    },
                    signal: AbortSignal.timeout(6000) // 6-second timeout per API
                });

                if (!response.ok) continue;

                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) continue;

                const data = await response.json();
                console.log(`[Backend] ${resolver.name} responded. Checking for .m3u8...`);

                // 4. Aggressively search the JSON for the .m3u8 link
                let streamUrl = null;

                // Pattern A: { result: { sources: [ { file: "..." } ] } }
                if (data.result?.sources?.length > 0) {
                    const source = data.result.sources.find(s => s.quality === 'auto' || s.quality === '1080p' || s.quality === '720p') || data.result.sources[0];
                    if (source.file && source.file.includes('.m3u8')) streamUrl = source.file;
                }
                // Pattern B: { url: "..." }
                else if (data.url && data.url.includes('.m3u8')) {
                    streamUrl = data.url;
                }
                // Pattern C: { sources: [ { url: "..." } ] }
                else if (data.sources?.length > 0) {
                    const source = data.sources.find(s => s.quality === 'auto' || s.quality === '1080p') || data.sources[0];
                    if (source.url && source.url.includes('.m3u8')) streamUrl = source.url;
                }
                // Pattern D: { data: { url: "..." } }
                else if (data.data?.url && data.data.url.includes('.m3u8')) {
                    streamUrl = data.data.url;
                }

                // 5. If we found a valid .m3u8, return it IMMEDIATELY
                if (streamUrl) {
                    console.log(`[Backend] ✅ SUCCESS! Found direct .m3u8 via ${resolver.name}`);
                    return res.status(200).json({
                        success: true,
                        id: id,
                        type: 'hls',
                        url: streamUrl,
                        provider: resolver.name
                    });
                }

            } catch (err) {
                console.log(`[Backend] ⚠️ ${resolver.name} failed or timed out: ${err.message}`);
                continue; // Move to the next resolver
            }
        }

        // 6. FALLBACK: If ALL dedicated HLS APIs fail, return the iframe
        console.warn(`[Backend] ❌ All HLS resolvers failed. Falling back to iframe.`);
        const fallbackUrl = isTv 
            ? `https://vidcore.org/embed/tv/${id}/${season}/${episode}` 
            : `https://vidcore.org/embed/movie/${id}`;

        return res.status(200).json({
            success: true,
            id: id,
            type: 'iframe',
            url: fallbackUrl,
            message: "Direct .m3u8 not found. Using safe iframe fallback."
        });

    } catch (error) {
        console.error("[Backend] Fatal Error:", error.message);
        return res.status(500).json({ error: "Server error", details: error.message });
    }
}
