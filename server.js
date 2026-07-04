const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ESP32_COM_PORT = 'COM3'; 
const BAUD_RATE = 115200;

let cloudLedger = {
    "1": { vessel_id: 1, seq_num: 0, severity: "SAFE", risk_score: 0.0, telemetry: { lat: 13.0827, lon: 80.2707, water: 0, tilt: 0.0 } },
    "2": { vessel_id: 2, seq_num: 0, severity: "SAFE", risk_score: 0.0, telemetry: { lat: 13.0911, lon: 80.2822, water: 0, tilt: 0.0 } }
};

wss.on('connection', (ws) => {
    console.log('[LOCAL CLOUD] Web UI Mission Control dashboard connected.');
    ws.send(JSON.stringify({ type: 'SNAPSHOT', data: Object.values(cloudLedger) }));
});

function broadcastToDashboard(vesselData) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'UPDATE', data: vesselData }));
        }
    });
}

app.post('/update', (req, res) => {
    const data = req.body;
    const vId = data.vessel_id;
    if (vId && cloudLedger[vId]) {
        cloudLedger[vId] = { ...cloudLedger[vId], ...data };
        console.log(`[GSM CLOUD STREAM] Ingested packet for Node #0${vId}`);
        broadcastToDashboard(cloudLedger[vId]);
        return res.status(200).json({ status: "SUCCESS" });
    }
    return res.status(400).json({ status: "ERROR" });
});

app.get('/stream', (req, res) => {
    return res.status(200).json(Object.values(cloudLedger));
});

// 🔒 Added error catching so the server never crashes even if COM3 is missing!
function connectSerial() {
    try {
        const port = new SerialPort({ path: ESP32_COM_PORT, baudRate: BAUD_RATE });
        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        
        console.log(`[HARDWARE ENGINE] Listening to ESP32 on ${ESP32_COM_PORT}`);
        
        parser.on('data', (rawLine) => {
            try {
                const parsedArray = JSON.parse(rawLine.trim());
                if (Array.isArray(parsedArray)) {
                    parsedArray.forEach(vessel => {
                        const id = vessel.vessel_id;
                        if (cloudLedger[id]) {
                            cloudLedger[id] = vessel;
                            broadcastToDashboard(vessel);
                        }
                    });
                }
            } catch (err) {}
        });

        port.on('error', (err) => {
            console.log(`[SERIAL NOTICE] ESP32 not detected on ${ESP32_COM_PORT} yet.`);
        });
    } catch (e) {
        console.log(`[SERIAL NOTICE] Port initialization skipped.`);
    }
}
connectSerial();

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`\n🌍 [DEDICATED CLOUD BACKEND ACTIVE ON PORT 8080]`);
});