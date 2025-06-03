#!/bin/bash

# Variables
SOURCE_DIR="/home/pi/projects/polar-recorder"
SIGNALK_DIR="/home/pi/.signalk"
PLUGIN_NAME="polar-recorder"

##################################
# Create Global Link from Source
##################################
echo "===== CREATING GLOBAL LINK ====="
echo "Navigating to source folder: $SOURCE_DIR"
cd "$SOURCE_DIR" || exit

# Create a global npm link for the plugin
echo "Creating global npm link for $PLUGIN_NAME"
sudo npm link

##################################
# Link Plugin to SignalK
##################################
echo "===== LINKING PLUGIN TO SIGNALK ====="
echo "Navigating to SignalK directory: $SIGNALK_DIR"
cd "$SIGNALK_DIR" || exit

# Link the plugin to SignalK
echo "Linking $PLUGIN_NAME to SignalK"
sudo npm link "$PLUGIN_NAME"

##################################
# Restart SignalK
##################################
echo "===== RESTARTING SIGNALK ====="
sudo systemctl restart signalk

##################################
# Completion
##################################
echo "Deployment and registration completed. Check SignalK to ensure the plugin is loaded."
