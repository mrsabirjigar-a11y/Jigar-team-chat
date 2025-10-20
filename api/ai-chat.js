// === LIBRARIES ===
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// === NAYE, ZAROORI IMPORTS ===
// Hum naye "AI Brain" wali files ko yahan import kar rahe hain.
const { getMasterPrompt } = require('./system_prompts');
const { createMemoryFromKnowledgeBase } = require('./agent_memory');

// === FIREBASE INITIALIZATION (Yeh waisa hi hai) ===
try {
    console.log("Initializing application...");
    const serviceAccountPath = '/etc/secrets/firebase_credentials.json'; 
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://life-change-easy-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Yaddasht (Memory) Connected!");
} catch (error) {
    console.error("❌ CRITICAL INITIALIZATION FAILED:", error.message);
    process.exit(1); 
}

const db = admin.database();

// === NAYA STEP: AI KI CORE MEMORY BANANA ===
// Server start hote hi, hum AI ki buniyadi yaaddasht bana kar ek variable mein save kar lete hain.
const AI_CORE_MEMORY = createMemoryFromKnowledgeBase();
console.log("🧠 AI Autonomous Core Memory is ready.");


// === EXPRESS APP SETUP (Yeh waisa hi hai) ===
const app = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));


// === callCohere & generateAudio FUNCTIONS (Yeh waisa hi hain) ===
// In functions mein koi tabdeeli nahi hai.

async function callCohere(systemPrompt, message) {
    console.log("[callCohere] Calling Autonomous Agent Brain...");
    const COHERE_API_KEY = process.env.COHERE_API_KEY;
    if (!COHERE_API_KEY) throw new Error("Cohere API Key not found!");
        
    const COHERE_API_URL = "https://api.cohere.ai/v1/chat";
    // Dekhein, ab hum chat_history yahan nahi bhej rahe, kyunke woh Master Prompt ka hissa hai.
    const requestBody = { model: "command-r-plus-08-2024", preamble: systemPrompt, message: message, max_tokens: 1500 };
        
    const response = await fetch(COHERE_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${COHERE_API_KEY}` }, body: JSON.stringify(requestBody) });
        
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[callCohere] Cohere API Error Response: ${errorBody}`);
        throw new Error(`Cohere API responded with status: ${response.status}`);
    }
        
    console.log("[callCohere] Successfully received response from Agent Brain.");
    return await response.json();
}

async function generateAudio(text) {
    console.log("[generateAudio] Attempting to generate audio...");
    try {
        const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");
        const AWS_ACCESS_KEY_ID = process.env.MY_AWS_ACCESS_KEY_ID;
        const AWS_SECRET_ACCESS_KEY = process.env.MY_AWS_SECRET_ACCESS_KEY;
        const AWS_REGION = process.env.MY_AWS_REGION;
        if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION) {
            console.warn("[generateAudio] AWS credentials not found. Skipping audio generation.");
            return null;
        }
        const pollyClient = new PollyClient({ region: AWS_REGION, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } });
        const params = { Text: text, OutputFormat: "mp3", VoiceId: "Kajal", Engine: "neural", LanguageCode: "hi-IN" };
        const command = new SynthesizeSpeechCommand(params);
        const { AudioStream } = await pollyClient.send(command);
        const chunks = [];
        for await (const chunk of AudioStream) { chunks.push(chunk); }
        const buffer = Buffer.concat(chunks);
        console.log("[generateAudio] Audio generated successfully.");
        return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
    } catch (error) {
        console.error("❌ [generateAudio] Audio Generation FAILED:", error.message);
        return null; 
    }
}


// === PURANE FUNCTIONS (getIntent, routeUserQuery, handleBusinessLogic) MUKAMMAL TAUR PAR HATA DIYE GAYE HAIN ===
// Yahan ab koi lamba chauda logic nahi hai.


// === FINAL, SAADA AUR POWERFUL app.post FUNCTION ===
app.post('/', async (req, res) => {
    const { userId, message } = req.body;
    if (!userId) {
        console.error("❌ Request received without userId.");
        return res.status(400).json({ error: "User ID is required." });
    }

    console.log(`\n--- [${userId}] New Request --- Message: "${message}" ---`);

    try {
        // Step 1: User ka data Firebase se hasil karein
        const userRef = db.ref(`chat_users/${userId}`);
        const userSnapshot = await userRef.once('value');
        let userData = userSnapshot.val();

        // Agar naya user hai to uske liye data banayein
        if (!userData) {
            console.log(`[${userId}] New user detected. Creating initial data.`);
            userData = { details: {}, chat_history: [] };
        }
        if (!userData.chat_history) {
            userData.chat_history = [];
        }

        // Step 2: AI ke liye "Master Prompt" tayyar karein
        // Ismein AI ki core memory, user ki chat history, aur user ka naam shamil hai.
        const masterPrompt = getMasterPrompt(AI_CORE_MEMORY, userData.chat_history, userData.details?.name);

        // Step 3: AI ko azaadana sochne ke liye call karein
        const cohereResponse = await callCohere(masterPrompt, message);
        const responseText = cohereResponse.text;

        // Step 4: Chat history ko update karein aur Firebase mein save karein
        userData.chat_history.push({ role: "USER", message: message });
        userData.chat_history.push({ role: "CHATBOT", message: responseText });
        await userRef.set(userData);
        console.log(`[${userId}] Conversation history updated and saved to Firebase.`);

        // Step 5: Jawab ka audio banayein
        const audioUrl = await generateAudio(responseText);
        
        // Step 6: Final Jawab user ko bhej dein
        console.log(`[${userId}] Sending final autonomous response to user.`);
        res.status(200).json({ reply: responseText, audioUrl: audioUrl });

    } catch (error) {
        console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        console.error(`[${userId}] XXX A FATAL ERROR OCCURRED IN THE MAIN ROUTE HANDLER XXX`);
        console.error("Error Message:", error.message);
        console.error("Full Error Stack:", error.stack);
        console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
        
        res.status(500).json({ error: "Maazrat, AI agent mein ek andruni ghalti hogayi hai." });
    }
});
    
// === SERVER START (Yeh waisa hi hai) ===
app.listen(port, () => {
    console.log(`✅ Autonomous Recruitment Agent v2.0 is running on port ${port}`);
});
