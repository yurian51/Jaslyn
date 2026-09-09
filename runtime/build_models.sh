#!/usr/bin/env bash
set -euo pipefail
ollama create jaslyn-general -f Modelfile
ollama create jaslyn-code -f runtime/Modelfile.code
ollama create jaslyn-fast -f runtime/Modelfile.fast
