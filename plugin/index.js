const fs = require('fs');
const path = require('path');
const apiRoutes = require('./apiRoutes');
const recorder = require('./recorder');
const polarStore = require('./polarStore');
const WebSocket = require('ws');

let unsubscribes = [];

module.exports = function (app) {
  const plugin = {
    id: 'polar-recorder',
    name: 'SignalK Polar Recorder',
    description: 'A SignalK plugin to record boat polars based on sailing performance',
    schema: require('../schema.json'),

    start(options) {

      function changeRecordingStatus(status) {
        state.recordingActive = status;
        state.notifyClients({ event: 'changeRecordStatus', status: status });
        app.debug(">>>>>>>>>> Recording", status);
      }

      let localSubscription = {
        context: 'vessels.self',
        subscribe: [{
          path: 'propulsion.*',
          period: 1000
        }]
      };

      const state = {
        app,
        polarData: {},
        recording: {},
        recordingActive: false,
        recordingMode: 'manual',
        propulsionInstances: [],
        polarDataFile: '',
        automaticRecordingFile: '',
        recordingsDir: '',
        liveTWA: undefined,
        liveTWS: undefined,
        liveSTW: undefined,
        motoring: false
      };

      const wss = new WebSocket.Server({ noServer: true });
      const connectedClients = new Set();

      state.notifyClients = function (message) {
        const payload = JSON.stringify(message);
        connectedClients.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
          }
        });
      };

      app.server.on('upgrade', (request, socket, head) => {
        if (request.url === '/plugins/polar-recorder/ws') {
          wss.handleUpgrade(request, socket, head, ws => {
            connectedClients.add(ws);
            ws.on('close', () => connectedClients.delete(ws));
          });
        }
      });


      app.subscriptionmanager.subscribe(
        localSubscription,
        unsubscribes,
        subscriptionError => {
          app.error('Error:' + subscriptionError);
        },
        delta => {
          delta.updates.forEach(() => {
            const selfProp = app.getSelfPath('propulsion');
            const instances = Object.keys(selfProp || {});

            let engineOn = instances.some(name => {
              const stateVal = app.getSelfPath(`propulsion.${name}.state`)?.value;
              const rev = app.getSelfPath(`propulsion.${name}.revolutions`)?.value;
              return stateVal !== 'stopped' || (typeof rev === 'number' && rev > 0);
            });

            if (engineOn !== state.motoring) {
              state.motoring = engineOn;
              app.debug(`Motoring: ${state.motoring}`);

              if (state.motoring) {
                if (state.recordingActive) {
                  changeRecordingStatus(false);
                }
              }
              else {
                if (!state.recordingActive && state.recordingMode === 'auto') {
                  changeRecordingStatus(true);
                }
              }


              state.notifyClients({ event: 'changeMotoringStatus', engineOn });
            }
          });
        }
      );

      app.debug("Polar Recorder plugin started");

      const sampleInterval = options.sampleInterval || 1000;
      const dataDir = app.getDataDirPath();
      const polarDataFile = path.join(dataDir, 'polar-data.json');
      const automaticRecordingFile = path.join(dataDir, options.automaticRecordingFile ?? 'auto-recording-polar.json');
      const recordingsDir = path.join(dataDir, 'polar-recordings');

      app.debug("Polar Recorder plugin data dir:", dataDir);

      const selfProp = app.getSelfPath('propulsion');
      const propulsionPaths = Object.keys(selfProp || {});

      state.polarData = polarStore.load(polarDataFile);
      state.polarDataFile = polarDataFile;
      state.automaticRecordingFile = automaticRecordingFile;
      state.recordingsDir = recordingsDir;
      state.propulsionInstances = propulsionPaths;

      if (options.automaticRecording) {
        state.recordingMode = 'auto';
        changeRecordingStatus(true);
      }

      state.interval = setInterval(() => {
        const maxAgeMs = (sampleInterval || 1000) * 10;

        const twaPath = app.getSelfPath('environment.wind.angleTrueGround');
        const twa = twaPath?.timestamp && Date.now() - new Date(twaPath.timestamp).getTime() <= maxAgeMs
          ? twaPath.value
          : undefined;

        const twsPath = app.getSelfPath('environment.wind.speedOverGround');
        const tws = twsPath?.timestamp && Date.now() - new Date(twsPath.timestamp).getTime() <= maxAgeMs
          ? twsPath.value
          : undefined;

        const stwPath = app.getSelfPath('navigation.speedThroughWater');
        const stw = stwPath?.timestamp && Date.now() - new Date(stwPath.timestamp).getTime() <= maxAgeMs
          ? stwPath.value
          : undefined;


        var validData = twa !== undefined && tws !== undefined && stw !== undefined;


        if (validData) {

          if (!state.recordingActive) {
            changeRecordingStatus(true);
          }

          state.liveTWA = twa ? twa * 180 / Math.PI : undefined;
          state.liveTWS = tws ? tws * 1.94384 : undefined;
          state.liveSTW = stw ? stw * 1.94384 : undefined;

          state.notifyClients({ event: 'updateLivePerformance', twa: state.liveTWA, tws: state.liveTWS, stw: state.liveSTW });

          if (!state.motoring && state.recordingActive) {
            const filePath = state.recordingMode === 'auto' ? state.automaticRecordingFile : state.polarDataFile;
            const updated = recorder.update(state, filePath);
            if (updated) {
              state.notifyClients({ event: 'polarUpdated', filePath });
            }
          }
        }
        else if (state.recordingActive) {
          changeRecordingStatus(false);
        }

      }, sampleInterval);

      apiRoutes(app, state);
    },

    stop() {
      unsubscribes.forEach(f => f());
      unsubscribes = [];
      console.log("Polar Recorder plugin stopped");
    }
  };

  return plugin;
};
