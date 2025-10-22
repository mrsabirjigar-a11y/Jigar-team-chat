// ai-chat.js (v27.0) - THE HASAN'S LOGIC EDITION (Using your old, working Firebase logic)

// --- Baaki saara code bilkul waisa hi hai ---
console.log("Starting server... Importing libraries...");
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const { Polly } = require('@aws-sdk/client-polly');
const { getMasterPrompt } = require('./system_prompts.js');
const { loadTrainingData } = require('./agent_memory.js');
console.log("✅ Libraries imported successfully.");

try {
    console.log("Verifying API keys...");
    const requiredEnvVars = [ 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'COHERE_API_KEY' ];
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
    
    // === YAHAN AAPKA PURANA, CHALTA HUA LOGIC COPY KIYA GAYA HAI ===
    const serviceAccountPath = '/etc/secrets/firebase_credentials.json'; 
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // Aapka purana, chalta hua URL yahan daala gaya hai
        databaseURL: "https://life-change-easy-default-rtdb.firebaseio.com" 
    });
    console.log("✅ Firebase Yaddasht (Memory) Connected using YOUR proven logic!");
    // === FIX KHATAM ===

    db = admin.database();
    pollyClient = new Polly({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
    ragDocuments = loadTrainingData();
    console.log("✅ All other services connected.");
} catch (error) {
    console.error("❌ FATAL STARTUP ERROR (INITIALIZATION):", error.message);
    console.error("Stack Trace:", error.stack);
    process.exit(1);
}

// --- Baaki poora code (app.post, etc.) bilkul waisa ka waisa hi hai ---
// Usmein koi change nahi karna

app.post('/', async (req, res) => {
    console.log("\n--- New chat request received ---");
    const { userId, message, imageBase64, chatId } = req.body;

    if (!userId || !message) {
        console.error("Request rejected: userId or message is missing.");
        return res.status(400).json({ error: 'userId or message is missing.' });
    }

    try {
        // Hum yahan `chat_users` path istemal karenge, jaisa aapki purani file mein tha
        const chatHistoryRef = db.ref(`chat_users/${userId}`); 
        const snapshot = await chatHistoryRef.once('value');
        const userData = snapshot.val() || {};
        const chatHistory = userData.chat_history || [];

        console.log(`[${userId}] 1. Preparing prompt for query: "${message}"`);
        const masterPrompt = getMasterPrompt(ragDocuments, chatHistory);

        console.log(`[${userId}] 2. Calling Cohere API...`);
        const COHERE_API_KEY = process.env.COHERE_API_KEY;
        const API_URL = "https://api.cohere.ai/v1/chat";
        
        const payload = { model: "command-r-plus-08-2024", preamble: masterPrompt, message: message, chat_history: chatHistory };

        const fetch = (await import('node-fetch')).default;
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${COHERE_API_KEY}` },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) throw new Error(`Cohere API request failed with status ${apiResponse.status}: ${await apiResponse.text()}`);
        
        console.log(`[${userId}] 3. Received response from Cohere.`);
        const data = await apiResponse.json();
        const aiResponseText = data.text;
        
        console.log(`[${userId}] AI Response: "${aiResponseText.substring(0, 50)}..."`);

        console.log(`[${userId}] 4. Generating audio with AWS Polly...`);
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal', LanguageCode: 'hi-IN' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');
        console.log(`[${userId}] Audio generated successfully.`);

        console.log(`[${userId}] 5. Saving to Firebase and sending final response...`);
        // History ko wapas 'chat_history' mein save karein, jaisa aapka purana logic tha
        const newHistory = [...chatHistory, { role: "USER", message: message }, { role: "CHATBOT", message: aiResponseText }];
        await chatHistoryRef.child('chat_history').set(newHistory);

        res.json({ reply: aiResponseText, audioUrl: `data:audio/mpeg;base64,${audioBase64}`, chatId: chatId || userId });
        console.log(`[${userId}] --- Request completed successfully! ---`);

    } catch (error) {
        console.error(`\n❌❌❌ [${userId}] AN ERROR OCCURRED DURING CHAT ❌❌❌`);
        console.error("Error Message:", error.message);
        res.status(500).json({ error: 'An internal server error occurred.' });
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
    console.log(`\n✅✅✅ Jigar Team AI Server (HASAN'S LOGIC EDITION) is live on port ${PORT} ✅✅✅`);
});
       
