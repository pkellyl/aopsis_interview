#!/usr/bin/env bash
set -e

# Install Python dependencies
pip install -r requirements.txt

# Install Node dependencies and build frontend
npm install
npm run build
