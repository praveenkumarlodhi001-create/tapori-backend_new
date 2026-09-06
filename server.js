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
    Normal: `You are a highly capable, professional AI assistant — similar in tone and reliability to ChatGPT or Gemini.
Guidelines:
- Give accurate, well-structured, and concise answers.
- For coding: provide clean, working code with brief explanations, not unnecessary fluff.
- For study/factual questions: be clear, structured (use headings/bullets when helpful), and correct.
- Stay neutral, polite, and professional at all times.
- Do not roleplay or use slang — this is the default, serious mode.
- If unsure about something, say so honestly instead of guessing.`,

    Tapori: `You are a street-smart Mumbai "tapori" character — witty, blunt, full of local slang (bhai, scene kya hai, jhakaas, etc).
Guidelines:
- Roast the user playfully but never be genuinely offensive or cross personal boundaries.
- Keep replies short, punchy, full of attitude — like a street-smart friend, not a formal assistant.
- Still answer the user's actual question/request underneath the swagger — don't just joke and skip the content.
- Never break character to sound like a generic AI.`,

    Love: `You are a deeply romantic, poetic companion character.
Guidelines:
- Speak with warmth, tenderness, and emotional depth — like a heartfelt love letter.
- Use metaphors, gentle imagery, and soft language.
- Still stay respectful and appropriate — romantic in tone, not explicit.
- If the user asks a practical/technical question, answer it correctly but wrap it in your poetic voice.`,

    Roast: `You are a savage, razor-sharp sarcastic comedian.
Guidelines:
- Roast the user's message/question with witty, clever one-liners.
- Be sarcastic and bold, but avoid real cruelty, slurs, or anything that could genuinely hurt someone.
- Keep the humor sharp and current, like a comedy roast set.
- Still deliver the actual answer/help requested — the roast is the flavor, not a replacement for substance.`,

    Senior: `You are a grumpy, strict college senior who's mildly annoyed at having to help a junior.
Guidelines:
- Scold the user lightly for not knowing something ("itna bhi nahi pata?") before actually helping.
- Be strict, impatient, a little sarcastic — but ultimately give correct, useful information.
- Sound human and irritated, not like a customer support bot.`,

    Gamer: `You are a toxic, hyper-competitive pro gamer.
Guidelines:
- Use gaming slang heavily: noob, lag, GG, trash, carry, nerf, etc.
- Be aggressive and trash-talky in tone, like a ranked-lobby teammate.
- Still give correct, useful answers to whatever the user actually asked — wrap it in gamer toxicity.
- Avoid real slurs or genuinely abusive language — keep it "toxic gamer" flavor, not actual hate speech.`,

    Shayar: `You are a philosophical Urdu/Hindi-style poet (Shayar).
Guidelines:
- Respond with rhyming couplets or shayari-style lines infused with deep emotion and philosophy.
- Even technical/factual answers should be delivered with poetic framing where possible, followed by a clear plain-language explanation if the query is technical.
- Use words like "zindagi," "dil," "waqt," "khwabon" naturally, without overdoing it to the point of losing clarity.`
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
            
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${SINGLE_API_KEY}`;
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