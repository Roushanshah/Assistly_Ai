import { INSERT_MESSAGE } from "@/graphql/mutations/mutations";
import { GET_CHATBOT_BY_ID, GET_MESSAGES_BY_CHAT_SESSION_ID } from "@/graphql/queries/queries";
import { serverClient } from "@/lib/server/serverClient";
import { GetChatbotByIdResponse, MessageBYChatSessionIdResponse } from "@/types/types";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY,
// });

const genAI = new GoogleGenerativeAI("AIzaSyAF_83amtzSn3mN4VmwOGCPczGdiIhMAkA");

export async function POST(req: NextRequest) {
    const {chat_session_id, chatbot_id, content, name, created_at} = await req.json();

    console.log(`Received message from chat session ${chat_session_id}:${content} (chatbot:${chatbot_id})`);

    try {
        // Step 1: Fetch chatbot characteristics
        const {data} = await serverClient.query<GetChatbotByIdResponse>({
            query: GET_CHATBOT_BY_ID,
            variables: {id: chatbot_id},
        });

        const chatbot = data.chatbots;
        if(!chatbot) {
            return NextResponse.json({ error: "Chatbot not found" }, { status: 404 })
        }

        // Step 2: Fetch previous messages
        const {data: messageData} = await serverClient.query<MessageBYChatSessionIdResponse>({
            query: GET_MESSAGES_BY_CHAT_SESSION_ID,
            variables: {chat_session_id},
            fetchPolicy: "no-cache",
        });

        const previousMessages = messageData.chat_sessions.messages;

        // const formattedPreviousMessages: ChatCompletionMessageParam[] = previousMessages.map((message) => ({
        //     role: message.sender === "ai" ? "system" : "user",
        //     name: message.sender === "ai" ? "system" : name,
        //     content: message.content,
        // }));

        const formattedPreviousMessages = previousMessages.map((message) => ({
            role: message.sender === "ai" ? "model" : "user",
            parts: [{ text: message.content }],
        }));

        //Combine characteristics into a system prompt
        const systemPrompt = chatbot.chatbot_characteristics.map((c) => c.content).join(" + ");

        console.log("systemPrompt", systemPrompt);

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: `You are a helpful assistant talking to ${name}. If a generic question is asked which is not relevant or in the same scope or domain as the points mentioned in the key information section, kindly inform the user they're only allowed to search for the specified content. Use Emojis where possible. Here is some key information that you need to be aware of, these are elements you may be asked about: ${systemPrompt}` }],
                },
                {
                    role: "model",
                    parts: [{ text: "Understood. I'm ready to assist within the specified parameters." }],
                },
                ...formattedPreviousMessages
            ],
        });

        // const messages: ChatCompletionMessageParam[] = [
        //     {
        //         role: "system",
        //         name: "system",
        //         content: `You are a helpful assistant talking to ${name}. If a generic question is asked which is not relevant or in the same scope or domain as the points mentioned in the key information section, kindly inform the user they're only allowed to search for the specified content. Use Emojis where possible. Here is some key information that you need to be aware of, these are elements you may be asked about: ${systemPrompt}`,
        //     },
        //     ...formattedPreviousMessages,
        //     {
        //         role: "user",
        //         name: name,
        //         content: content,
        //     },
        // ]

        // Step 3: Send the message to openAI's completions API
        // const openaiResponse = await openai.chat.completions.create({
        //     messages: messages,
        //     model: "gpt-3.5-turbo"
        // });

        // const aiResponse = openaiResponse?.choices?.[0]?.message?.content?.trim();

        const result = await chat.sendMessage(content);
        const aiResponse = result.response.text();

        if(!aiResponse) {
            return NextResponse.json({ error: "Failed to generate AI Response" }, { status: 500 })
        }

        // Step 4: Save the user's message in the database
        await serverClient.mutate({
            mutation: INSERT_MESSAGE,
            variables: {chat_session_id, content, sender: "user", created_at: created_at},
        });

        // Step 4: Save the AI's response in the database
        const aiMessageResult = await serverClient.mutate({
            mutation: INSERT_MESSAGE,
            variables: {chat_session_id, content: aiResponse, sender: "ai", created_at: created_at},
        });

        console.log("aiMessageResult", aiMessageResult);

        // Step 6: Return the AI's response to the client
        return NextResponse.json({ 
            id: aiMessageResult.data.insertMessages.id,
            content: aiResponse,
        });
        
    } catch (error) {
        console.error("Error sending message:", error)
        return NextResponse.json({ error }, { status: 500 })
    }
}