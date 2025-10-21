// ai-chat.js (v22.0) - THE FINAL VERSION FOR YOUR ORIGINAL FRONTEND

console.log("Starting server... Importing libraries...");
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const { getMasterPrompt } = require('./system_prompts.js');
const { loadTrainingData } = require('./agent_memory.js');
console.log("✅ Libraries imported successfully.");

try {
    console.log("Verifying API keys...");
    const requiredEnvVars = [ 'FIREBASE_SERVICE_ACCOUNT_KEY', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'GEMINI_API_KEY' ];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) { throw new Error(`Missing environment variables: ${missingVars.join(', ')}`); }
    console.log("✅ All API keys are present.");
} catch (error) {
    console.error("❌ FATAL STARTUP ERROR (API KEYS):", error.message);
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

let db, pollyClient, ragDocuments;
try {
    console.log("Connecting to services...");
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: "https://jigar-team-chatbot-default-rtdb.firebaseio.com" });
    db = admin.database();
    pollyClient = new Polly({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
    ragDocuments = loadTrainingData();
    console.log("✅ All services connected.");
} catch (error) {
    console.error("❌ FATAL STARTUP ERROR (INITIALIZATION):", error.message);
    process.exit(1);
}

app.post('/', async (req, res) => {
    console.log("\n--- New chat request received ---");
    
    // =================================================================
    // === YAHAN FINAL FIX LAGAYA GAYA HAI ===
    // =================================================================
    // Hum frontend se 'message' le rahe hain aur usko 'userQuery' bana rahe hain.
    const { userId, message, fullChatHistory } = req.body;
    const userQuery = message; // YEH LINE AAPKE FRONTEND KE LIYE HAI
    // =================================================================

    if (!userId || !userQuery) {
        console.error("Request rejected: userId or userQuery is missing.");
        console.log("Received req.body:", JSON.stringify(req.body));
        return res.status(400).json({ error: 'userId or userQuery is missing.' });
    }

    try {
        console.log(`[${userId}] 1. Generating master prompt for user query: "${userQuery}"`);
        const masterPrompt = getMasterPrompt(ragDocuments, fullChatHistory);
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;
        const contents = [ { role: "user", parts: [{ text: masterPrompt }] }, { role: "model", parts: [{ text: "Jee, mai Jigar Team ki AI assistant hu. Mai aapki kya sahayata kar sakti hu?" }] }, ...(Array.isArray(fullChatHistory) ? fullChatHistory.map(m => ({ role: m.role, parts: [{ text: m.content }] })) : []), { role: "user", parts: [{ text: userQuery }] } ];
        const payload = { contents, generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }, safetySettings: [ { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }, { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }, { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }, { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' } ] };
        console.log(`[${userId}] 2. Calling Google Gemini API...`);
        const fetch = (await import('node-fetch')).default;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const apiResponse = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        clearTimeout(timeoutId);
        if (!apiResponse.ok) throw new Error(`Google API request failed with status ${apiResponse.status}: ${await apiResponse.text()}`);
        console.log(`[${userId}] 3. Received response from Google...`);
        const data = await apiResponse.json();
        let aiResponseText;
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            aiResponseText = data.candidates[0].content.parts[0].text;
        } else {
            if (data.promptFeedback?.blockReason) throw new Error(`Request blocked by Google for: ${data.promptFeedback.blockReason}`);
            throw new Error('Failed to extract valid text from Google API response.');
        }
        console.log(`[${userId}] 4. Generating audio...`);
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal', LanguageCode: 'hi-IN' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');
        console.log(`[${userId}] 5. Saving to Firebase and sending response...`);
        await db.ref(`chats/${userId}`).push().set({ role: 'user', content: userQuery, timestamp: Date.now() });
        await db.ref(`chats/${userId}`).push().set({ role: 'model', content: aiResponseText, timestamp: Date.now() });
        
        // Jawab wapas purane format mein bhej rahe hain
        res.json({ reply: aiResponseText, audioUrl: `data:audio/mpeg;base64,${audioBase64}` });
        console.log(`[${userId}] --- Request completed successfully! ---`);

    } catch (error) {
        console.error(`\n❌❌❌ [${userId}] AN ERROR OCCURRED DURING CHAT ❌❌❌`);
        if (error.name === 'AbortError') {
            res.status(504).json({ error: 'The AI model took too long to respond.' });
        } else {
            res.status(500).json({ error: 'An internal server error occurred.' });
        }
    }
});

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅✅✅ Jigar Team AI Server is live and running on port ${PORT} ✅✅✅`);
});
                  
