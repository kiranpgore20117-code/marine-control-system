const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Persistent Memory Ledger Object
let cloudLedger = {
    "1": { vessel_id: 1, seq_num: 0, severity: "SAFE", telemetry: { lat: 13.0827, lon: 80.2707, water: 0, tilt: 0.0 } },
    "2": { vessel_id: 2, seq_num: 0, severity: "SAFE", telemetry: { lat: 13.0911, lon: 80.2822, water: 0, tilt: 0.0 } }
};

// HTTP REST POST endpoint targeted by your automated local Python/GSM telemetry bridge scripts
app.post('/update', (req, res) => {
    const incomingData = req.body;
    
    if (!incomingData) {
        return res.status(400).json({ status: "ERROR", message: "Empty payload received." });
    }

    // Pattern A: Multi-Node Radio Matrix payload
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
        return res.status(200).json({ status: "SUCCESS", context: "mesh_parsed" });
    }

    // Pattern B: Standalone packet mapped via explicit vessel_id
    const vId = incomingData.vessel_id;
    if (vId && cloudLedger[vId]) {
        cloudLedger[vId].telemetry.water = incomingData.water !== undefined ? incomingData.water : (incomingData.telemetry?.water || cloudLedger[vId].telemetry.water);
        cloudLedger[vId].telemetry.tilt = incomingData.tilt !== undefined ? incomingData.tilt : (incomingData.telemetry?.tilt || cloudLedger[vId].telemetry.tilt);
        cloudLedger[vId].telemetry.lat = incomingData.lat || incomingData.telemetry?.lat || cloudLedger[vId].telemetry.lat;
        cloudLedger[vId].telemetry.lon = incomingData.lon || incomingData.telemetry?.lon || cloudLedger[vId].telemetry.lon;
        cloudLedger[vId].severity = incomingData.severity || incomingData.global_severity || cloudLedger[vId].severity;
        
        console.log(`[GSM ROUTER] Processed Singleton packet for Vessel Node #0${vId}`);
        return res.status(200).json({ status: "SUCCESS" });
    }

    return res.status(400).json({ status: "ERROR", message: "Payload profile evaluation unresolvable." });
});

// UI polls this endpoint every 1 second to fetch the updated state ledger
app.get('/stream', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(200).json(cloudLedger);
});

// Fallback routing rule to serve the index.html page
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`\n🌍 [CLOUD BACKEND FUNCTION READY ON PORT ${PORT}]`);
});
