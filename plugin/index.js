const fs = require('fs');
const path = require('path');
const apiRoutes = require('./apiRoutes');
const recorder = require('./recorder');
const polarStore = require('./polarStore');
const WebSocket = require('ws');
const {
  isStableCourse,
  isStableTWD,
  passesVmgRatioFilter,
  passesAvgSpeedFilter,
  passesAvgTwaFilter,
  passesAvgTwsFilter
} = require('./filters');


let unsubscribes = [];
let state = null;
let onUpgradeListener = null;

module.exports = function (app) {
  const plugin = {
    id: 'polar-recorder',
    name: 'SignalK Polar Recorder',
    description: 'A SignalK plugin to record boat polars based on sailing performance',
    schema: require('../schema.json'),

    start(options) {

      app.debug("Plugin start() called with options:", options);

      let localSubscription = {
        context: 'vessels.self',
        subscribe: [{
          path: 'propulsion.*',
          period: 1000
        }]
      };

      state = {
        app,
        interval: null,
        polarData: {},
        recording: {},
        recordingActive: false,
        recordingMode: 'manual',
        propulsionInstances: [],
        polarDataFile: '',
        automaticRecordingFile: '',
        liveTWA: undefined,
        liveTWS: undefined,
        liveSTW: undefined,
        motoring: false,
        filePath: undefined,
        wss: undefined,
        connectedClients: undefined
      };

      let courseHistory = [];
      let stwHistory = [];
      let twaHistory = [];
      let twsHistory = [];
      let twdHistory = [];


      function changeRecordingStatus(status) {
        if (status != state.recordingActive) {
          state.recordingActive = status;
          state.notifyClients({ event: 'changeRecordStatus', status: status });
          if (status) {
            state.filePath = state.recordingMode === 'auto' ? state.automaticRecordingFile : state.polarDataFile;
            state.notifyClients({ event: 'polarUpdated', filePath: state.filePath });
          }
          app.debug(">>>>>>>>>>>>>>>>>>>> Recording", status);
        }
      }

      function evaluateRecordingConditions(validData) {
        if (state.motoring) {
          changeRecordingStatus(false);
          return;
        }

        if (state.recordingMode === 'auto' && validData) {
          changeRecordingStatus(true);
        } else {
          changeRecordingStatus(false);
        }
      }

      function getReadings(app, options, sampleInterval, twaHistory, twsHistory, stwHistory, courseHistory, twdHistory) {
        const now = Date.now();
        const maxAgeMs = sampleInterval * 5;

        const twaPath = app.getSelfPath(options.anglePath);
        const twa = twaPath?.timestamp && now - new Date(twaPath.timestamp).getTime() <= maxAgeMs
          ? twaPath.value
          : undefined;

        const twsPath = app.getSelfPath(options.speedPath);
        const tws = twsPath?.timestamp && now - new Date(twsPath.timestamp).getTime() <= maxAgeMs
          ? twsPath.value
          : undefined;

        const stwPath = app.getSelfPath('navigation.speedThroughWater');
        const stw = stwPath?.timestamp && now - new Date(stwPath.timestamp).getTime() <= maxAgeMs
          ? stwPath.value
          : undefined;

        const cogPath = app.getSelfPath('navigation.courseOverGroundTrue');
        const cog = cogPath?.timestamp && now - new Date(cogPath.timestamp).getTime() <= maxAgeMs
          ? cogPath.value
          : undefined;

        const twdPath = app.getSelfPath('environment.wind.directionTrue');
        const twd = twdPath?.timestamp && now - new Date(twdPath.timestamp).getTime() <= maxAgeMs
          ? twdPath.value
          : undefined;

        if (stw !== undefined) {
          const windowMs = options.avgSpeedTimeWindow * 1000;
          stwHistory.push({ time: now, value: stw });
          const filtered = stwHistory.filter(entry => entry.time >= now - windowMs);
          stwHistory.splice(0, stwHistory.length, ...filtered);
        }

        if (cog !== undefined) {
          const minAge = now - (options.minLenghtValidData * 1000);
          courseHistory.push({ time: now, value: cog });
          const filtered = courseHistory.filter(entry => entry.time >= minAge);
          courseHistory.splice(0, courseHistory.length, ...filtered);
        }

        if (twa !== undefined) {
          const windowMs = options.avgTwaTimeWindow * 1000;
          twaHistory.push({ time: now, value: twa });
          const filtered = twaHistory.filter(entry => entry.time >= now - windowMs);
          twaHistory.splice(0, twaHistory.length, ...filtered);
        }

        if (tws !== undefined) {
          const windowMs = options.avgTwsTimeWindow * 1000;
          twsHistory.push({ time: now, value: tws });
          const filtered = twsHistory.filter(entry => entry.time >= now - windowMs);
          twsHistory.splice(0, twsHistory.length, ...filtered);
        }

        if (twd !== undefined) {
          const windowMs = options.minStableTwdTime * 1000;
          twdHistory.push({ time: now, value: twd });
          const filtered = twdHistory.filter(entry => entry.time >= now - windowMs);
          twdHistory.splice(0, twdHistory.length, ...filtered);
        }

        return {
          twa,
          tws,
          stw,
          cog,
          twd,
          twaHistory,
          twsHistory,
          stwHistory,
          courseHistory,
          twdHistory
        };
      }



      state.wss = new WebSocket.Server({ noServer: true });
      state.connectedClients = new Set();

      state.notifyClients = function (message) {
        const payload = JSON.stringify(message);
        state.connectedClients.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
          }
        });
      };

      onUpgradeListener = (request, socket, head) => {
        if (request.url === '/plugins/polar-recorder/ws') {
          state.wss.handleUpgrade(request, socket, head, ws => {
            state.connectedClients.add(ws);

            const initMessages = [
              { event: 'changeMotoringStatus', engineOn: state.motoring },
              { event: 'changeRecordStatus', status: state.recordingActive },
              {
                event: 'updateLivePerformance',
                twa: state.liveTWA,
                tws: state.liveTWS,
                stw: state.liveSTW
              },
              { event: 'polarUpdated', filePath: state.filePath }
            ];

            initMessages.forEach(msg => {
              try {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify(msg));
                }
              } catch (err) {
                app.error("Error sending initial WS message:", err);
              }
            });

            ws.on('close', () => state.connectedClients.delete(ws));
          });
        }
      };

      app.server.on('upgrade', onUpgradeListener);

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

              evaluateRecordingConditions(true);

              state.notifyClients({ event: 'changeMotoringStatus', engineOn });
            }
          });
        }
      );

      app.debug("Polar Recorder plugin started");

      const sampleInterval = options.sampleInterval || 1000;
      const dataDir = app.getDataDirPath();
      const polarDataFile = path.join(dataDir, 'polar-data.json');
      const rawPath = options.automaticRecordingFile ?? 'auto-recording-polar.json';

      let automaticRecordingFile;
      if (path.isAbsolute(rawPath)) {
        // Si no termina en .json, lo añadimos
        automaticRecordingFile = rawPath.endsWith('.json') ? rawPath : `${rawPath}.json`;
      } else {
        automaticRecordingFile = path.join(dataDir, rawPath);
      }

      app.debug("Polar Recorder plugin data dir:", dataDir);

      const selfProp = app.getSelfPath('propulsion');
      const propulsionPaths = Object.keys(selfProp || {});

      state.polarData = polarStore.load(polarDataFile);
      state.polarDataFile = polarDataFile;
      state.automaticRecordingFile = automaticRecordingFile;
      state.propulsionInstances = propulsionPaths;


      if (options.automaticRecording) {
        state.recordingMode = 'auto';
        changeRecordingStatus(true);
      }

      state.interval = setInterval(() => {

        const readings = getReadings(app, options, sampleInterval, twaHistory, twsHistory, stwHistory, courseHistory, twdHistory);
        const { twa, tws, stw, cog, twd } = readings;



        //*********** Filters
        app.debug(`>>> Applying filters <<<`);

        const stableCourse = isStableCourse(app, courseHistory, options.sameCourseAngleOffset);
        const stableTwd = isStableTWD(app, twdHistory, options.sameTwdAngleOffset)
        const vmgOk = passesVmgRatioFilter(app, stw, twa, tws, state.polarData, options);
        const avgSpeedOk = passesAvgSpeedFilter(app, stw, stwHistory, options);
        const avgTwaFilterOk = passesAvgTwaFilter(app, twa, twaHistory, options);
        const avgTwsFilterOk = passesAvgTwsFilter(app, tws, twsHistory, options);


        // ********* Check if valid data
        const reasons = [];

        if (twa === undefined) reasons.push('twa undefined');
        if (tws === undefined) reasons.push('tws undefined');
        if (stw === undefined) reasons.push('stw undefined');
        if (cog === undefined) reasons.push('cog undefined');
        if (!stableCourse) reasons.push('unstable course');
        if (!stableTwd) reasons.push('unstable TWD');
        if (!vmgOk) reasons.push('VMG ratio filter failed');
        if (!avgSpeedOk) reasons.push('average speed filter failed');
        if (!avgTwaFilterOk) reasons.push('average TWA filter failed');
        if (!avgTwsFilterOk) reasons.push('average TWS filter failed');

        const validData = reasons.length === 0;

        if (!validData) {
          app.debug(`Invalid data due to: ${reasons.join(', ')}`);
        }

        app.debug(`>>> Valid data ${validData} <<<`);

        evaluateRecordingConditions(validData);

        if (validData) {
          state.liveTWA = twa ? twa * 180 / Math.PI : undefined;
          state.liveTWS = tws ? tws * 1.94384 : undefined;
          state.liveSTW = stw ? stw * 1.94384 : undefined;

          state.notifyClients({ event: 'updateLivePerformance', twa: state.liveTWA, tws: state.liveTWS, stw: state.liveSTW });

          if (!state.motoring && state.recordingActive) {
            state.filePath = state.recordingMode === 'auto' ? state.automaticRecordingFile : state.polarDataFile;
            const updated = recorder.update(state, state.filePath);
            if (updated) {
              state.notifyClients({ event: 'polarUpdated', filePath: state.filePath });
            }
          }
        }

      }, sampleInterval);

      apiRoutes(app, state);
    },

    stop() {
      unsubscribes.forEach(f => f());
      unsubscribes = [];

      if (state?.interval) {
        clearInterval(state.interval);
        state.interval = null;
        console.log(">>>>>>>>> Polar Recorder interval cleared <<<<<<<<<<<<<");
      }

      // Cerrar conexiones WebSocket activas
      if (state?.connectedClients) {
        state.connectedClients.forEach(ws => {
          try {
            if (ws.readyState === ws.OPEN) {
              ws.close();
            }
          } catch (err) {
            app.error("Error closing WS connection:", err);
          }
        });
        state.connectedClients.clear?.();
      }

      // Cerrar WebSocket server si está activo
      if (state?.wss) {
        try {
          state.wss.close();
          console.log(">>>>>>>>> WebSocket server closed <<<<<<<<<<<<<");
        } catch (err) {
          app.error("Error closing WebSocket server:", err);
        }
      }

      if (onUpgradeListener) {
        app.server.off('upgrade', onUpgradeListener);
        onUpgradeListener = null;
      }

      state = null;
      console.log("Polar Recorder plugin stopped");
    }

  };

  return plugin;
};
