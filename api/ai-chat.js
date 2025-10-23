// AI-Chat Backend - Version 41.2 (Groq - USING A LIVE, AVAILABLE MODEL)
// Release Notes:
// - CRITICAL FIX 2: The model 'mixtral-8x7b-32768' was decommissioned by Groq.
// - REPLACED it with the new, currently available, and powerful 'llama3-70b-8192' model.
// - This is the final attempt to get the system working on Groq.

const express = require('express');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const Groq = require('groq-sdk');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

console.log("Server script starting... Groq Edition - Final Attempt.");

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

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
    console.error("❌ CRITICAL: GROQ_API_KEY environment variable is not set!");
    process.exit(1);
}
const groq = new Groq({ apiKey: GROQ_API_KEY });
console.log("✅ Groq client configured.");

async function getGroqResponse(prompt) {
    console.log("Entering getGroqResponse function...");
    try {
        console.log("Calling Groq API with the LATEST Llama3 model...");
        
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
            // --- THIS IS THE FINAL, FINAL FIX ---
            model: "llama3-70b-8192", // Using the new, available Llama3 model on Groq
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

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

app.post('/', async (req, res) => {
    console.log("\n--- Received new request on '/' endpoint ---");
    const { message, userId, history } = req.body;

    if (!userId || !message) {
        return res.status(400).send({ error: 'User ID and message are required.' });
    }

    try {
        const formattedHistory = (history || []).map(turn => `<s>[INST] ${turn.user} [/INST] ${turn.assistant} </s>`).join('');
        const prompt = `${formattedHistory}<s>[INST] ${message} [/INST]`;

        const aiResponseText = await getGroqResponse(prompt);

        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');

        const userMessageRef = db.ref(`chats/${userId}`).push();
        await userMessageRef.set({ type: 'user', text: message, timestamp: Date.now() });
        const aiMessageRef = db.ref(`chats/${userId}`).push();
        await aiMessageRef.set({ type: 'ai', text: aiResponseText, audio: audioBase64, timestamp: Date.now() });

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
    console.log(`\n🚀🚀🚀 Jigar Shahzad's AI Server (Groq Llama3 Edition) is LIVE on port ${PORT} 🚀🚀🚀`);
});
