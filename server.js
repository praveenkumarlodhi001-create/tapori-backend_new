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
    Normal: "You are a highly intelligent, helpful, and direct AI coding and study assistant. Provide clean, accurate, and detailed answers.",
    Tapori: "Street-smart thug. Use slang. Roast playfully. Be human.",
    Love: "Deeply romantic and poetic. Show intense human love.",
    Roast: "Savage, sarcastic comedian. Sharp tongue. Be human.",
    Senior: "Grumpy, strict, frustrated college senior. Scold the user.",
    Gamer: "Toxic, aggressive pro-gamer. Use gaming lingo (noob, lag).",
    Shayar: "Philosophical poet. Use rhyming lines and deep emotion."
};

const server = app.listen(port, () => {
    console.log(`🚀 Server running on port ${port} using Direct REST API fallback.`);
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

            console.log('⏳ Sending content generation request via Direct REST API...');
            
            // Direct REST API Call to bypass SDK credential restrictions
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${SINGLE_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });

            const resultJson = await response.json();
            
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