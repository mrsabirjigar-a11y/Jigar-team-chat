// FINAL FILE v7.0: ai-chat.js (Pure RAG with Google Gemini)

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
// Naye, saaday imports
const { getMasterPrompt } = require('./system_prompts');
const { loadTrainingData } = require('./agent_memory'); 
const { GoogleGenerativeAI } = require("@google/generative-ai");

// === INITIALIZATION ===
let ragDocuments; // Sirf ragDocuments
try {
    console.log("Initializing application...");
    const serviceAccountPath = '/etc/secrets/firebase_credentials.json';
    const serviceAccount = JSON.parse(require('fs').readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://life-change-easy-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Yaddasht (Memory) Connected!");

    // Sirf training data load karna
    ragDocuments = loadTrainingData(); 

} catch (error) {
    console.error("❌ CRITICAL INITIALIZATION FAILED:", error.message);
    process.exit(1);
}

const db = admin.database();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

// === EXPRESS APP SETUP (Waisa hi hai) ===
const app = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// === AUDIO GENERATION FUNCTION (Waisa hi hai) ===
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

// === FINAL, GOOGLE GEMINI 'callAI' FUNCTION (Without Core Memory) ===
async function callAI(userId, userMessage, chatHistory) {
    console.log(`[${userId}] Starting Google Gemini RAG process for: "${userMessage}"`);

    // Saada tareeqa relevant documents dhoondne ka
    const userMessageWords = userMessage.toLowerCase().split(' ');
    const topDocuments = ragDocuments.filter(doc => {
        const promptWords = doc.prompt.toLowerCase().split(' ');
        return promptWords.some(word => userMessageWords.includes(word));
    }).slice(0, 10); // 10 sab se milti-julti examples uthana

    console.log(`[${userId}] Found ${topDocuments.length} relevant documents.`);

    // Master Prompt banana (bina coreMemory ke)
    const masterPrompt = getMasterPrompt(topDocuments, userMessage, chatHistory);

    // Google Gemini ko call karna
    const result = await model.generateContent(masterPrompt);
    const response = await result.response;
    const responseText = response.text();
    
    console.log(`[${userId}] Google Gemini response generated successfully.`);
    return responseText;
}

// === MAIN ROUTE HANDLER (Waisa hi hai) ===
app.post('/', async (req, res) => {
    const { userId, message } = req.body;
    if (!userId || !message) {
        return res.status(400).json({ error: "User ID and message are required." });
    }

    console.log(`\n--- [${userId}] New Request --- Message: "${message}" ---`);

    try {
        const userRef = db.ref(`chat_users/${userId}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val() || { chat_history: [] };

        if (!userData.chat_history) {
            userData.chat_history = [];
        }

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

// === SERVER START (Waisa hi hai) ===
app.listen(port, () => {
    console.log(`✅ Recruitment Agent Server v7.0 (Pure RAG - Google) is running on port ${port}`);
});
                
