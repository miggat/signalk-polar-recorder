const fs = require('fs');
const path = require('path');
const apiRoutes = require('./apiRoutes');
const recorder = require('./recorder');
const polarStore = require('./polarStore');

let unsubscribes = [];

module.exports = function (app) {
  const plugin = {
    id: 'polar-recorder',
    name: 'SignalK Polar Recorder',
    description: 'A SignalK plugin to record boat polars based on sailing performance',
    schema: require('../schema.json'),

    start(options) {

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
        propulsionInstances: [],
        polarDataFile: '',
        recordingsDir: '',
        liveTWA: undefined,
        liveTWS: undefined,
        liveSTW: undefined,
        motoring: false
      };

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

            state.motoring = instances.some(name => {
              const stateVal = app.getSelfPath(`propulsion.${name}.state`)?.value;
              const rev = app.getSelfPath(`propulsion.${name}.revolutions`)?.value;
              return stateVal !== 'stopped' || (typeof rev === 'number' && rev > 0);
            });

            app.debug(`Motoring: ${state.motoring}`);
          });
        }
      );

      console.log("Polar Recorder plugin started");

      const sampleInterval = options.sampleInterval || 1000;
      const dataDir = app.getDataDirPath();
      const polarDataFile = path.join(dataDir, 'polar-data.json');
      const recordingsDir = path.join(dataDir, 'polar-recordings');

      console.log("Polar Recorder plugin data dir:", dataDir);

      const selfProp = app.getSelfPath('propulsion');
      const propulsionPaths = Object.keys(selfProp || {});

      state.polarData = polarStore.load(polarDataFile);
      state.polarDataFile = polarDataFile;
      state.recordingsDir = recordingsDir;
      state.propulsionInstances = propulsionPaths;

      if (options.importPolarData) {
        const result = polarStore.import(options.importPolarData, state);
        if (result.success) {
          console.log("Polar data successfully imported via settings.");
        } else {
          app.error("Polar data import failed:", result.message);
        }
      }

      state.interval = setInterval(() => {
        const twa = app.getSelfPath('environment.wind.angleTrueGround')?.value;
        const tws = app.getSelfPath('environment.wind.speedOverGround')?.value;
        const stw = app.getSelfPath('navigation.speedThroughWater')?.value;

        if (twa !== undefined) {
          state.liveTWA = twa * 180 / Math.PI;
        }
        if (tws !== undefined) {
          state.liveTWS = tws * 1.94384;
        }
        if (stw !== undefined) {
          state.liveSTW = stw * 1.94384;
        }

        if (!state.motoring && twa !== undefined && tws !== undefined && stw !== undefined && state.recordingActive) {
          recorder.update(state, state.liveTWA, state.liveTWS, state.liveSTW);
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