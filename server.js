import express from "express";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;
const app = express();
app.use(express.json());

let isReady = false;
let lastQR = null;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--no-first-run","--no-zygote","--single-process","--disable-gpu"],
  },
});

client.on("qr", (qr) => {
  lastQR = qr;
  console.log("QR CODE READY");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  isReady = true;
  lastQR = null;
  console.log("WhatsApp Connected!");
});

client.on("disconnected", () => { isReady = false; });
client.initialize();

app.get("/qr", (req, res) => {
  if (isReady) return res.send("<h1>✅ WhatsApp is connected!</h1>");
  if (!lastQR) return res.send("<h1>⏳ Not ready yet... wait 30 seconds and refresh</h1>");
  res.send(`
    <h2>📱 Scan this QR with WhatsApp</h2>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}" />
    <br><br>
    <p>1. Open WhatsApp Business on phone</p>
    <p>2. Tap 3 dots → Linked Devices → Link a Device</p>
    <p>3. Scan the QR above</p>
    <br>
    <a href="/qr">🔄 Refresh page</a>
  `);
});

app.get("/status", (req, res) => {
  res.json({ connected: isReady });
});

app.post("/send", async (req, res) => {
  const { to, message } = req.body;
  if (!isReady) return res.json({ success: false, error: "Not connected" });
  try {
    const phone = to.replace(/\D/g, "") + "@c.us";
    await client.sendMessage(phone, message);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.get("/chats", async (req, res) => {
  if (!isReady) return res.json({ error: "Not connected" });
  const chats = await client.getChats();
  res.json(chats.slice(0,20).map(c => ({
    name: c.name,
    id: c.id._serialized,
    last: c.lastMessage?.body
  })));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
