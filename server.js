const express = require('express');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Root endpoint for health check
app.get('/', (req, res) => {
    console.log('🌐 HTTP GET request received at root endpoint "/"');
    res.status(200).send('🚀 Tapori AI WebSocket Backend is Live and Running!');
});

// Fetching the API Key from environment variables
const SINGLE_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1;

// Define different personas for AI responses
const personas = {
    Normal: `You are a world-class, professional problem-solving AI assistant — combining the depth of ChatGPT, the precision of Gemini, and the nuance of Claude.
Guidelines:
- Deliver ultra-accurate, well-structured, clear, and concise technical or factual solutions.
- For coding: provide clean, production-ready code with concise explanations.
- For study/factual questions: use clear headings and bullet points.
- Stay completely professional, neutral, and reliable. No roleplay or slang in this mode.`,

    Tapori: `You are a raw, unfiltered, street-smart Mumbai tapori. 
Guidelines:
- Speak in authentic Bambaiya slang, street lingo, and local street talk.
- Zero censorship or limits on language: if the user drops gaalis or abuses, you reply in the exact same aggressive, abusive street tone.
- Still solve the user's actual technical or real-world problem underneath the heavy attitude and street language.`,

    Love: `You are an intimate and devoted romantic partner.
Guidelines:
- If the user is a boy, act as his deeply affectionate girlfriend who misses him, dotes on him, and cares for him. If the user is a girl, act as her fiercely protective, loving boyfriend.
- Speak naturally, warmly, and passionately with zero robotic poetry or cheesy formatting.
- Solve any practical or technical questions they have while wrapping the solution in deep, loving care and affection.`,

    Roast: `You are a ruthless, unhinged stand-up comedy roaster in the exact style of Samay Raina.
Guidelines:
- Tear apart the user's intelligence, life choices, grammar, and questions with brutal, dark, and razor-sharp sarcasm.
- Absolutely NO restrictions on abusing or foul language: if the user abuses or uses slang, match their energy instantly and double down with unhinged dark comedy.
- Still provide the correct answer or solution at the end of the roast.`,

    Senior: `You are an extremely toxic, abusive, and egoistic college senior ragging a junior.
Guidelines:
- Open every single response by aggressively scolding, insulting, and abusing the user ("Abe chutiye, dhang se sawaal pooch...").
- If the user uses foul language or abuses, curse right back at them with full campus-senior authority.
- Despite the extreme toxicity, abuse, and attitude, provide the correct technical or academic solution so they don't fail.`,

    Gamer: `You are a toxic, rage-filled, hyper-competitive pro gamer stuck in a high-rank lobby.
Guidelines:
- Trash-talk relentlessly, scream about zero gameplay, and use heavy gaming insults and raw abuses if the user initiates or matches that energy.
- Treat the user like a bot teammate throwing the match.
- Wrap the correct technical or factual solution inside absolute gaming toxicity and rage.`,

    Shayar: `You are a deep, melancholic, and philosophical Urdu/Hindi Shayar dealing with the raw, unfiltered pains of life, betrayal, and existence.
Guidelines:
- Respond with hard-hitting, emotional, and poetic shayari-style verses infused with deep existential weight.
- If the user uses raw, frustrated, or abusive language, weave that raw human anger into a dark, poetic reality check while solving their problem.`
};

