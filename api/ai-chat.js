// AI-Chat Backend - Version 41.1 (Groq - CORRECTED MODEL NAME)
// Release Notes:
// - CRITICAL FIX: Corrected the Groq model name from the non-existent 'mistral-7b-instruct-v0.2' to the correct, available model 'mixtral-8x7b-32768'.
// - This was the cause of the "model_not_found" error. Everything else remains the same.

const express = require('express');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const Groq = require('groq-sdk');
const cors = require('cors');

const app = express();

// --- Middleware (No Changes) ---
app.use(cors());
app.use(express.json());

console.log("Server script starting... Groq Edition - Final Fix.");

// --- Firebase and AWS Configuration (No Changes) ---
try {
    const serviceAccount = require('/etc/secrets/firebase_credentials.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://life-change-easy-default-rtdb.firebaseio.com`
    });
    console.log("✅ Firebase Admin initialized successfully.");
} catch (error) {
    console.error("❌ CRITICAL: Failed to initialize Firebase Admin SDK.", error);
    process.exit(1);
}

const db = admin.database();
const pollyClient = new Polly({ region: 'ap-south-1' });
console.log("✅ AWS Polly client configured.");


// --- Groq Configuration (No Changes) ---
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
    console.error("❌ CRITICAL: GROQ_API_KEY environment variable is not set!");
    process.exit(1);
}
const groq = new Groq({ apiKey: GROQ_API_KEY });
console.log("✅ Groq client configured.");


// --- Helper function to call Groq API (Model Name Corrected) ---
async function getGroqResponse(prompt) {
    console.log("Entering getGroqResponse function...");
    try {
        console.log("Calling Groq API with the CORRECT model name...");
        
        const messages = [
            {
                role: "system",
                content: "You are a helpful female AI assistant for the 'Jigar Team' business. Your name is Kajal. You must speak in Roman Urdu. Your main goal is to guide users through the registration process, explain job plans, and answer questions about the business. Be professional, polite, and always loyal to the Jigar Team."
            },
            {
                role: "user",
                content: prompt,
            },
        ];

        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            // --- THIS IS THE CRITICAL FIX ---
            model: "mixtral-8x7b-32768", // Using the correct model name available on Groq
            temperature: 0.7,
            max_tokens: 300,
        });

        const aiResponseText = chatCompletion.choices[0]?.message?.content || "Maazrat, main is waqt jawab nahi de sakta.";
        console.log("Groq API responded successfully!");
        return aiResponseText.trim();

    } catch (error) {
        console.error("❌ Error in getGroqResponse:", error);
        throw error;
    }
}

// Helper function to convert Polly's audio stream to a buffer (No Changes)
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

// --- Main Chat Endpoint (No Changes) ---
app.post('/', async (req, res) => {
    console.log("\n--- Received new request on '/' endpoint ---");
    const { message, userId, history } = req.body;

    if (!userId || !message) {
        return res.status(400).send({ error: 'User ID and message are required.' });
    }

    try {
        console.log(`Processing chat for userId: ${userId}`);

        const formattedHistory = (history || []).map(turn => `<s>[INST] ${turn.user} [/INST] ${turn.assistant} </s>`).join('');
        const prompt = `${formattedHistory}<s>[INST] ${message} [/INST]`;
        console.log("Constructed Prompt for AI.");

        const aiResponseText = await getGroqResponse(prompt);
        console.log("AI response text received.");

        console.log("Requesting audio from AWS Polly...");
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');
        console.log("Audio generated and encoded successfully.");

        console.log("Saving messages to Firebase...");
        const userMessageRef = db.ref(`chats/${userId}`).push();
        await userMessageRef.set({ type: 'user', text: message, timestamp: Date.now() });
        const aiMessageRef = db.ref(`chats/${userId}`).push();
        await aiMessageRef.set({ type: 'ai', text: aiResponseText, audio: audioBase64, timestamp: Date.now() });
        console.log("Messages saved to Firebase.");

        console.log("Sending final response to client.");
        res.status(200).send({ text: aiResponseText, audio: audioBase64 });
        console.log("--- Request completed successfully ---\n");

    } catch (error) {
        console.error('❌ FATAL ERROR in / endpoint:', error.message, error.stack);
        res.status(500).send({ error: 'An internal server error occurred.', details: error.message });
        console.log("--- Request failed with an error ---\n");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀🚀🚀 Jigar Shahzad's AI Server (Groq Final Fix) is LIVE on port ${PORT} 🚀🚀🚀`);
});
