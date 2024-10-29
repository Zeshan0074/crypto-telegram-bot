create stream function

require("dotenv").config();
const express = require("express");
const { EvmChain } = require("moralis/common-evm-utils");
const TelegramBot = require("node-telegram-bot-api");
const Moralis = require("moralis").default;

const port = 5001;
const app = express();
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

let chatId = null;

app.use(express.json({ limit: "1mb" }));

// Test endpoint to verify server is running
app.get("/test", (req, res) => res.status(200).send("Server is running!"));

const startMoralis = async () => {
  try {
    await Moralis.start({ apiKey: process.env.MORALIS_API_KEY });
    console.log("Moralis initialized successfully.");
  } catch (error) {
    console.error("Error initializing Moralis:", error);
  }
};

const validateWebhookUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const createStreamWithUserConfig = async (tag) => {
  try {
    const webhookUrl = process.env.WEBHOOK_URL?.endsWith("/webhook")
      ? process.env.WEBHOOK_URL
      : `${process.env.WEBHOOK_URL}/webhook`;

    if (!webhookUrl || !validateWebhookUrl(webhookUrl)) {
      throw new Error("Invalid or missing WEBHOOK_URL in .env file");
    }

    const streamConfig = {
      webhookUrl,
      tag,
      chains: [EvmChain.SEPOLIA],
      description: "User-created stream",
      includeNativeTxs: true,
    };

    const response = await Moralis.Streams.add(streamConfig);
    const streamData = response.jsonResponse; // Access jsonResponse for actual data

    console.log("Stream creation response:", streamData); // Log for verification

    const streamInfo = `
      Created Stream
      - Stream ID: ${streamData.id || "N/A"}
      - Tag: ${streamData.tag || "N/A"}
      - Chains: ${streamData.chainIds ? streamData.chainIds.join(", ") : "N/A"}
      - Native TXS: ${streamData.includeNativeTxs ? "Enabled" : "Disabled"}
      - Webhook URL: ${streamData.webhookUrl || "N/A"}
      - Status: ${streamData.status || "N/A"}`;

    if (chatId) bot.sendMessage(chatId, streamInfo.trim());
    return streamData;
  } catch (error) {
    console.error("Error creating stream:", error);
    if (chatId) bot.sendMessage(chatId, `Error creating stream: ${error.message}`);
    throw error;
  }
};


const askUserForInput = (chatId, message) =>
  new Promise((resolve) => {
    bot.sendMessage(chatId, message).then(() => {
      bot.once("message", (msg) => resolve(msg.text));
    });
  });

const promptUserForTag = async (chatId) =>
  await askUserForInput(chatId, "Please enter the tag for your stream:");

bot.onText(/\/start/, (msg) => {
  chatId = msg.chat.id;
  bot.sendMessage(chatId, "Bot started successfully! Use /stream to create a new stream.");
});

bot.onText(/\/stream/, async (msg) => {
  chatId = msg.chat.id;

  if (!process.env.WEBHOOK_URL || !validateWebhookUrl(process.env.WEBHOOK_URL)) {
    return bot.sendMessage(chatId, "Invalid or missing WEBHOOK_URL in .env file.");
  }

  const tag = await promptUserForTag(chatId);
  await createStreamWithUserConfig(tag);
});

app.post("/webhook", (req, res) => {
  try {
    const { confirmed, chainId, tag, txs } = req.body;

    const message = `
      Webhook Data:
      - Confirmed: ${confirmed}
      - Chain ID: ${chainId}
      - Tag: ${tag}
      - Transactions: ${txs.length}`;

    if (chatId) bot.sendMessage(chatId, message.trim());
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, async () => {
  console.log(`Server started on port ${port}`);
  await startMoralis();

  if (!process.env.WEBHOOK_URL || !validateWebhookUrl(process.env.WEBHOOK_URL)) {
    console.warn("WARNING: Invalid or missing WEBHOOK_URL in .env file.");
  } else {
    console.log("Webhook URL configured:", process.env.WEBHOOK_URL);
  }
});