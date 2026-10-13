// api/stream.js

export default async function handler(req, res) {
    // 1. Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. Get IMDb ID
    const { imdb } = req.query;
    if (!imdb) {
        return res.status(400).json({ error: "Missing 'imdb' query parameter" });
    }

    try {
        console.log(`[SUCCESS] Vercel API received request for: ${imdb}`);

        // ⚠️ THIS IS A TEST RESPONSE ⚠️
        // We are returning a known, working test .m3u8 file to prove your API works.
        // Once this works, you will replace this with your REAL resolver API fetch.
        
        const testM3u8Url = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
        
        console.log(`[SUCCESS] Returning test stream URL`);

        return res.status(200).json({ 
            success: true,
            imdb_id: imdb,
            url: testM3u8Url,
            message: "Your Vercel API is working perfectly! Now replace this test code with your real resolver API."
        });

    } catch (error) {
        console.error("[ERROR] API Failed:", error);
        return res.status(500).json({ 
            error: "API execution failed", 
            details: error.message 
        });
    }
}
