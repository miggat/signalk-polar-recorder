const fs = require('fs');
const path = require('path');
const apiRoutes = require('./apiRoutes');
const recorder = require('./recorder');
const polarStore = require('./polarStore');
const WebSocket = require('ws');

let unsubscribes = [];
let state = null;  

module.exports = function (app) {
  const plugin = {
    id: 'polar-recorder',
    name: 'SignalK Polar Recorder',
    description: 'A SignalK plugin to record boat polars based on sailing performance',
    schema: require('../schema.json'),

    start(options) {

      app.debug("Plugin start() called with options:", options);

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
        filePath: undefined
      };

      let courseHistory = [];
      let stwHistory = [];


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

            // Enviar estado inicial al cliente recién conectado
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
      const automaticRecordingFile = path.join(dataDir, options.automaticRecordingFile ?? 'auto-recording-polar.json');


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
        const maxAgeMs = (sampleInterval || 1000) * 5;

        const twaPath = app.getSelfPath(options.anglePath);
        const twa = twaPath?.timestamp && Date.now() - new Date(twaPath.timestamp).getTime() <= maxAgeMs
          ? twaPath.value
          : undefined;

        const twsPath = app.getSelfPath(options.speedPath);
        const tws = twsPath?.timestamp && Date.now() - new Date(twsPath.timestamp).getTime() <= maxAgeMs
          ? twsPath.value
          : undefined;

        const stwPath = app.getSelfPath('navigation.speedThroughWater');
        const stw = stwPath?.timestamp && Date.now() - new Date(stwPath.timestamp).getTime() <= maxAgeMs
          ? stwPath.value
          : undefined;

        const cogPath = app.getSelfPath('navigation.courseOverGroundTrue');
        const cog = cogPath?.timestamp && Date.now() - new Date(cogPath.timestamp).getTime() <= maxAgeMs
          ? cogPath.value
          : undefined;

        const vmgPath = app.getSelfPath(options.vmgPath);
        const vmg = vmgPath?.timestamp && Date.now() - new Date(vmgPath.timestamp).getTime() <= maxAgeMs
          ? vmgPath.value
          : undefined;

        // app.debug(`Raw path values:
        //   TWA [${options.anglePath}]: ${twa}
        //   TWS [${options.speedPath}]: ${tws}
        //   STW [navigation.speedThroughWater]: ${stw}
        //   COG [navigation.courseOverGroundTrue]: ${cog}
        // `);

        if (stw !== undefined) {
          const now = Date.now();
          stwHistory.push({ time: now, value: stw });

          // Elimina valores antiguos fuera de la ventana de tiempo
          const windowMs = options.avgSpeedTimeWindow * 1000;
          stwHistory = stwHistory.filter(entry => entry.time >= now - windowMs);
        }


        if (cog !== undefined) {
          const now = Date.now();
          courseHistory.push({ time: now, angle: cog });

          // Remove entries older than minLenghtValidData seconds
          const minAge = now - (options.minLenghtValidData * 1000);
          courseHistory = courseHistory.filter(entry => entry.time >= minAge);
        }

        let stableCourse = false;

        if (courseHistory.length > 0) {
          const angles = courseHistory.map(e => e.angle);
          const reference = angles[0];
          const maxDelta = Math.max(...angles.map(a => Math.abs(a - reference)));

          stableCourse = maxDelta <= options.sameCourseAngleOffset;
        }

        app.debug("Stable course", stableCourse);

        // ********* VMG FILTER
        let stwToVmgRatio = null;

        if (stw !== undefined && vmg !== undefined) {
          if (vmg < 0 && stw > 0) {
            stwToVmgRatio = 1000;
          } else if (Math.abs(vmg) > 0.01) {
            stwToVmgRatio = (stw / vmg);
          }
        }

        app.debug('VMG path', options.vmgPath);

        app.debug(`STW=${stw} - VMG=${vmg} || Ratio=${stwToVmgRatio}`);

        const passesVmgFilter = !options.useVmgThreshold ||
          (stwToVmgRatio !== null &&
            stwToVmgRatio < options.vmgRatioThresholdUp &&
            stwToVmgRatio > options.vmgRatioThresholdDown);


        // *********** Time window filter
        let stwAvgRatio = null;

        if (options.useAvgSpeedThreshold && stw !== undefined && stwHistory.length > 0) {
          const avg = stwHistory.reduce((sum, e) => sum + e.value, 0) / stwHistory.length;
          if (avg > 0.01) {
            stwAvgRatio = stw / avg;
          }
        }

        const passesAvgSpeedFilter = !options.useAvgSpeedThreshold ||
          (stwAvgRatio !== null &&
            stwAvgRatio < options.avgSpeedThresholdUp &&
            stwAvgRatio > options.avgSpeedThresholdDown);

        if (options.useAvgSpeedThreshold) {
          app.debug(`STW=${stw} | AVG=${(stwHistory.map(e => e.value).reduce((a, b) => a + b, 0) / stwHistory.length).toFixed(2)} | Ratio=${stwAvgRatio}`);
        }


        // ********* Check if valid data
        const validData =
          twa !== undefined &&
          tws !== undefined &&
          stw !== undefined &&
          cog !== undefined &&
          stableCourse &&
          passesVmgFilter &&
          passesAvgSpeedFilter;



        app.debug("Valid data", validData);

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

      if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
        console.log(">>>>>>>>> Polar Recorder interval cleared <<<<<<<<<<<<<");
      }

      console.log("Polar Recorder plugin stopped");
    }
  };

  return plugin;
};
