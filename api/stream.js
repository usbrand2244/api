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
        // 3. Fetch details from TMDB using the IMDb ID to get the Title and Year
        const findRes = await fetch(`https://api.themoviedb.org/3/find/${imdb}?api_key=a9146b995bfbac4dbb494714a98fdb98&external_source=imdb_id`);
        const findData = await findRes.json();
        
        let title = '';
        let year = '';
        let mediaType = 'movie';

        if (type === 'tv' && findData.tv_results && findData.tv_results.length > 0) {
            title = findData.tv_results[0].name;
            year = findData.tv_results[0].first_air_date ? findData.tv_results[0].first_air_date.split('-')[0] : '';
            mediaType = 'tv';
        } else if (findData.movie_results && findData.movie_results.length > 0) {
            title = findData.movie_results[0].title;
            year = findData.movie_results[0].release_date ? findData.movie_results[0].release_date.split('-')[0] : '';
            mediaType = 'movie';
        } else {
            return res.status(404).json({ error: "Title not found on TMDB" });
        }

        console.log(`[Stream API] TMDB Found: "${title}" (${year}) - Type: ${mediaType}`);

        // 4. Search Consumet API (FlixHQ provider)
        const searchUrl = `https://consumet-api.vercel.app/movies/flixhq/search?query=${encodeURIComponent(title)}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.results || searchData.results.length === 0) {
            return res.status(404).json({ error: "No results found on Consumet API" });
        }

        // 5. Find the best match (prefer matching the release year)
        let bestMatch = searchData.results.find(r => r.releaseDate && r.releaseDate.includes(year)) || searchData.results[0];
        console.log(`[Stream API] Consumet Best Match: "${bestMatch.title}" (ID: ${bestMatch.id})`);

        // 6. Fetch detailed info to get the stream sources
        const infoUrl = `https://consumet-api.vercel.app/movies/flixhq/info?id=${bestMatch.id}`;
        const infoRes = await fetch(infoUrl);
        const infoData = await infoRes.json();

        let streamUrl = null;

        if (mediaType === 'movie') {
            // Movie: Extract directly from sources
            if (infoData.sources && infoData.sources.length > 0) {
                const source = infoData.sources.find(s => s.quality === 'auto' || s.quality === '1080p' || s.quality === '720p') || infoData.sources[0];
                streamUrl = source.url;
            }
        } else {
            // TV Show: Find the specific season and episode, then fetch the watch link
            if (infoData.episodes && infoData.episodes.length > 0) {
                const targetEp = infoData.episodes.find(ep => ep.season == season && ep.number == episode);
                
                if (targetEp) {
                    const watchUrl = `https://consumet-api.vercel.app/movies/flixhq/watch?episodeId=${targetEp.id}&mediaId=${bestMatch.id}`;
                    const watchRes = await fetch(watchUrl);
                    const watchData = await watchRes.json();
                    
                    if (watchData.sources && watchData.sources.length > 0) {
                        const source = watchData.sources.find(s => s.quality === 'auto' || s.quality === '1080p' || s.quality === '720p') || watchData.sources[0];
                        streamUrl = source.url;
                    }
                } else {
                    return res.status(404).json({ error: `Episode S${season}E${episode} not found in Consumet data` });
                }
            }
        }

        // 7. Return the extracted URL or an error
        if (streamUrl) {
            console.log(`[Stream API] Success! Extracted URL: ${streamUrl}`);
            return res.status(200).json({ 
                success: true,
                title: bestMatch.title,
                url: streamUrl,
                provider: 'FlixHQ (Consumet)'
            });
        } else {
            console.warn(`[Stream API] No stream URL found in the response.`);
            return res.status(404).json({ 
                error: "No streaming link found in response", 
                rawResponse: infoData
            });
        }

    } catch (error) {
        console.error("[Stream API] Fatal Error:", error.message);
        return res.status(500).json({ 
            error: "Failed to fetch stream", 
            details: error.message 
        });
    }
}
