// AI-Chat Backend - Version 41.0 (Groq Powered - CORRECTED)
// Release Notes:
// - FIXED: Re-integrated the original 'streamToBuffer' function for AWS Polly audio. Audio will work now.
// - FIXED: Corrected the AI's identity. The system prompt now correctly instructs the AI to be a female assistant named Kajal.
// - FIXED: Reverted the chat history format to the original `<s>[INST]` format for better model performance.
// - This version truly replaces ONLY the Hugging Face part with Groq, keeping everything else you had.

const express = require('express');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const Groq = require('groq-sdk'); // Naya SDK
const cors = require('cors');

const app = express();

// --- Middleware (No Changes) ---
app.use(cors());
app.use(express.json());

console.log("Server script starting... Groq Edition - Corrected.");

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


// --- Groq Configuration (The New Part) ---
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
    console.error("❌ CRITICAL: GROQ_API_KEY environment variable is not set!");
    process.exit(1);
}
const groq = new Groq({ apiKey: GROQ_API_KEY });
console.log("✅ Groq client configured.");


// --- Helper function to call Groq API (Corrected and Improved) ---
async function getGroqResponse(prompt) {
    console.log("Entering getGroqResponse function...");
    try {
        console.log("Calling Groq API...");
        
        // Constructing messages for Groq API
        // We will use a system prompt and the user's prompt.
        // The history is already part of the main prompt.
        const messages = [
            {
                role: "system",
                content: "You are a helpful female AI assistant for the 'Jigar Team' business. Your name is Kajal. You must speak in Roman Urdu. Your main goal is to guide users through the registration process, explain job plans, and answer questions about the business. Be professional, polite, and always loyal to the Jigar Team."
            },
            {
                role: "user",
                content: prompt, // The prompt already contains the history and the new message
            },
        ];

        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: "mistral-7b-instruct-v0.2", // Using the same base model you fine-tuned
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

// Helper function to convert Polly's audio stream to a buffer (YOUR ORIGINAL, WORKING CODE)
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

// --- Main Chat Endpoint (Only AI call is changed) ---
app.post('/', async (req, res) => {
    console.log("\n--- Received new request on '/' endpoint ---");
    const { message, userId, history } = req.body;

    if (!userId || !message) {
        return res.status(400).send({ error: 'User ID and message are required.' });
    }

    try {
        console.log(`Processing chat for userId: ${userId}`);

        // Step 1: Format prompt with history (YOUR ORIGINAL, WORKING CODE)
        const formattedHistory = (history || []).map(turn => `<s>[INST] ${turn.user} [/INST] ${turn.assistant} </s>`).join('');
        const prompt = `${formattedHistory}<s>[INST] ${message} [/INST]`;
        console.log("Constructed Prompt for AI.");

        // Step 2: Get AI response (This is the only change)
        const aiResponseText = await getGroqResponse(prompt); // Using Groq now!
        console.log("AI response text received.");

        // Step 3: Generate audio (YOUR ORIGINAL, WORKING CODE)
        console.log("Requesting audio from AWS Polly...");
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');
        console.log("Audio generated and encoded successfully.");

        // Step 4: Save to Firebase (YOUR ORIGINAL, WORKING CODE)
        console.log("Saving messages to Firebase...");
        const userMessageRef = db.ref(`chats/${userId}`).push();
        await userMessageRef.set({ type: 'user', text: message, timestamp: Date.now() });
        const aiMessageRef = db.ref(`chats/${userId}`).push();
        await aiMessageRef.set({ type: 'ai', text: aiResponseText, audio: audioBase64, timestamp: Date.now() });
        console.log("Messages saved to Firebase.");

        // Step 5: Send response to client (YOUR ORIGINAL, WORKING CODE)
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
    console.log(`\n🚀🚀🚀 Jigar Shahzad's AI Server (Groq Corrected Edition) is LIVE on port ${PORT} 🚀🚀🚀`);
});
