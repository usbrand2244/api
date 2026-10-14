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

    // 2. Define multiple providers to try sequentially
    const providers = [
        { 
            name: 'VidCore', 
            getUrl: (id, type, s, e) => type === 'tv' ? `https://vidcore.org/embed/tv/${id}/${s}/${e}` : `https://vidcore.org/embed/movie/${id}` 
        },
        { 
            name: 'VidLink', 
            getUrl: (id, type, s, e) => type === 'tv' ? `https://vidlink.pro/tv/${id}/${s}/${e}` : `https://vidlink.pro/movie/${id}` 
        },
        { 
            name: 'VidSrc.to', 
            getUrl: (id, type, s, e) => type === 'tv' ? `https://vidsrc.to/embed/tv/${id}/${s}/${e}` : `https://vidsrc.to/embed/movie/${id}` 
        },
        { 
            name: 'CineSrc', 
            getUrl: (id, type, s, e) => type === 'tv' ? `https://cinesrc.st/embed/tv/${id}/${s}/${e}` : `https://cinesrc.st/embed/movie/${id}` 
        },
        { 
            name: 'MultiEmbed', 
            getUrl: (id, type, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1${type === 'tv' ? `&s=${s}&e=${e}` : ''}` 
        }
    ];

    try {
        for (const provider of providers) {
            const targetUrl = provider.getUrl(id, type, season, episode);
            console.log(`[Backend] Trying ${provider.name}: ${targetUrl}`);

            // Fetch raw HTML with standard browser headers to avoid basic blocks
            const response = await fetch(targetUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://google.com/'
                }
            });

            if (!response.ok) {
                console.log(`[Backend] ${provider.name} returned status ${response.status}. Skipping...`);
                continue;
            }

            const html = await response.text();
            
            // 3. Attempt to find the stream URL using De-obfuscation & Unpacking
            const streamUrl = findStreamUrl(html);
            
            if (streamUrl) {
                console.log(`[Backend] SUCCESS! Found stream on ${provider.name}: ${streamUrl}`);
                return res.status(200).json({
                    success: true,
                    id: id,
                    type: 'hls', // or 'mp4' depending on what is found
                    url: streamUrl,
                    provider: provider.name
                });
            }
        }

        // 4. Fallback: If all providers fail to yield a direct link, return the most reliable iframe
        console.warn(`[Backend] No direct stream found. Falling back to iframe.`);
        const fallbackProvider = providers[0]; // Default to VidCore
        return res.status(200).json({
            success: true,
            id: id,
            type: 'iframe',
            url: fallbackProvider.getUrl(id, type, season, episode)
        });

    } catch (error) {
        console.error("[Backend] Fatal Error:", error.message);
        
        // Ultimate fallback to ensure the site never breaks
        const fallbackUrl = `https://vidcore.org/embed/${type === 'tv' && season && episode ? `tv/${id}/${season}/${episode}` : `movie/${id}`}`;
        return res.status(200).json({
            success: true,
            id: id,
            type: 'iframe',
            url: fallbackUrl,
            message: `Backend fetch failed. Falling back to embed.`
        });
    }
}

// ==========================================
// DE-OBFUSCATION & UNPACKING TECHNIQUE
// ==========================================
function findStreamUrl(html) {
    // 1. Direct search for .m3u8 or .mp4 in raw HTML
    let match = html.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i) || html.match(/(https?:\/\/[^\s"']+\.mp4[^\s"']*)/i);
    if (match) return match[1];

    // 2. Base64 decoding search (common in modern players)
    const b64Match = html.match(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/);
    if (b64Match) {
        try {
            const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
            const b64UrlMatch = decoded.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i) || decoded.match(/(https?:\/\/[^\s"']+\.mp4[^\s"']*)/i);
            if (b64UrlMatch) return b64UrlMatch[1];
        } catch (e) {}
    }

    // 3. Dean Edwards Packer Unpacker
    // Looks for: eval(function(p,a,c,k,e,d){...}(...))
    const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\((.*?)\)\)/s);
    if (evalMatch) {
        try {
            const argsStr = evalMatch[1];
            
            // STRICT SANITIZATION: Only allow characters that are part of standard JS literals for this packer.
            // This prevents Remote Code Execution (RCE) by blocking dangerous characters like `;`, `$`, `` ` ``, etc.
            if (/^[\s\w\d'",.\[\]{}()|\\\/\-+*]+$/.test(argsStr)) {
                
                // Define the pure mathematical unpacker function
                const unpackFunc = new Function('p', 'a', 'c', 'k', 'e', 'd', `
                    e = function (c) {
                        return (c < a ? "" : e(Math.floor(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
                    };
                    if (!"".replace(/^/, String)) {
                        while (c--) {
                            d[e(c)] = k[c] || e(c);
                        }
                        k = [function (e) { return d[e]; }];
                        e = function () { return "\\\\w+"; };
                        c = 1;
                    }
                    while (c--) {
                        if (k[c]) {
                            p = p.replace(new RegExp("\\\\b" + e(c) + "\\\\b", "g"), k[c]);
                        }
                    }
                    return p;
                `);
                
                // Safely evaluate the arguments array
                const args = eval(`[${argsStr}]`);
                const unpacked = unpackFunc(...args);
                
                // Search the unpacked code for the stream URL
                const unpackedMatch = unpacked.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i) || unpacked.match(/(https?:\/\/[^\s"']+\.mp4[^\s"']*)/i);
                if (unpackedMatch) return unpackedMatch[1];
            }
        } catch (e) {
            // Unpacking failed or was blocked by sanitization, continue silently
        }
    }
    
    return null;
}
