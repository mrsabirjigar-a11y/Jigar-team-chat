// FINAL & GUARANTEED v11.0: ai-chat.js (Correct & Direct Google API Call)

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { getMasterPrompt } = require('./system_prompts');
const { loadTrainingData } = require('./agent_memory'); 

// === INITIALIZATION ===
let ragDocuments;
try {
    console.log("Initializing application...");
    const serviceAccountPath = '/etc/secrets/firebase_credentials.json';
    const serviceAccount = JSON.parse(require('fs').readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://life-change-easy-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Yaddasht (Memory) Connected!");
    ragDocuments = loadTrainingData();
} catch (error) {
    console.error("❌ CRITICAL INITIALIZATION FAILED:", error.message);
    process.exit(1);
}

const db = admin.database();

// === EXPRESS APP SETUP ===
const app = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// === AUDIO GENERATION FUNCTION (Mukammal Code) ===
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

// === FINAL, GUARANTEED GOOGLE API 'callAI' FUNCTION (v11.0) ===
async function callAI(userId, userMessage, chatHistory) {
    console.log(`[${userId}] Starting Guaranteed Google API call for: "${userMessage}"`);

    const userMessageWords = userMessage.toLowerCase().split(' ');
    const topDocuments = ragDocuments.filter(doc => {
        const promptWords = doc.prompt.toLowerCase().split(' ');
        return promptWords.some(word => userMessageWords.includes(word));
    }).slice(0, 10);

    console.log(`[${userId}] Found ${topDocuments.length} relevant documents.`);
    
    // === YAHAN WOH FINAL FIX HAI ===
    // Hum ne 'userQuery' ko yahan se hata diya hai, kyunke uski zaroorat nahi.
    const systemInstruction = getMasterPrompt(topDocuments, chatHistory);

    const contents = chatHistory.map(turn => ({
        role: turn.role.toLowerCase(),
        parts: [{ text: turn.message }]
    }));
    contents.push({ role: "user", parts: [{ text: userMessage }] });

    const GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GOOGLE_API_KEY}`;

    const body = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        }
    };

    const apiResponse = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error("Google API Error Body:", errorText);
        throw new Error(`Google API call failed: ${apiResponse.statusText}`);
    }

    const responseData = await apiResponse.json();
    
    if (!responseData.candidates || !responseData.candidates[0].content || !responseData.candidates[0].content.parts[0].text) {
        console.error("Invalid response structure from Google API:", responseData);
        throw new Error("AI returned an invalid response structure.");
    }
    
    const responseText = responseData.candidates[0].content.parts[0].text;

    console.log(`[${userId}] Google API response generated successfully.`);
    return responseText;
}

// === MAIN ROUTE HANDLER (Mukammal Code) ===
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

        userData.chat_history.push({ role: "user", message: message });
        userData.chat_history.push({ role: "model", message: responseText });
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
    console.log(`✅ Recruitment Agent Server v11.0 (Guaranteed) is running on port ${port}`);
});