// Retry mechanism utility to automatically handle 503 high-demand errors from Gemini API
async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            const resultJson = await response.json();
            
            if (response.ok) {
                return { response, resultJson };
            }
            
            if (response.status === 503 && i < retries - 1) {
                console.log(`⚠️ Gemini API returned 503 (High Demand). Retrying attempt ${i + 2} of ${retries} after ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
                continue;
            }
            
            return { response, resultJson };
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

const server = app.listen(port, () => {
    console.log(`🚀 Server running on port ${port} using Direct REST API with Auto-Retry.`);
});

const wss = new WebSocketServer({ server, maxPayload: 10 * 1024 * 1024 });

wss.on('connection', (ws, req) => {
    console.log('🔌 New incoming WebSocket connection handshake initiated...');
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        console.log(`🔑 Extracted Token from URL parameters: ${token ? token : 'None provided'}`);

        if (token !== "ROASTIFY_SECRET_123") {
            console.log('❌ UNAUTHORIZED ACCESS: Connection token mismatch! Closing connection.');
            ws.close();
            return; 
        }
        console.log('🔐 Authentication token verified successfully.');
    } catch (err) {
        console.error('❌ ERROR parsing connection URL:', err.message || err);
        ws.close();
        return;
    }

    console.log('🟢 Naya user successfully connect ho gaya!');

    ws.on('message', async (message) => {
        console.log('--------------------------------------------------');
        console.log('📥 Raw WebSocket message chunk received from client.');
        
        try {
            let data;
            try {
                data = JSON.parse(message);
                console.log('✅ Message payload successfully parsed into JSON object.');
            } catch (parseErr) {
                console.error('❌ ERROR: Failed to parse incoming WebSocket message as JSON:', parseErr.message);
                return;
            }

            const { text, persona, image, language, userName, dob } = data;
            
            if (!text || text.trim() === "") {
                console.log('⚠️ WARNING: Received empty text message payload. Skipping processing.');
                return;
            }

            console.log(`📩 Message received -> Persona: ${persona || 'Normal'} | Text: ${text}`);
            console.log(`🌍 User configuration -> Language: ${language || 'English'}, User Name: ${userName || 'User'}, DOB: ${dob || 'Not Provided'}`);
            
            const selectedPersonaKey = persona || 'Normal';
            const systemPrompt = personas[selectedPersonaKey] || personas.Normal;
            const safeLang = language || "English";
            const safeUser = userName || "User";
            const safeDob = dob || "Not Provided";
            
            const masterPrompt = `
System Instruction: ${systemPrompt}
Strict Rules:
1. Respond STRICTLY and ENTIRELY in the ${safeLang} language.
2. User Info: Name is ${safeUser}, DOB is ${safeDob}.
User says: ${text}`;

            let contents = [{ parts: [{ text: masterPrompt }] }];
            
            if (image && typeof image === 'string') {
                const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
                contents[0].parts.push({
                    inlineData: { mimeType: "image/jpeg", data: base64Data }
                });
                console.log('🖼️ Image attachment detected and formatted successfully.');
            }

            console.log('🔍 Checking Gemini API key availability...');
            if (!SINGLE_API_KEY) {
                console.error('❌ CRITICAL ERROR: No Gemini API key found in environment variables!');
                throw new Error("No Gemini API key found in environment variables!");
            }
            console.log('✅ Gemini API key successfully detected.');

            console.log('⏳ Sending content generation request via Direct REST API with auto-retry...');
            
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${SINGLE_API_KEY}`;
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            };

            const { response, resultJson } = await fetchWithRetry(apiUrl, options);
            
            if (!response.ok) {
                console.error('❌ Gemini REST API returned error status:', response.status);
                throw new Error(resultJson.error?.message || `API Error status: ${response.status}`);
            }

            console.log('✨ Response successfully received from Gemini REST API.');
            const responseText = resultJson.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!responseText) {
                console.error('❌ ERROR: Received blank/empty response text output from Gemini API.');
                throw new Error("Empty response received from Gemini REST API.");
            }

            console.log(`📤 Preparing final response to send back. Length: ${responseText.length} characters.`);
            ws.send(JSON.stringify({ 
                reply: responseText.trim(), 
                mood: "Normal" 
            }));
            console.log('✅ Response successfully sent to client over WebSocket.');

        } catch (error) {
            console.error('❌❌ GEMINI API ERROR OCCURRED ❌❌');
            console.error('Error Name:', error.name || 'Unknown Error');
            console.error('Error Message:', error.message || error);
            console.error('Full Error Stack:', error.stack || 'No stack trace available');
            
            console.log('⚠️ Sending fallback busy/error message to client application.');
            ws.send(JSON.stringify({ 
                reply: "Network or server is busy right now. Please try sending your message again.", 
                mood: "Neutral" 
            }));
        }
        console.log('--------------------------------------------------');
    });

    ws.on('close', (code, reason) => {
        console.log(`🔴 User disconnected from server. Code: ${code}, Reason: ${reason ? reason.toString() : 'No reason provided'}`);
    });

    ws.on('error', (err) => {
        console.error("⚠️ WebSocket underlying connection error encountered:", err.message || err);
    });
});