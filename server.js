import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import express from 'express'
import qrcode from 'qrcode'
import P from 'pino'

const app = express()
app.use(express.json())

let sock = null
let qrCodeData = null
let isConnected = false

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  
  sock = makeWASocket({
    logger: P({ level: 'silent' }),
    auth: state,
    printQRInTerminal: true
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      qrCodeData = qr
      isConnected = false
    }
    if (connection === 'close') {
      isConnected = false
      const code = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 0
      if (code !== DisconnectReason.loggedOut) connectToWhatsApp()
    } else if (connection === 'open') {
      isConnected = true
      qrCodeData = null
      console.log('✅ WhatsApp Connected!')
    }
  })

  sock.ev.on('creds.update', saveCreds)
}

connectToWhatsApp()

app.get('/qr', async (req, res) => {
  if (isConnected) return res.send('<h1>✅ WhatsApp is Connected! You can close this.</h1>')
  if (!qrCodeData) return res.send('<h1>⏳ Loading... please refresh in 10 seconds</h1><script>setTimeout(()=>location.reload(),5000)</script>')
  try {
    const qrImage = await qrcode.toDataURL(qrCodeData)
    res.send(`
      <html><body style="text-align:center;font-family:sans-serif;padding:20px">
      <h2>📱 Scan with WhatsApp</h2>
      <img src="${qrImage}" style="width:280px;height:280px"/>
      <p>1. Open <b>WhatsApp Business</b> on your phone</p>
      <p>2. Tap <b>3 dots → Linked Devices → Link a Device</b></p>
      <p>3. Scan the QR code above</p>
      <br><a href="/qr">🔄 Refresh</a>
      </body></html>
    `)
  } catch(e) {
    res.send('<h1>Error. Please refresh.</h1>')
  }
})

app.get('/status', (req, res) => {
  res.json({ connected: isConnected })
})

app.post('/send', async (req, res) => {
  if (!isConnected) return res.json({ success: false, error: 'WhatsApp not connected' })
  const { to, message } = req.body
  try {
    const phone = to.replace(/\D/g, '') + '@s.whatsapp.net'
    await sock.sendMessage(phone, { text: message })
    res.json({ success: true, message: 'Sent!' })
  } catch(e) {
    res.json({ success: false, error: e.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
