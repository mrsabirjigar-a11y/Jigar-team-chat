// AI-Chat Backend - Version 31.2
// Release Notes:
// - CORRECTED: Reverted endpoint from '/chat' back to '/' to match the frontend request URL. This fixes the "silent failure" issue.
// - Kept the extensive logging from v31.1 to trace requests.
// - Re-integrated the 'streamToBuffer' helper function for AWS Polly audio conversion.
// - This version combines the best parts of the old and new code.

const express = require('express');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

console.log("Server script starting...");

// --- Firebase and AWS Configuration ---
try {
    // IMPORTANT: Make sure your Firebase credentials file is at this exact path on Render.
    const serviceAccount = require('/etc/secrets/firebase_credentials.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://life-change-easy-default-rtdb.firebaseio.com` // Using your specific database URL
    });
    console.log("✅ Firebase Admin initialized successfully.");
} catch (error) {
    console.error("❌ CRITICAL: Failed to initialize Firebase Admin SDK. Check secret file path.", error);
    process.exit(1); // Stop server if Firebase fails
}

const db = admin.database();
const pollyClient = new Polly({ region: 'ap-south-1' });
console.log("✅ AWS Polly client configured.");


// --- Hugging Face Configuration ---
const HUGGING_FACE_API_URL = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2";
const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;

if (!HUGGING_FACE_TOKEN) {
    console.error("❌ CRITICAL: HUGGING_FACE_TOKEN environment variable is not set!");
    process.exit(1); // Stop server if token is missing
} else {
    console.log("✅ Hugging Face token loaded.");
}

// --- Helper function to call Hugging Face API with Retry ---
async function getHuggingFaceResponse(prompt, retries = 3, delay = 10000) {
    console.log("Entering getHuggingFaceResponse function...");
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Attempt ${i + 1}/${retries}: Calling Hugging Face API...`);
            const response = await fetch(HUGGING_FACE_API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: { max_new_tokens: 250, return_full_text: false, temperature: 0.7 }
                })
            });

            console.log(`Hugging Face API responded with status: ${response.status}`);
            if (!response.ok) {
                const errorBody = await response.text();
                if (response.status === 503) {
                    console.warn(`Model is loading (503). Retrying in ${delay / 1000} seconds...`);
                    if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
                    continue; 
                }
                throw new Error(`Hugging Face API Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const result = await response.json();
            console.log("Hugging Face API response received successfully.");
            
            if (result && result[0] && result[0].generated_text) {
                return result[0].generated_text.trim();
            } else {
                throw new Error("Invalid response structure from Hugging Face API.");
            }
        } catch (error) {
            console.error(`Error in getHuggingFaceResponse (Attempt ${i + 1}):`, error);
            if (i === retries - 1) throw error;
        }
    }
    throw new Error("Failed to get response from Hugging Face API after all retries.");
}

// Helper function to convert Polly's audio stream to a buffer
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

// --- Main Chat Endpoint (Corrected to '/') ---
app.post('/', async (req, res) => {
    console.log("\n--- Received new request on '/' endpoint ---");
    const { message, userId, history } = req.body; // Assuming frontend might send history

    if (!userId || !message) {
        console.error("Validation failed: Missing userId or message.");
        return res.status(400).send({ error: 'User ID and message are required.' });
    }

    try {
        console.log(`Processing chat for userId: ${userId}`);

        // Step 1: Format prompt with history
        const formattedHistory = (history || []).map(turn => `<s>[INST] ${turn.user} [/INST] ${turn.assistant} </s>`).join('');
        const prompt = `${formattedHistory}<s>[INST] ${message} [/INST]`;
        console.log("Constructed Prompt for AI.");

        // Step 2: Get AI response
        const aiResponseText = await getHuggingFaceResponse(prompt);
        console.log("AI response text received.");

        // Step 3: Generate audio
        console.log("Requesting audio from AWS Polly...");
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal' };
        const audioStream = (await pollyClient.synthesizeSpeech(pollyParams)).AudioStream;
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');
        console.log("Audio generated and encoded successfully.");

        // Step 4: Save to Firebase (using your new structure)
        console.log("Saving messages to Firebase...");
        const userMessageRef = db.ref(`chats/${userId}`).push();
        await userMessageRef.set({ type: 'user', text: message, timestamp: Date.now() });
        const aiMessageRef = db.ref(`chats/${userId}`).push();
        await aiMessageRef.set({ type: 'ai', text: aiResponseText, audio: audioBase64, timestamp: Date.now() });
        console.log("Messages saved to Firebase.");

        // Step 5: Send response to client
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
    console.log(`\n🚀🚀🚀 Jigar Shahzad's PERSONAL AI Server is LIVE on port ${PORT} 🚀🚀🚀`);
});

    
