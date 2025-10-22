// ai-chat.js (v23.0) - FINAL COHERE VERSION (No Google, No Card Needed)

console.log("Starting server... Importing libraries...");
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const { getMasterPrompt } = require('./system_prompts.js');
const { loadTrainingData } = require('./agent_memory.js');
console.log("✅ Libraries imported successfully.");

// --- API Key Verification (Ab Cohere key check hogi) ---
try {
    console.log("Verifying API keys...");
    const requiredEnvVars = [ 'FIREBASE_SERVICE_ACCOUNT_KEY', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'COHERE_API_KEY' ];
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

// --- Initializations (Firebase, Polly, RAG) ---
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

// --- MAIN CHAT ENDPOINT (Ab Cohere se baat karega) ---
app.post('/', async (req, res) => {
    console.log("\n--- New chat request received ---");
    const { userId, message, imageBase64, chatId } = req.body; // Frontend se aane wala data

    if (!userId || !message) {
        console.error("Request rejected: userId or message is missing.");
        return res.status(400).json({ error: 'userId or message is missing.' });
    }

    try {
        // --- Part 1: Chat History aur Prompt tayyar karna ---
        console.log(`[${userId}] 1. Preparing chat history and prompt for query: "${message}"`);
        const chatHistoryRef = db.ref(`chats/${userId}`);
        const snapshot = await chatHistoryRef.orderByChild('timestamp').limitToLast(10).once('value');
        const chatHistory = [];
        snapshot.forEach(child => {
            const msg = child.val();
            // Cohere ke format mein history banayein
            const role = msg.role === 'user' ? 'USER' : 'CHATBOT';
            chatHistory.push({ role: role, message: msg.content });
        });
        
        const masterPrompt = getMasterPrompt(ragDocuments, chatHistory);

        // --- Part 2: Cohere API ko call karna ---
        console.log(`[${userId}] 2. Calling Cohere API...`);
        const COHERE_API_KEY = process.env.COHERE_API_KEY;
        const API_URL = "https://api.cohere.ai/v1/chat";
        
        const payload = {
            model: "command-r",
            preamble: masterPrompt,
            message: message, // User ka message
            chat_history: chatHistory // Purani chat history
        };

        const fetch = (await import('node-fetch')).default;
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${COHERE_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) throw new Error(`Cohere API request failed with status ${apiResponse.status}: ${await apiResponse.text()}`);
        
        console.log(`[${userId}] 3. Received response from Cohere. Parsing data...`);
        const data = await apiResponse.json();
        const aiResponseText = data.text;
        
        console.log(`[${userId}] AI Response: "${aiResponseText.substring(0, 50)}..."`);

        // --- Part 3: Audio Generate karna ---
        console.log(`[${userId}] 4. Generating audio with AWS Polly...`);
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal', LanguageCode: 'hi-IN' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');
        console.log(`[${userId}] Audio generated successfully.`);

        // --- Part 4: Firebase mein save karna aur jawab bhejna ---
        console.log(`[${userId}] 5. Saving to Firebase and sending final response...`);
        await chatHistoryRef.push().set({ role: 'user', content: message, timestamp: Date.now() });
        await chatHistoryRef.push().set({ role: 'model', content: aiResponseText, timestamp: Date.now() });

        // Frontend ko wahi format bhejein jo woh expect kar raha hai
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
    console.log(`\n✅✅✅ Jigar Team AI Server (COHERE EDITION) is live on port ${PORT} ✅✅✅`);
});
        
