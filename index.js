const axios = require('axios');
const moment = require('moment');

// URL endpoint
const url = 'https://api.service.gameeapp.com/';

// Query ID dari Telegram (pastikan ini selalu diperbarui dengan yang terbaru)
let query = '';

// Headers tanpa otorisasi (saat mendapatkan token awal)
const getInitialHeaders = () => ({
   Accept: 'application/json',
   'Content-Type': 'application/json',
   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, seperti Gecko) Chrome/125.0.0.0 Safari/537.36',
   'Client-Language': 'en',
   'X-Install-Uuid': '01aae82e-8e65-4200-a370-e8460059bb9c',
});

// Headers dengan otorisasi (saat token sudah tersedia)
const getHeaders = (token) => ({
   Accept: 'application/json',
   'Content-Type': 'application/json',
   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, seperti Gecko) Chrome/125.0.0.0 Safari/537.36',
   Authorization: `Bearer ${token}`,
   'Client-Language': 'en',
   'X-Install-Uuid': '01aae82e-8e65-4200-a370-e8460059bb9c',
});

// Payload untuk memulai sesi penambangan
const startMiningPayload = {
   jsonrpc: '2.0',
   id: 'miningEvent.startSession',
   method: 'miningEvent.startSession',
   params: {
      miningEventId: 5,
   },
};

// Payload untuk memeriksa status penambangan
const getStatusPayload = {
   jsonrpc: '2.0',
   id: 'miningEvent.getAll',
   method: 'miningEvent.getAll',
   params: {
      pagination: {
         offset: 0,
         limit: 10,
      },
   },
};

let token = '';
let refreshToken = '';
let miningInterval;

// Fungsi untuk mendapatkan token baru menggunakan query_id
async function getToken(query) {
   try {
      const requestData = {
         jsonrpc: '2.0',
         id: 'user.authentication.loginUsingTelegram',
         method: 'user.authentication.loginUsingTelegram',
         params: {
            initData: query,
         },
      };

      console.log('Request Data:', JSON.stringify(requestData, null, 2));

      const response = await axios.post(url, requestData, { headers: getInitialHeaders() });

      console.log('Response Data:', JSON.stringify(response.data, null, 2));

      if (response.data && response.data.result && response.data.result.tokens) {
         token = response.data.result.tokens.authenticate;
         refreshToken = response.data.result.tokens.refresh;
         console.log(`[ ${moment().format('HH:mm:ss')} ] Token obtained successfully: ${token}`);
      } else {
         console.error(`[ ${moment().format('HH:mm:ss')} ] Failed to obtain token.`);
         console.log(response.data);
      }
   } catch (error) {
      console.error(`[ ${moment().format('HH:mm:ss')} ] Error obtaining token:`, error.message);
      if (error.response) {
         console.error('Error response data:', error.response.data);
      }
   }
}

// Fungsi untuk memulai sesi penambangan
async function startMining() {
   console.log(`[ ${moment().format('HH:mm:ss')} ] Using token: ${token}`); // Log the token being used
   axios
      .post(url, startMiningPayload, { headers: getHeaders(token) })
      .then((response) => {
         if (response.data && response.data.result && response.data.result.miningEvent) {
            const { miningEvent } = response.data.result;
            const { currentSpeedMicroToken, currentSessionMicroToken, currentSessionMicroTokenMined, miningSessionEnded } = miningEvent.miningUser;

            if (miningSessionEnded) {
               console.log(`[ ${moment().format('HH:mm:ss')} ] Mining session ended. Starting a new session...`);
               clearInterval(miningInterval); // Clear the interval when the session ends
               startMining();
            } else {
               const maxCapacityMicroToken = currentSessionMicroToken;

               const logMessage = `[ ${moment().format(
                  'HH:mm:ss'
               )} ] Mining session started. Current session micro tokens mined: ${currentSessionMicroTokenMined}, Speed: ${currentSpeedMicroToken}/hour, Capacity: ${currentSessionMicroToken}`;
               console.log(logMessage);

               // Check the mining status every 5 seconds
               miningInterval = setInterval(() => {
                  checkMiningStatus(maxCapacityMicroToken);
               }, 5000);
            }
         } else if (response.data && response.data.error && response.data.error.code === 1082) {
            console.log(`[ ${moment().format('HH:mm:ss')} ] Mining session already in progress. Checking status again...`);
            startCheckingMiningStatus();
         } else {
            console.error(`[ ${moment().format('HH:mm:ss')} ] Unexpected response structure:`, response.data);

            // Cek apakah kesalahan karena token kadaluarsa
            if (response.data.error && response.data.error.message === 'Unauthorized' && response.data.error.data && response.data.error.data.reason === 'Your token already expired, please refresh your token.') {
               console.log(`[ ${moment().format('HH:mm:ss')} ] Token expired. Refreshing token...`);
               getToken(query).then(() => {
                  startMining();
               });
            } else {
               // Retry after a delay (e.g., 1 minute)
               setTimeout(startMining, 60000);
            }
         }
      })
      .catch((error) => {
         console.error(`[ ${moment().format('HH:mm:ss')} ] Error:`, error.message);
         if (error.response) {
            console.error('Error response data:', error.response.data);
         }
         // Retry after a delay (e.g., 1 minute)
         setTimeout(startMining, 60000);
      });
}

