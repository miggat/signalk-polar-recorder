# Changelog

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

