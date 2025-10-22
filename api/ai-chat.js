// ai-chat.js (v30.0) - THE FINAL BOSS! (Using Your Personal Hugging Face Model)

// --- LIBRARIES ---
console.log("Starting server... Importing libraries...");
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const { Polly } = require('@aws-sdk/client-polly');
console.log("✅ Libraries imported successfully.");

// --- API KEY VERIFICATION ---
try {
    console.log("Verifying API keys...");
    // Ab humein sirf AWS aur Hugging Face ki keys chahiye
    const requiredEnvVars = [ 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'HUGGING_FACE_TOKEN' ];
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
app.use(express.static('public'));

// --- INITIALIZATIONS ---
let db, pollyClient;
try {
    console.log("Connecting to services...");
    
    // Aapka purana, chalta hua Firebase logic
    const serviceAccountPath = '/etc/secrets/firebase_credentials.json'; 
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://life-change-easy-default-rtdb.firebaseio.com" 
    });
    db = admin.database();
    console.log("✅ Firebase Yaddasht (Memory) Connected!");

    // AWS Polly (Voice Generation)
    pollyClient = new Polly({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
    console.log("✅ AWS Polly (Voice) Connected.");

} catch (error) {
    console.error("❌ FATAL STARTUP ERROR (INITIALIZATION):", error.message);
    process.exit(1);
}


// --- THE NEW, FINAL CHAT ENDPOINT ---
app.post('/', async (req, res) => {
    console.log("\n--- New request received for your PERSONAL AI ---");
    const { userId, message } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ error: 'userId or message is missing.' });
    }

    try {
        // --- Step 1: Get Chat History from Firebase ---
        const chatHistoryRef = db.ref(`chat_users/${userId}`); 
        const snapshot = await chatHistoryRef.once('value');
        const userData = snapshot.val() || {};
        const chatHistory = userData.chat_history || [];

        // --- Step 2: Call YOUR PERSONAL Hugging Face Model ---
        console.log(`[${userId}] 1. Calling your personal model: sabirj/jigar-shahzad-ai-mistral-v1`);
        const HF_TOKEN = process.env.HUGGING_FACE_TOKEN;
        const API_URL = "https://api-inference.huggingface.co/models/sabirj/jigar-shahzad-ai-mistral-v1";
        
        // Hum model ko batate hain ke user ne kya kaha hai
        const payload = {
            inputs: message,
            parameters: {
                // Hum yahan history nahi bhej rahe, kyunki model abhi simple hai
                // Agle version mein hum history bhi add kar sakte hain
            }
        };

        const fetch = (await import('node-fetch')).default;
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HF_TOKEN}` },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            // Agar model "so" raha hai, toh usko jagaane ka message dein
            if (apiResponse.status === 503 && errorText.includes("is currently loading")) {
                console.warn(`[${userId}] Model is loading, please wait 20-30 seconds and try again.`);
                return res.status(503).json({ error: "AI model is starting up. Please send your message again in 20 seconds." });
            }
            throw new Error(`Hugging Face API request failed: ${errorText}`);
        }
        
        console.log(`[${userId}] 2. Received response from your model.`);
        const data = await apiResponse.json();
        
        // Naye model ka jawab 'generated_text' mein aata hai
        const aiResponseText = data[0]?.generated_text || "Maazrat, main abhi aapka jawab nahi de sakta.";
        console.log(`[${userId}] AI Response: "${aiResponseText.substring(0, 70)}..."`);

        // --- Step 3: Generate Audio with AWS Polly ---
        console.log(`[${userId}] 3. Generating audio...`);
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal', LanguageCode: 'hi-IN' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');

        // --- Step 4: Save to Firebase & Send Response ---
        console.log(`[${userId}] 4. Saving to Firebase and sending final response...`);
        const newHistory = [...chatHistory, { role: "USER", message: message }, { role: "CHATBOT", message: aiResponseText }];
        await chatHistoryRef.child('chat_history').set(newHistory);

        res.json({ reply: aiResponseText, audioUrl: `data:audio/mpeg;base64,${audioBase64}` });
        console.log(`[${userId}] --- Request completed successfully! ---`);

    } catch (error) {
        console.error(`\n❌❌❌ [${userId}] AN ERROR OCCURRED ❌❌❌`);
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
    console.log(`\n🚀🚀🚀 Jigar Shahzad's PERSONAL AI Server is LIVE on port ${PORT} 🚀🚀🚀`);
});
    
