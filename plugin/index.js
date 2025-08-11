const fs = require('fs');
const path = require('path');
const apiRoutes = require('./apiRoutes');
const recorder = require('./recorder');
const polarStore = require('./polarStore');
const WebSocket = require('ws');
const {
  isStableCourse,
  isStableHdg,
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
    uiSchema: require('../uiSchema.js'),

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
      let headingHistory = [];
      let stwHistory = [];
      let twaHistory = [];
      let twsHistory = [];
      let twdHistory = [];


      function changeRecordingStatus(status) {
        if (status != state.recordingActive) {
          state.recordingActive = status;
          state.notifyClients({ event: 'changeRecordStatus', status: status, mode: state.recordingMode });
          if (status) {
            state.filePath = state.recordingMode === 'auto' ? state.automaticRecordingFile : state.polarDataFile;
            //state.notifyClients({ event: 'polarUpdated', filePath: state.filePath });
          }
          app.debug(">>>>>>>>>>>>>>>>>>>> Recording", status);
        }
      }

      function evaluateRecordingConditions(validData) {
        if (state.motoring) {
          changeRecordingStatus(false);
          return;
        }

        if (validData) {
          if (state.recordingMode === 'auto') {
            changeRecordingStatus(true);
            return;
          }
          if (state.recordingMode === 'manual' && state.recordingActive) {
            changeRecordingStatus(true);
            return;
          }
        }
        else {
          changeRecordingStatus(false);
          return;
        }
      }


      function getValidValue(pathObj, expectedSource, now, maxAgeMs) {
        //app.debug(`Get valid data with: pathObj: : ${JSON.stringify(pathObj)}; expectedSource: ${expectedSource}; now: ${now}; maxAgeMS: ${maxAgeMs}`);
        if (!pathObj) return undefined;

        if (!expectedSource) {
          const ts = new Date(pathObj.timestamp).getTime();
          return now - ts <= maxAgeMs ? pathObj.value : undefined;
        }

        // Buscar en .values[expectedSource]
        const entry = pathObj.values?.[expectedSource];
        if (entry) {
          const ts = new Date(entry.timestamp).getTime();
          return now - ts <= maxAgeMs ? entry.value : undefined;
        }

        // Si no está en .values, comprobar si el source principal coincide
        const mainSource = pathObj.$source?.replace(/^\$/, '');
        if (mainSource === expectedSource) {
          const ts = new Date(pathObj.timestamp).getTime();
          return now - ts <= maxAgeMs ? pathObj.value : undefined;
        }

        // No hay valor válido del source esperado
        return undefined;
      }



      function getReadings(app, options, sampleInterval, twaHistory, twsHistory, stwHistory, courseHistory, headingHistory, twdHistory) {
        const now = Date.now();
        const maxAgeMs = sampleInterval * 5;

        const twaPath = app.getSelfPath(options.pathSources.anglePath);
        const twa = getValidValue(twaPath, options.pathSources.angleSource, now, maxAgeMs);

        const twsPath = app.getSelfPath(options.pathSources.speedPath);
        const tws = getValidValue(twsPath, options.pathSources.speedSource, now, maxAgeMs);

        const twdPath = app.getSelfPath('environment.wind.directionTrue');
        const twd = getValidValue(twdPath, options.pathSources.twdSource, now, maxAgeMs);

        const stwPath = app.getSelfPath('navigation.speedThroughWater');
        const stw = getValidValue(stwPath, options.pathSources.stwSource, now, maxAgeMs);

        const cogPath = app.getSelfPath('navigation.courseOverGroundTrue');
        const cog = getValidValue(cogPath, options.pathSources.cogSource, now, maxAgeMs);

        const hdgPath = app.getSelfPath('navigation.headingTrue');
        const hdg = getValidValue(hdgPath, options.pathSources.hdgSource, now, maxAgeMs);


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

        if (hdg !== undefined) {
          const minAge = now - (options.minLenghtValidData * 1000);
          headingHistory.push({ time: now, value: hdg });
          const filtered = headingHistory.filter(entry => entry.time >= minAge);
          headingHistory.splice(0, headingHistory.length, ...filtered);
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
          headingHistory,
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
              { event: 'changeRecordStatus', status: state.recordingActive, mode: state.recordingMode },
              {
                event: 'updateLivePerformance',
                twa: state.liveTWA,
                tws: state.liveTWS,
                stw: state.liveSTW
              },
              { event: 'setMode', mode: state.recordingMode, filePath: state.filePath }
              //,
              // { event: 'polarUpdated', filePath: state.filePath }
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

            let engineOn;

            if (options.motoringFilter.useAutostate ?? true) {
              // ✅ Comportamiento actual
              engineOn = instances.some(name => {
                const stateVal = app.getSelfPath(`propulsion.${name}.state`)?.value;
                const rev = app.getSelfPath(`propulsion.${name}.revolutions`)?.value;
                return stateVal !== 'stopped' || (typeof rev === 'number' && rev > 0);
              });
            } else {
              // ⚙️ Evaluación alternativa basada solo en revoluciones
              const maxRev = options.motoringFilter.maxRevForEngine ?? 0;
              const maxRevHz = maxRev / 60;
              engineOn = instances.some(name => {
                const rev = app.getSelfPath(`propulsion.${name}.revolutions`)?.value;
                return typeof rev === 'number' && rev > maxRevHz;
              });
            }

            //app.debug(`Engine ON=${engineOn} (maxRevsForEngine=${options.motoringFilter.maxRevForEngine}) (useAutoState=${options.motoringFilter.useAutostate})`);

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

        const readings = getReadings(app, options, sampleInterval, twaHistory, twsHistory, stwHistory, courseHistory, headingHistory, twdHistory);
        const { twa, tws, stw, cog, twd } = readings;

        //*********** Filters
        app.debug(`>>> Applying filters <<<`);

        const stableCourse = isStableCourse(app, courseHistory, options);
        const stableHdg = isStableHdg(app, headingHistory, options);
        const stableTwd = isStableTWD(app, twdHistory, options);

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
        if (twd === undefined) reasons.push('twd undefined');
        if (!stableCourse) reasons.push('unstable course');
        if (!stableHdg) reasons.push('unstable heading');
        if (!stableTwd) reasons.push('unstable TWD');
        if (!vmgOk) reasons.push('VMG ratio filter failed');
        if (!avgSpeedOk) reasons.push('average speed filter failed');
        if (!avgTwaFilterOk) reasons.push('average TWA filter failed');
        if (!avgTwsFilterOk) reasons.push('average TWS filter failed');

        const stwKt = stw * 1.94384;
        if (stwKt < options.minSpeedToConsiderBoatMoving) reasons.push('STW too low');


        const validData = reasons.length === 0;

        if (!validData) {
          app.debug(`Invalid data due to: ${reasons.join(', ')}`);
          state.notifyClients({ event: 'recordErrors', errors: reasons });
          return;
        }

        app.debug(`>>> Valid data ${validData} <<<`);

        evaluateRecordingConditions(validData, stw);

        if (validData) {
          state.liveTWA = twa ? twa * 180 / Math.PI : undefined;
          state.liveTWS = tws ? tws * 1.94384 : undefined;
          state.liveSTW = stw ? stw * 1.94384 : undefined;

          state.notifyClients({ event: 'recordErrors', errors: null });
          state.notifyClients({ event: 'updateLivePerformance', twa: state.liveTWA, tws: state.liveTWS, stw: state.liveSTW });

          app.debug(`Recording active: ${state.recordingActive} - Mode: ${state.recordingMode}`);
          if (!state.motoring && state.recordingActive) {
            state.notifyClients({ event: 'changeRecordStatus', status: state.recordingActive, mode: state.recordingMode });
            app.debug('>>> Should update <<<');
            state.filePath = state.recordingMode === 'auto' ? state.automaticRecordingFile : state.polarDataFile;
            const res = recorder.update(state, state.filePath); // ⬅️ ahora devuelve objeto
            if (res && res.updated) {
              state.notifyClients({
                event: 'polarUpdated',
                filePath: state.filePath,
                lastPoint: res.lastPoint,   // {twa,tws,stw,timestamp}
                live: res.live,             // opcional: {twa,tws,stw} (valores en vivo)
                previous: res.previous      // opcional: {stw,timestamp} si había un punto previo
              });
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
