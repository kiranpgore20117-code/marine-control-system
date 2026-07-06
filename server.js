const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global state tracking room memory ledger
let cloudLedger = {
    "1": { vessel_id: 1, seq_num: 0, severity: "SAFE", telemetry: { lat: 13.0827, lon: 80.2707, water: 0, tilt: 0.0 } },
    "2": { vessel_id: 2, seq_num: 0, severity: "SAFE", telemetry: { lat: 13.0911, lon: 80.2822, water: 0, tilt: 0.0 } }
};

// Broadcast unified snapshot states to UI interfaces
function broadcastStateUpdate(payload) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
        }
    });
}

wss.on('connection', (ws) => {
    console.log('[CLOUD LOG] UI Control Room synced over WebSockets.');
    // Provide initial system mapping footprint right away on link connection
    ws.send(JSON.stringify({ bootstrap: true, ledger: cloudLedger }));
});

// HTTP REST endpoint targeted by your automated local Python/GSM telemetry bridge scripts
app.post('/update', (req, res) => {
    const incomingData = req.body;
    
    // Pattern A: If it's a unified radio mesh payload packet containing nested nodes
    if (incomingData.telemetry || incomingData.vessel1) {
        if (incomingData.telemetry) {
            cloudLedger["2"].telemetry = { ...cloudLedger["2"].telemetry, ...incomingData.telemetry };
            cloudLedger["2"].severity = incomingData.telemetry.severity || incomingData.global_severity || cloudLedger["2"].severity;
        }
        if (incomingData.vessel1) {
            cloudLedger["1"].telemetry = { ...cloudLedger["1"].telemetry, ...incomingData.vessel1 };
            cloudLedger["1"].severity = incomingData.vessel1.severity || cloudLedger["1"].severity;
        }
        console.log(`[GSM ROUTER] Processed Multi-Node Radio Matrix.`);
        broadcastStateUpdate({ direct_mesh: true, data: incomingData });
        return res.status(200).json({ status: "SUCCESS", context: "mesh_parsed" });
    }

    // Pattern B: Normalized standalone direct schema array frame (mapped via explicit vessel identity)
    const vId = incomingData.vessel_id;
    if (vId && cloudLedger[vId]) {
        cloudLedger[vId].telemetry.water = incomingData.water !== undefined ? incomingData.water : (incomingData.telemetry?.water || cloudLedger[vId].telemetry.water);
        cloudLedger[vId].telemetry.tilt = incomingData.tilt !== undefined ? incomingData.tilt : (incomingData.telemetry?.tilt || cloudLedger[vId].telemetry.tilt);
        cloudLedger[vId].telemetry.lat = incomingData.lat || incomingData.telemetry?.lat || cloudLedger[vId].telemetry.lat;
        cloudLedger[vId].telemetry.lon = incomingData.lon || incomingData.telemetry?.lon || cloudLedger[vId].telemetry.lon;
        cloudLedger[vId].severity = incomingData.severity || incomingData.global_severity || cloudLedger[vId].severity;
        
        console.log(`[GSM ROUTER] Processed Singleton packet for Vessel Node #0${vId}`);
        broadcastStateUpdate({ single_node: true, targetId: vId, data: cloudLedger[vId] });
        return res.status(200).json({ status: "SUCCESS" });
    }

    return res.status(400).json({ status: "ERROR", message: "Payload profile evaluation unresolvable." });
});

app.get('/stream', (req, res) => {
    return res.status(200).json(Object.values(cloudLedger));
});

// Fallback routing rule
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`\n🌍 [DEDICATED CORE BACKEND SERVICE STANDING BY ON PORT ${PORT}]`);
});
