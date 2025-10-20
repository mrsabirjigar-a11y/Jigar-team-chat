// =================================================================
// FINAL ai-chat.js (Version 7.0 - Using .env for Secrets)
// =================================================================

// === LIBRARIES ===
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { HfInference } = require('@huggingface/inference');

// --- YEH NAYI LINES HAIN ---
const dotenv = require('dotenv');
dotenv.config();
// ---------------------------

// === FIREBASE INITIALIZATION (Waisa hi hai) ===
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

// === HUGGING FACE SETUP (Ab yeh .env file se token uthayega) ===
const HF_TOKEN = process.env.HUGGING_FACE_TOKEN;
if (!HF_TOKEN) {
    console.error("❌ CRITICAL: Hugging Face Token not found in .env file!");
    process.exit(1);
}
const hf = new HfInference(HF_TOKEN); // Token yahan istemal ho raha hai
const YOUR_MODEL_ID = "sabirj/Jigar-Team-AI-Bot";
console.log(`✅ Hugging Face client tayyar hai. Model: ${YOUR_MODEL_ID}`);


// === EXPRESS APP SETUP (Waisa hi hai) ===
const app = express();
const port = process.env.PORT || 10000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// === call_Jigar_Team_AI FUNCTION (Waisa hi hai) ===
async function call_Jigar_Team_AI(userMessage, chatHistory) {
    console.log("[call_Jigar_Team_AI] Calling your fine-tuned Gemma model...");
    
    const formattedHistory = chatHistory.map(turn => ({
        role: turn.role.toLowerCase() === 'user' ? 'user' : 'assistant',
        content: turn.message
    }));

    const responseStream = hf.chatCompletionStream({
        model: YOUR_MODEL_ID,
        messages: [...formattedHistory, { role: "user", content: userMessage }],
        max_tokens: 500,
    });

    let finalResponse = "";
    for await (const chunk of responseStream) {
        finalResponse += chunk.choices[0]?.delta?.content || "";
    }

    if (!finalResponse) {
        throw new Error("Model ne khaali jawab diya.");
    }

    console.log("[call_Jigar_Team_AI] Successfully received response from your model.");
    return finalResponse.trim();
}

// === generateAudio FUNCTION (Waisa hi hai) ===
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

// === app.post FUNCTION (Waisa hi hai) ===
app.post('/', async (req, res) => {
    const { userId, message } = req.body;
    if (!userId) {
        return res.status(400).json({ error: "User ID is required." });
    }

    console.log(`\n--- [${userId}] New Request --- Message: "${message}" ---`);

    try {
        const userRef = db.ref(`chat_users/${userId}`);
        const userSnapshot = await userRef.once('value');
        let userData = userSnapshot.val() || {};
        let chatHistory = userData.chat_history || [];

        const responseText = await call_Jigar_Team_AI(message, chatHistory);
        
        chatHistory.push({ role: "USER", message: message });
        chatHistory.push({ role: "CHATBOT", message: responseText });

        await userRef.child('chat_history').set(chatHistory);
        console.log(`[${userId}] Firebase sync complete.`);

        const audioUrl = await generateAudio(responseText);
        
        console.log(`[${userId}] Sending final response to user.`);
        res.status(200).json({ reply: responseText, audioUrl: audioUrl });

    } catch (error) {
        console.error(`\n--- [${userId}] XXX A FATAL ERROR OCCURRED XXX ---`);
        console.error("Error Message:", error.message);
        
        res.status(500).json({ error: "Maazrat, AI agent mein ek andruni ghalti hogayi hai." });
    }
});
    
// === SERVER START (Waisa hi hai) ===
app.listen(port, () => {
    console.log(`✅ Jigar Team AI Server (Fine-Tuned Edition) is running on port ${port}`);
});
