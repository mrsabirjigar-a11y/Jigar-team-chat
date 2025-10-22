// AI-Chat Backend - Version 31.1
// Release Notes:
// - Added EXTENSIVE logging to trace the request lifecycle from start to finish.
// - This will help diagnose silent failures where no error was previously shown.
// - Every major step now prints a status to the console.

const express = require('express');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const fetch = require('node-fetch'); // Make sure node-fetch is in your package.json
const cors = require('cors'); // Added cors for cross-origin requests

const app = express();

// --- Middleware ---
app.use(cors()); // Use cors middleware
app.use(express.json());

console.log("Server script starting...");

// --- Firebase and AWS Configuration ---
try {
    const serviceAccount = require('/etc/secrets/firebase_credentials.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
    console.log("Firebase Admin initialized successfully.");
} catch (error) {
    console.error("CRITICAL: Failed to initialize Firebase Admin SDK. Check secret file path.", error);
}

const db = admin.database();
const pollyClient = new Polly({ region: 'ap-south-1' });
console.log("AWS Polly client configured.");


// --- Hugging Face Configuration ---
const HUGGING_FACE_API_URL = "https://api-inference.huggingface.co/models/sabirj/jigar-shahzad-ai-mistral-v1";
const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;

if (!HUGGING_FACE_TOKEN) {
    console.error("CRITICAL: HUGGING_FACE_TOKEN environment variable is not set!");
} else {
    console.log("Hugging Face token loaded successfully.");
}

// --- Helper function to call Hugging Face API with Retry ---
async function getHuggingFaceResponse(prompt, retries = 3, delay = 10000) {
    console.log("Entering getHuggingFaceResponse function...");
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Attempt ${i + 1}/${retries}: Calling Hugging Face API...`);
            const response = await fetch(HUGGING_FACE_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
                    'Content-Type': 'application/json'
                },
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
            console.log("Hugging Face API response received successfully:", JSON.stringify(result));
            
            if (result && result[0] && result[0].generated_text) {
                console.log("Exiting getHuggingFaceResponse with generated text.");
                return result[0].generated_text.trim();
            } else {
                throw new Error("Invalid response structure from Hugging Face API.");
            }

        } catch (error) {
            console.error(`Error in getHuggingFaceResponse (Attempt ${i + 1}):`, error);
            if (i === retries - 1) { // If it's the last retry, re-throw the error
                console.log("Exiting getHuggingFaceResponse with an error after all retries.");
                throw error;
            }
        }
    }
    console.log("Exiting getHuggingFaceResponse because all retries failed.");
    throw new Error("Failed to get response from Hugging Face API after multiple retries.");
}


// --- Main Chat Endpoint ---
app.post('/chat', async (req, res) => {
    console.log("\n--- Received new request on /chat endpoint ---");
    console.log("Request Body:", JSON.stringify(req.body));
    
    const { message, userId, history } = req.body;

    if (!userId || !message) {
        console.error("Validation failed: Missing userId or message.");
        return res.status(400).send({ error: 'User ID and message are required.' });
    }

    try {
        console.log(`Processing chat for userId: ${userId}`);

        // Step 1: Format the prompt
        const formattedHistory = (history || []).map(turn => `<s>[INST] ${turn.user} [/INST] ${turn.assistant} </s>`).join('');
        const prompt = `${formattedHistory}<s>[INST] ${message} [/INST]`;
        console.log("Constructed Prompt for AI.");

        // Step 2: Get AI response
        const aiResponseText = await getHuggingFaceResponse(prompt);
        console.log("AI response text received:", aiResponseText);

        // Step 3: Generate audio
        console.log("Requesting audio synthesis from AWS Polly...");
        const pollyParams = { Engine: 'neural', OutputFormat: 'mp3', Text: aiResponseText, VoiceId: 'Kajal' };
        const audioData = await pollyClient.synthesizeSpeech(pollyParams);
        const audioBase64 = Buffer.from(await audioData.AudioStream.transformToByteArray()).toString('base64');
        console.log("Audio generated and encoded to Base64 successfully.");

        // Step 4: Save to Firebase
        console.log("Saving messages to Firebase...");
        const userMessageRef = db.ref(`chats/${userId}`).push();
        await userMessageRef.set({ type: 'user', text: message, timestamp: Date.now() });
        const aiMessageRef = db.ref(`chats/${userId}`).push();
        await aiMessageRef.set({ type: 'ai', text: aiResponseText, audio: audioBase64, timestamp: Date.now() });
        console.log("Messages saved to Firebase successfully.");

        // Step 5: Send response to client
        console.log("Sending final response to client.");
        res.status(200).send({ text: aiResponseText, audio: audioBase64 });
        console.log("--- Request completed successfully ---");

    } catch (error) {
        console.error('FATAL ERROR in /chat endpoint:', error.message, error.stack);
        res.status(500).send({ error: 'An internal server error occurred.', details: error.message });
        console.log("--- Request failed with an error ---");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening for requests on port ${PORT}`);
});
                      