// Fungsi untuk memeriksa status penambangan
async function checkMiningStatus(maxCapacityMicroToken) {
   try {
      const response = await axios.post(url, getStatusPayload, { headers: getHeaders(token) });

      if (response.data && response.data.result && response.data.result.miningEvents) {
         const miningEvent = response.data.result.miningEvents.find((event) => event.id === 5);

         if (miningEvent) {
            const { currentSessionMicroTokenMined, miningSessionEnded, currentSessionMicroToken } = miningEvent.miningUser;

            console.log(`[ ${moment().format('HH:mm:ss')} ] Tokens mined so far: ${currentSessionMicroTokenMined}`);

            if (miningSessionEnded || currentSessionMicroTokenMined >= currentSessionMicroToken) {
               console.log(`[ ${moment().format('HH:mm:ss')} ] Capacity reached or session ended. Starting a new session...`);
               clearInterval(miningInterval); // Clear the interval when capacity is reached
               startMining(); // Start a new mining session
            }
         } else {
            console.error(`[ ${moment().format('HH:mm:ss')} ] Mining event not found.`);
         }
      } else {
         console.error(`[ ${moment().format('HH:mm:ss')} ] Unexpected response structure:`, response.data);

         // Cek apakah kesalahan karena token kadaluarsa
         if (response.data.error && response.data.error.message === 'Unauthorized' && response.data.error.data && response.data.error.data.reason === 'Your token already expired, please refresh your token.') {
            console.log(`[ ${moment().format('HH:mm:ss')} ] Token expired. Refreshing token...`);
            await getToken(query);
            checkMiningStatus(maxCapacityMicroToken);
         } else {
            // Retry after a delay (e.g., 1 minute)
            setTimeout(() => checkMiningStatus(maxCapacityMicroToken), 60000);
         }
      }
   } catch (error) {
      console.error(`[ ${moment().format('HH:mm:ss')} ] Error:`, error.message);
      if (error.response) {
         console.error('Error response data:', error.response.data);
      }
   }
}

// Fungsi untuk memulai pengecekan status penambangan jika sesi sudah dimulai
async function startCheckingMiningStatus() {
   try {
      const response = await axios.post(url, getStatusPayload, { headers: getHeaders(token) });

      if (response.data && response.data.result && response.data.result.miningEvents) {
         const miningEvent = response.data.result.miningEvents.find((event) => event.id === 5);

         if (miningEvent) {
            const { currentSpeedMicroToken, currentSessionMicroToken, currentSessionMicroTokenMined } = miningEvent.miningUser;
            const maxCapacityMicroToken = currentSessionMicroToken;

            const logMessage = `[ ${moment().format(
               'HH:mm:ss'
            )} ] Monitoring mining session. Current session micro tokens mined: ${currentSessionMicroTokenMined}, Speed: ${currentSpeedMicroToken}/hour, Capacity: ${currentSessionMicroToken}`;
            console.log(logMessage);

            // Check the mining status every 5 seconds
            miningInterval = setInterval(() => {
               checkMiningStatus(maxCapacityMicroToken);
            }, 5000);
         } else {
            console.error(`[ ${moment().format('HH:mm:ss')} ] Mining event not found.`);
         }
      } else {
         console.error(`[ ${moment().format('HH:mm:ss')} ] Unexpected response structure:`, response.data);

         // Cek apakah kesalahan karena token kadaluarsa
         if (response.data.error && response.data.error.message === 'Unauthorized' && response.data.error.data && response.data.error.data.reason === 'Your token already expired, please refresh your token.') {
            console.log(`[ ${moment().format('HH:mm:ss')} ] Token expired. Refreshing token...`);
            await getToken(query);
            startCheckingMiningStatus();
         } else {
            // Retry after a delay (e.g., 1 minute)
            setTimeout(startCheckingMiningStatus, 60000);
         }
      }
   } catch (error) {
      console.error(`[ ${moment().format('HH:mm:ss')} ] Error:`, error.message);
      if (error.response) {
         console.error('Error response data:', error.response.data);
      }
      // Retry after a delay (e.g., 1 minute)
      setTimeout(startCheckingMiningStatus, 60000);
   }
}

// Start the process by obtaining the initial token
(async () => {
   await getToken(query);
   if (token) {
      startMining();
   } else {
      console.error('Failed to start mining due to invalid token.');
   }
})();
