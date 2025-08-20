#!/bin/bash

# Script untuk membersihkan virtual environment

echo "=== Cleaning up Camera Dummy Environment ==="

# Deactivate virtual environment if active
if [[ "$VIRTUAL_ENV" != "" ]]; then
    echo "🔧 Deactivating virtual environment..."
    deactivate
fi

# Option to remove virtual environment
read -p "Do you want to remove the virtual environment? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -d "venv" ]; then
        echo "🗑️  Removing virtual environment..."
        rm -rf venv
        echo "✅ Virtual environment removed"
    else
        echo "⚠️  Virtual environment directory not found"
    fi
else
    echo "✅ Virtual environment kept"
fi

echo "🎉 Cleanup completed!"
