// AI-Chat Backend - Version 31.0
// Release Notes:
// - Added retry logic and improved error handling for Hugging Face API calls.
// - Specifically handles the '503 Service Unavailable' (model loading) error by waiting and retrying.
// - This prevents the server from crashing during model cold starts.

const express = require('express');
const admin = require('firebase-admin');
const { Polly } = require('@aws-sdk/client-polly');
const fetch = require('node-fetch'); // Make sure node-fetch is in your package.json

const app = express();
app.use(express.json());

// --- Firebase and AWS Configuration ---
const serviceAccount = require('/etc/secrets/firebase_credentials.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = admin.database();
const pollyClient = new Polly({ region: 'ap-south-1' });

// --- Hugging Face Configuration ---
const HUGGING_FACE_API_URL = "https://api-inference.huggingface.co/models/sabirj/jigar-shahzad-ai-mistral-v1";
const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;

// --- Helper function to call Hugging Face API with Retry ---
async function getHuggingFaceResponse(prompt, retries = 3, delay = 10000) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Attempt ${i + 1}: Calling Hugging Face API...`);
            const response = await fetch(HUGGING_FACE_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 250,
                        return_full_text: false,
                        temperature: 0.7
                    }
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                // If model is loading, wait and retry
                if (response.status === 503) {
                    console.warn(`Model is loading (503). Retrying in ${delay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Go to the next iteration of the loop
                }
                // For other errors, throw an exception
                throw new Error(`Hugging Face API Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const result = await response.json();
            console.log("Hugging Face API response received:", JSON.stringify(result));
            
            // Check if the expected output is present
            if (result && result[0] && result[0].generated_text) {
                return result[0].generated_text.trim();
            } else {
                throw new Error("Invalid response structure from Hugging Face API.");
            }

        } catch (error) {
            console.error(`Error in getHuggingFaceResponse (Attempt ${i + 1}):`, error);
            if (i === retries - 1) { // If it's the last retry, re-throw the error
                throw error;
            }
        }
    }
    // If all retries fail
    throw new Error("Failed to get response from Hugging Face API after multiple retries.");
}


// --- Main Chat Endpoint ---
app.post('/chat', async (req, res) => {
    const { message, userId, history } = req.body;

    if (!userId || !message) {
        return res.status(400).send({ error: 'User ID and message are required.' });
    }

    try {
        console.log("Received chat request:", { userId, message });

        // Step 1: Format the prompt for the fine-tuned model
        const formattedHistory = history.map(turn => 
            `<s>[INST] ${turn.user} [/INST] ${turn.assistant} </s>`
        ).join('');
        const prompt = `${formattedHistory}<s>[INST] ${message} [/INST]`;
        console.log("Constructed Prompt:", prompt);

        // Step 2: Get AI response from our fine-tuned model
        const aiResponseText = await getHuggingFaceResponse(prompt);

        // Step 3: Generate audio from the AI response
        const pollyParams = {
            Engine: 'neural',
            OutputFormat: 'mp3',
            Text: aiResponseText,
            VoiceId: 'Kajal'
        };
        const audioData = await pollyClient.synthesizeSpeech(pollyParams);
        const audioBase64 = Buffer.from(await audioData.AudioStream.transformToByteArray()).toString('base64');

        // Step 4: Save the new exchange to Firebase
        const userMessageRef = db.ref(`chats/${userId}`).push();
        await userMessageRef.set({
            type: 'user',
            text: message,
            timestamp: Date.now()
        });
        const aiMessageRef = db.ref(`chats/${userId}`).push();
        await aiMessageRef.set({
            type: 'ai',
            text: aiResponseText,
            audio: audioBase64,
            timestamp: Date.now()
        });

        // Step 5: Send the response back to the client
        res.status(200).send({
            text: aiResponseText,
            audio: audioBase64
        });

    } catch (error) {
        console.error('Error in /chat endpoint:', error);
        res.status(500).send({ error: 'An internal server error occurred.', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
                          
