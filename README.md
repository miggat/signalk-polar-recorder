# Signal K Polar Recorder Plugin

The **Signal K Polar Recorder** is a plugin for the Signal K server that automatically records boat performance data (polars) based on wind conditions and vessel speed. It enables sailors to build and refine polar diagrams that can be used for performance routing, race optimization, and sail trim analysis.

---

## ✨ Features

- Record polar data automatically at fixed intervals
- Multiple filters to ensure only valid, stable data points are stored
- Works in the background or manually triggered
- Compatible with signalk-autostate for engine detection
- Fully configurable data sources and thresholds
- Supports both ratio-based and standard deviation-based filtering

---

## ⚙️ Configuration Options

### General

| Setting | Description |
|--------|-------------|
| `sampleInterval` | Interval (in ms) between data samples. Default: `1000`. |
| `automaticRecording` | Always record in the background. |
| `automaticRecordingFile` | File name to store automatic polar recording. |
| `useStdDev` | Use z-score filtering instead of simple ratio checks for stability. |

---

### Data Sources

Configure where data is taken from and (optionally) which `$source` must match.

- `anglePath`, `angleSource` – Wind angle (e.g. `environment.wind.angleTrueWater`)
- `speedPath`, `speedSource` – Wind speed (e.g. `environment.wind.speedTrue`)
- `stwSource` – Source for `navigation.speedThroughWater`
- `cogSource` – Source for `navigation.courseOverGroundTrue`
- `hdgSource` – Source for `navigation.headingTrue`
- `twdSource` – Source for `environment.wind.directionTrue`

---

### Filtering Options

Each filter ensures that only data from steady, valid sailing conditions is recorded.

#### 🛳 Motoring Filter

- `useAutostate` – If `true`, checks the signalk-autostate plugin to ignore motoring periods.
- `maxRevForEngine` – Used only if `useAutostate` is `false`; filters points if engine revs exceed this value.

#### 🧭 COG Filter

- `useCogThreshold` – Only record data when course over ground is stable.
- `minLenghtValidData` – Minimum duration (seconds) of stable COG before accepting data.
- `sameCourseAngleOffset` – Max COG variation (degrees) allowed to consider it stable.

#### 🧭 HDG Filter

- `useHdgThreshold` – Only record data when heading is stable.
- `minLenghtValidData` – Minimum duration (seconds) of stable HDG before accepting data.
- `sameCourseAngleOffset` – Max HDG variation (degrees) allowed.

#### 🌬 TWD Filter

- `useTwdThreshold` – Only record when true wind direction is stable.
- `minStableTwdTime` – Duration (seconds) of stable TWD required.
- `sameTwdAngleOffset` – Max variation in TWD (degrees).

#### ⛵️ VMG Filter

- `useVmgThreshold` – Filter based on STW to expected polar boat speed ratio.
- `vmgRatioThresholdUp` – Upper allowed ratio (e.g. 1.1)
- `vmgRatioThresholdDown` – Lower allowed ratio (e.g. 0.8)

#### ⚡ Speed (STW) Filter

- `useAvgSpeedThreshold` – Enable STW filtering by comparing with short-term average.
- `avgSpeedTimeWindow` – Time window (s) for averaging.
- `avgSpeedThresholdUp` / `Down` – Ratio or z-score limits.

#### 🌬 TWS Filter

- Same logic as speed filter, applied to **True Wind Speed**.

#### ⛵ TWA Filter

- Same logic as speed filter, applied to **True Wind Angle**.

---

## 📁 Output

The plugin writes polar data to JSON files, either automatically (`auto-recording-polar.json`) or via manual triggers. The structure follows:

```json
{
  "45": {
    "6": 5.2,
    "8": 5.6
  },
  "60": {
    "6": 5.8,
    "8": 6.2
  }
}
```

# Changelog

## [1.0.1] - 2025-08-09

### Fixed



## [1.0.0] - 2025-08-03

### Changed

- Added readme

## [0.0.19] - 2025-08-03

### Changed

- Added HDG stability filter
- Now each path can be setup with each own source
- Improvements on filter efficiency

## [0.0.18] - 2025-07-09

### Fixed

- Support for absolute path for auto-recording file

### Changed

- Improved admin UI
- COG and TWD stability are now optional
- Manual recording has been completely rewritten
- Now you can chose to detect if motoring either with signalk-autostate or by max rev.

## [0.0.17] - 2025-07-09

### Fixed
- Restored StdDev algoritmh, that was magically removed

## [0.0.16] - 2025-07-09

### Added
- New TWD stability filter.

## [0.0.14] - 2025-07-08

### Fixed
- **WebSocket reconnection**: Properly allow client websocket reconnection

## [0.0.13] - 2025-07-08

### Added
- New global option: `useStdDev` (boolean, default `true`).
  - When enabled, average-based filters (`STW`, `TWA`, `TWS`) now use **standard deviation (z-score)** logic.
  - Allows outlier detection and better filtering of transient anomalies such as wave-induced speed variations.
- All average-based filters (e.g. `avgSpeedThresholdUp`, `avgTwaThresholdUp`) support z-score limits when `useStdDev` is active.

### Changed
- Filters now dynamically switch behavior based on `useStdDev`:
  - If `true`: filters accept values within `± threshold` standard deviations from the mean.
  - If `false`: fallback to ratio comparisons like `current / avg`.

### Affected Filters
| Signal | Time Window | Enabled By               | Upper Threshold             | Notes                        |
|--------|-------------|--------------------------|------------------------------|------------------------------|
| STW    | `avgSpeedTimeWindow` | `useAvgSpeedThreshold` | `avgSpeedThresholdUp`       | Uses z-score or ratio        |
| TWA    | `avgTwaTimeWindow`   | `useAvgTwaThreshold`   | `avgTwaThresholdUp`         | Uses z-score or ratio        |
| TWS    | `avgTwsTimeWindow`   | `useAvgTwsThreshold`   | `avgTwsThresholdUp`         | Uses z-score or ratio        |

###  Example
```json
{
  "useAvgSpeedThreshold": true,
  "avgSpeedTimeWindow": 5,
  "avgSpeedThresholdUp": 2,
  "useStdDev": true
}
```


## [0.0.11] - 2025-07-08

### Added
- This readme

## [0.0.10] - 2025-07-08

### Added
- **VMG Ratio Filtering**: Added support to filter recorded points based on the STW/VMG ratio. If VMG is negative and STW is positive, the ratio is set to 1000 to indicate invalid sailing direction.
- **Average Speed Time Window Filtering**: Added a second filter to discard data points when STW deviates too much from the average STW over a configurable time window.
- **New plugin options**:
  - `useVmgThreshold`: toggle VMG ratio filter.
  - `vmgPath`: custom path for VMG data.
  - `vmgRatioThresholdUp` and `vmgRatioThresholdDown`: thresholds for valid VMG ratio range.
  - `useAvgSpeedThreshold`: toggle average speed filter.
  - `avgSpeedTimeWindow`: size of time window for STW average.
  - `avgSpeedThresholdUp` and `avgSpeedThresholdDown`: thresholds for valid STW deviation.

### Fixed
- **setInterval leak on plugin reload**: Properly cancels the periodic recording loop when `stop()` is called by persisting `state.interval` and clearing it on shutdown. This prevents duplicated execution after changing plugin settings in Signal K.

