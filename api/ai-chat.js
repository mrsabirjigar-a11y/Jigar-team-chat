// FINAL FILE v4.0: ai-chat.js (Direct API Call - No Library)

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { getMasterPrompt } = require('./system_prompts');
const { loadAndPrepareData } = require('./agent_memory');
// const cohere = require('cohere-ai'); // <-- Iski ab zaroorat nahi

// === INITIALIZATION ===
let coreMemory, ragDocuments;
try {
    console.log("Initializing application...");
    const serviceAccountPath = '/etc/secrets/firebase_credentials.json';
    const serviceAccount = JSON.parse(require('fs').readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://life-change-easy-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Yaddasht (Memory) Connected!");

    const preparedData = loadAndPrepareData();
    coreMemory = preparedData.coreMemory;
    ragDocuments = preparedData.ragDocuments;

} catch (error) {
    console.error("❌ CRITICAL INITIALIZATION FAILED:", error.message);
    process.exit(1);
}

const db = admin.database();
// cohere.init(...); // <-- Iski ab zaroorat nahi

// === EXPRESS APP SETUP ===
const app = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// === AUDIO GENERATION FUNCTION (Waisa hi hai) ===
async function generateAudio(text) {
    // ... (Is mein koi tabdeeli nahi)
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

// === FINAL, DIRECT API 'callAI' FUNCTION ===
async function callAI(userId, userMessage, chatHistory) {
    console.log(`[${userId}] Starting Direct API call for message: "${userMessage}"`);

    // Rerank ka istemal nahi kar rahe, saada search istemal kar rahe hain
    const userMessageWords = userMessage.toLowerCase().split(' ');
    const topDocuments = ragDocuments.filter(doc => {
        const promptWords = doc.prompt.toLowerCase().split(' ');
        return promptWords.some(word => userMessageWords.includes(word));
    }).slice(0, 5);

    console.log(`[${userId}] Found ${topDocuments.length} relevant documents.`);

    const masterPrompt = getMasterPrompt(coreMemory, topDocuments, userMessage, chatHistory);

    // Direct API call ka code
    const COHERE_API_KEY = process.env.COHERE_API_KEY;
    const API_URL = "https://api.cohere.ai/v1/chat";
    const body = {
        model: "command-r-plus-08-2024",
        preamble: masterPrompt,
        chat_history: chatHistory,
        message: "Please provide the response now.",
    };

    const apiResponse = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${COHERE_API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        throw new Error(`Cohere API call failed: ${errorText}`);
    }

    const responseData = await apiResponse.json();
    console.log(`[${userId}] AI response generated successfully.`);
    return responseData.text;
}


// === MAIN ROUTE HANDLER (Waisa hi hai) ===
app.post('/', async (req, res) => {
    // ... (Is mein koi tabdeeli nahi)
    const { userId, message } = req.body;
    if (!userId || !message) {
        return res.status(400).json({ error: "User ID and message are required." });
    }

    console.log(`\n--- [${userId}] New Request --- Message: "${message}" ---`);

    try {
        const userRef = db.ref(`chat_users/${userId}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val() || { chat_history: [] };

        const responseText = await callAI(userId, message, userData.chat_history);
        
        const audioUrl = await generateAudio(responseText);

        userData.chat_history.push({ role: "USER", message: message });
        userData.chat_history.push({ role: "CHATBOT", message: responseText });
        await userRef.set(userData);
        console.log(`[${userId}] Firebase history updated.`);

        res.status(200).json({ reply: responseText, audioUrl: audioUrl });

    } catch (error) {
        console.error(`[${userId}] XXX A FATAL ERROR OCCURRED:`, error);
        res.status(500).json({ error: "Maazrat, AI agent mein ek andruni ghalti hogayi hai." });
    }
});

// === SERVER START ===
app.listen(port, () => {
    console.log(`✅ Recruitment Agent Server v4.0 (Direct API) is running on port ${port}`);
});
