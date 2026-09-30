const { Client, GatewayIntentBits, Events } = require('discord.js');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('ReWorked-Games Tracker Bot is running perfectly!');
});

app.listen(PORT, () => {
    console.log("📡 Render web listener successfully bound to port " + PORT);
});

const RAW_TOKEN = process.env.DISCORD_BOT_TOKEN;
const BOT_TOKEN = RAW_TOKEN ? RAW_TOKEN.replace(/["']/g, "").trim() : undefined;
const TARGET_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const ROBLOX_GROUP_ID = 223811537; 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let cachedShoutText = "";
const activePollsMap = new Map();

async function checkRobloxGroupShout() {
    try {
        // FIXED APIS: Clean string link concatenation prevents the ENOTFOUND crashes on Render
        const apiEndpoint = "https://roproxy.com" + ROBLOX_GROUP_ID;
        const res = await axios.get(apiEndpoint);
        
        if (!res.data || !res.data.shout) return;

        const currentShout = res.data.shout.body;
        const author = res.data.shout.poster.username;
        const groupName = res.data.name;

        if (cachedShoutText === "") {
            cachedShoutText = currentShout;
            console.log("System baseline established. Monitoring shout: " + cachedShoutText);
            return;
        }

        if (currentShout !== cachedShoutText) {
            cachedShoutText = currentShout;
            console.log("🚨 Change detected! Transferring live Roblox group announcement...");
            await dispatchNativelyTrackedPoll(currentShout, author, groupName);
        }
    } catch (err) {
        console.error("Error contacting group API proxy: ", err.message);
    }
}

async function dispatchNativelyTrackedPoll(rawShout, author, groupName) {
    try {
        const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (!channel) return;

        // VISUAL FIX: Passes your text directly to the native poll box with zero text-splitting templates
        const sentMessage = await channel.send({
            content: "# 📢 **" + groupName.toUpperCase() + " UPDATE**\n\n**New announcement from @" + author + ":**",
            poll: {
                question: { text: rawShout.substring(0, 300) },
                answers: [
                    { pollMedia: { text: "Yes / Agree" } },
                    { pollMedia: { text: "No / Disagree" } }
                ],
                duration: 24,
                allowMultiselect: false
            }
        });

        activePollsMap.set(sentMessage.id, {
            question: rawShout,
            choices: [
                { id: 1, text: "Yes / Agree" },
                { id: 2, text: "No / Disagree" }
            ],
            votersRegistry: {}
        });
    } catch (error) {
        console.error("Failed to dispatch native poll card: ", error.message);
    }
}

client.on(Events.MessagePollVoteAdd, async (pollAnswer, userId) => {
    try {
        const messageId = pollAnswer.message.id;
        if (!activePollsMap.has(messageId)) return;
        
        const pollMetadata = activePollsMap.get(messageId);
        const userInstance = await client.users.fetch(userId);
        if (userInstance.bot) return;

        const chosenAnswerId = pollAnswer.answerId;
        const choiceObject = pollMetadata.choices.find(c => c.id === chosenAnswerId);
        const selectionText = choiceObject ? choiceObject.text : "Unknown Option";

        pollMetadata.votersRegistry[userInstance.username] = selectionText;

        // Tracks live user profiles transparently inside the background terminal console log
        console.log("📊 [VOTE VERIFICATION]: @" + userInstance.username + " selected -> " + selectionText);
        
    } catch (e) {
        console.error("Error tracking live gateway vote: ", e.message);
    }
});

client.once(Events.ClientReady, () => {
    console.log("🤖 Connected to Discord Gateway as " + client.user.tag + ". Active tracking active!");
    setInterval(checkRobloxGroupShout, 60000); 
});

client.login(BOT_TOKEN);
